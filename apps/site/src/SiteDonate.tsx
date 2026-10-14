import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { lastValueFrom, toArray } from 'rxjs'
import { use$, useActiveAccount, useEventStore } from 'applesauce-react/hooks'
import { verifyEvent } from 'nostr-tools'
import { QRCodeSVG } from 'qrcode.react'
import { HandHeart, Zap } from 'lucide-react'
import { instanceRelays, type InstanceConfig } from '@nostube/core/instance-config'
import { useNostubeHost } from '@nostube/widgets/host'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { Button } from '@nostube/widgets/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { SiteAuthDialog } from './AuthArea'
import {
  PAYMENT_TARGETS_KIND,
  PAYMENT_TYPE_LABELS,
  paymentTargets,
  type PaymentTarget,
} from './payment-targets'
import { useZapProvider, ZapPanel } from './SiteZap'
import { lnurlFromProfile, validZapReceipts, type ZapEndpoint, type ZapReceipt } from './zap'

/** The creator's payment targets (NIP-A3), from their newest kind 10133 that verifies. */
function usePaymentTargets(pubkey: string, relays: string[]): PaymentTarget[] {
  const { pool } = useNostubeHost()
  const [loaded, setLoaded] = useState<{ pubkey: string; targets: PaymentTarget[] }>()
  const relaysKey = relays.join(',')
  useEffect(() => {
    let cancelled = false
    const request = pool.request(relaysKey.split(','), [
      { kinds: [PAYMENT_TARGETS_KIND], authors: [pubkey], limit: 1 },
    ])
    lastValueFrom(request.pipe(toArray()), { defaultValue: [] })
      .then(events => {
        // A relay could hand out someone else's addresses: only the creator's signature counts.
        const newest = events
          .filter(e => e.pubkey === pubkey && e.kind === PAYMENT_TARGETS_KIND && verifyEvent(e))
          .sort((a, b) => b.created_at - a.created_at)[0]
        if (!cancelled) setLoaded({ pubkey, targets: newest ? paymentTargets(newest) : [] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pool, pubkey, relaysKey])
  return loaded?.pubkey === pubkey ? loaded.targets : []
}

/** Validated receipts of zaps of the profile itself, from the moment the zap panel opened. */
function useProfileZapReceipts(pubkey: string, endpoint?: ZapEndpoint): ZapReceipt[] {
  const eventStore = useEventStore()
  const { pool, relays } = useNostubeHost()
  // A receipt follows its invoice; the minute covers a provider clock behind ours.
  const [since] = useState(() => Math.floor(Date.now() / 1000) - 60)
  useEffect(() => {
    const sub = pool
      .subscription(relays.zap, [{ kinds: [9735], '#p': [pubkey], since }])
      .subscribe({
        next: event => {
          if (typeof event !== 'string' && 'kind' in event) eventStore.add(event)
        },
        error: err => console.error('Error fetching zaps:', err),
      })
    return () => sub.unsubscribe()
  }, [pool, relays.zap, pubkey, since, eventStore])
  const zaps = use$(
    () => eventStore.timeline({ kinds: [9735], '#p': [pubkey], since }),
    [eventStore, pubkey, since]
  )
  return useMemo(
    () => (endpoint && zaps ? validZapReceipts(zaps, { endpoint, recipient: pubkey }) : []),
    [zaps, endpoint, pubkey]
  )
}

function ProfileZap({
  pubkey,
  lnurl,
  relays,
  onClose,
  onPayingChange,
}: {
  pubkey: string
  lnurl: string
  relays: string[]
  onClose: () => void
  onPayingChange: (paying: boolean) => void
}) {
  const provider = useZapProvider(lnurl)
  const receipts = useProfileZapReceipts(pubkey, provider.endpoint)
  return (
    <ZapPanel
      recipient={pubkey}
      relays={relays}
      at={0}
      provider={provider}
      receipts={receipts}
      onClose={onClose}
      onPayingChange={onPayingChange}
    />
  )
}

function PaymentTargetItem({ target }: { target: PaymentTarget }) {
  const { t } = useTranslation()
  const [qr, setQr] = useState(false)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <li className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{PAYMENT_TYPE_LABELS[target.type] ?? target.type}</p>
      <p className="break-all font-mono text-xs">{target.address}</p>
      {qr && (
        <div className="flex justify-center rounded-lg bg-white p-3">
          <QRCodeSVG value={target.uri ?? target.address} size={180} level="M" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(target.address).then(
              () => setCopy('copied'),
              () => setCopy('failed')
            )
          }
        >
          {copy === 'copied' ? t('site.donate.copied') : t('site.donate.copy')}
        </Button>
        <Button variant="outline" size="sm" aria-pressed={qr} onClick={() => setQr(v => !v)}>
          {t('site.donate.qr')}
        </Button>
        {target.uri && (
          <Button variant="outline" size="sm" asChild>
            <a href={target.uri}>{t('site.zap.openWallet')}</a>
          </Button>
        )}
      </div>
      {copy === 'failed' && <p className="text-sm text-red-600">{t('site.donate.copyFailed')}</p>}
    </li>
  )
}

/**
 * The site's "Support" button: one dialog with a Lightning zap of the creator's profile
 * (NIP-57) and their other payment addresses (NIP-A3). Nothing when the creator has neither.
 */
export function SiteDonate({ pubkey, config }: { pubkey: string; config: InstanceConfig }) {
  const { t } = useTranslation()
  const account = useActiveAccount()
  const relays = config.interactionRelays
  const profile = useProfile({ pubkey, relays })
  const lnurl = profile ? lnurlFromProfile(profile) : null
  const targets = usePaymentTargets(pubkey, instanceRelays(config))
  const [open, setOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [paying, setPaying] = useState(false)

  if (!lnurl && targets.length === 0) return null
  const name = profile?.display_name || profile?.name || config.title

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <HandHeart className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">{t('site.donate.button')}</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={next => {
          if (next || !paying) setOpen(next)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('site.donate.title', { name })}</DialogTitle>
            <DialogDescription>{t('site.donate.description')}</DialogDescription>
          </DialogHeader>
          {lnurl && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4" />
                {t('site.donate.lightning')}
              </h3>
              {account ? (
                <ProfileZap
                  pubkey={pubkey}
                  lnurl={lnurl}
                  relays={relays}
                  onClose={() => setOpen(false)}
                  onPayingChange={setPaying}
                />
              ) : (
                <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)}>
                  {t('site.zap.signIn')}
                </Button>
              )}
            </section>
          )}
          {targets.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('site.donate.other')}</h3>
              <ul className="space-y-2">
                {targets.map(target => (
                  <PaymentTargetItem key={`${target.type} ${target.address}`} target={target} />
                ))}
              </ul>
            </section>
          )}
        </DialogContent>
      </Dialog>

      {!account && (
        <SiteAuthDialog
          action="zap"
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={() => setAuthOpen(false)}
          relays={relays}
        />
      )}
    </>
  )
}
