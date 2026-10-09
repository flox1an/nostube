import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActiveAccount, useEventStore } from 'applesauce-react/hooks'
import { isAddressableKind } from 'nostr-tools/kinds'
import type { NostrEvent } from 'nostr-tools'
import { QRCodeSVG } from 'qrcode.react'
import { Zap } from 'lucide-react'
import type { VideoEvent } from '@nostube/core/video-event'
import { createZapRequest, formatSats, requestInvoice } from '@nostube/core/zap-utils'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { useEventZaps } from '@nostube/widgets/hooks/useEventZaps'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { Label } from '@nostube/widgets/components/label'
import { Checkbox } from '@nostube/widgets/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { AuthDialog } from '@nostube/widgets/components/auth/AuthDialog'
import { formatDuration } from '@nostube/widgets'
import {
  checkInvoice,
  checkZapAmount,
  encodeLnurl,
  lnurlFromProfile,
  resolveZapEndpoint,
  validZapReceipts,
  ZapError,
  type ZapEndpoint,
} from './zap'

declare global {
  interface Window {
    /** An injected WebLN wallet (browser extension). */
    webln?: { enable(): Promise<void>; sendPayment(invoice: string): Promise<unknown> }
  }
}

/**
 * One zap attempt. `gen` ties async results to the attempt that started them; `scope` to the
 * video and account it was made for, so another video or account never sees this invoice.
 */
type Attempt = { gen: number; scope: string; error?: string } & (
  | { step: 'form' }
  | { step: 'creating' }
  | { step: 'invoice'; bolt11: string; requestId: string; paying?: boolean; copied?: boolean }
  | { step: 'paid' }
)

/** The video's Lightning Zap button: validated sats total, and a dialog to zap the creator. */
export function SiteZap({
  video,
  relays,
  currentTime,
}: {
  video: VideoEvent
  relays: string[]
  currentTime: number
}) {
  const { t } = useTranslation()
  const eventStore = useEventStore()
  const account = useActiveAccount()
  const profile = useProfile({ pubkey: video.pubkey, relays })
  const lnurl = profile ? lnurlFromProfile(profile) : null

  // The creator's provider, keyed by the LNURL it came from so a changed profile never uses it.
  const [provider, setProvider] = useState<{
    lnurl: string
    endpoint?: ZapEndpoint
    error?: unknown
  }>()
  const [providerAttempt, setProviderAttempt] = useState(0)
  useEffect(() => {
    if (!lnurl) return
    const controller = new AbortController()
    resolveZapEndpoint(lnurl, controller.signal).then(
      endpoint => {
        if (!controller.signal.aborted) setProvider({ lnurl, endpoint })
      },
      error => {
        if (!controller.signal.aborted) setProvider({ lnurl, error })
      }
    )
    return () => controller.abort()
  }, [lnurl, providerAttempt])
  const current = provider?.lnurl === lnurl ? provider : undefined
  const endpoint = current?.endpoint

  // Only receipts that pass NIP-57 validation against this provider count.
  const { zaps } = useEventZaps({
    eventId: video.id,
    authorPubkey: video.pubkey,
    kind: video.kind,
    identifier: video.identifier,
  })
  const address =
    isAddressableKind(video.kind) && video.identifier
      ? `${video.kind}:${video.pubkey}:${video.identifier}`
      : undefined
  const receipts = useMemo(
    () =>
      endpoint
        ? validZapReceipts(zaps, { endpoint, recipient: video.pubkey, eventId: video.id, address })
        : [],
    [zaps, endpoint, video.pubkey, video.id, address]
  )
  const totalSats = receipts.reduce((sum, receipt) => sum + receipt.sats, 0)

  const scope = `${video.id}|${account?.pubkey ?? ''}`
  const generation = useRef(0)
  const [attempt, setAttempt] = useState<Attempt>({ gen: 0, scope, step: 'form' })
  const shown: Attempt = attempt.scope === scope ? attempt : { gen: -1, scope, step: 'form' }
  const update = (gen: number, next: (previous: Attempt) => Attempt) =>
    setAttempt(previous => (previous.gen === gen ? next(previous) : previous))
  const restart = () => setAttempt({ gen: ++generation.current, scope, step: 'form' })

  const [authOpen, setAuthOpen] = useState(false)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [amount, setAmount] = useState('21')
  const [comment, setComment] = useState('')
  const [at, setAt] = useState(0)
  const [withTimestamp, setWithTimestamp] = useState(false)

  if (!lnurl) return null

  const errorText = (err: unknown, fallback: 'providerFailed' | 'invoiceFailed') => {
    if (err instanceof ZapError) return t(`site.zap.errors.${err.code}`, err.params)
    return t(`site.zap.errors.${fallback}`, {
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  const open = () => {
    if (!account) {
      setAuthOpen(true)
      return
    }
    const seconds = Math.max(0, Math.floor(currentTime))
    setAt(seconds)
    setWithTimestamp(seconds > 0)
    if (endpoint && Number(amount) < endpoint.minSats) setAmount(String(endpoint.minSats))
    restart()
    setOpenFor(video.id)
  }

  const createInvoice = async () => {
    if (!account || !endpoint) return
    const gen = ++generation.current
    setAttempt({ gen, scope, step: 'creating' })
    try {
      const sats = Number(amount)
      checkZapAmount(sats, endpoint)
      const event = eventStore.getEvent(video.id)
      if (!event) throw new ZapError('videoUnavailable')
      const template = createZapRequest({
        recipientPubkey: video.pubkey,
        amount: sats,
        comment: comment.trim() || undefined,
        relays,
        event,
        timestamp: withTimestamp ? at : undefined,
      })
      template.tags.push(['lnurl', encodeLnurl(endpoint.lnurl)])
      let request: NostrEvent
      try {
        request = (await account.signer.signEvent(template)) as unknown as NostrEvent
      } catch (err) {
        throw new ZapError('signFailed', {
          reason: err instanceof Error ? err.message : String(err),
        })
      }
      if (generation.current !== gen) return
      let invoice: string
      try {
        invoice = await requestInvoice(endpoint.callback, sats, request)
      } catch (err) {
        throw new ZapError('invoiceFailed', {
          reason: err instanceof Error ? err.message : String(err),
        })
      }
      const bolt11 = checkInvoice(invoice, sats)
      update(gen, () => ({ gen, scope, step: 'invoice', bolt11, requestId: request.id }))
    } catch (err) {
      update(gen, () => ({ gen, scope, step: 'form', error: errorText(err, 'invoiceFailed') }))
    }
  }

  // Only an invoice step carries wallet/copy state; a stale or replaced attempt is left alone.
  const patchInvoice = (
    gen: number,
    patch: { paying?: boolean; copied?: boolean; error?: string }
  ) => update(gen, previous => (previous.step === 'invoice' ? { ...previous, ...patch } : previous))

  const webln = window.webln
  const payWithWebln = async (bolt11: string) => {
    if (!webln) return
    const gen = shown.gen
    patchInvoice(gen, { paying: true, error: undefined })
    try {
      await webln.enable()
      await webln.sendPayment(bolt11)
      update(gen, () => ({ gen, scope, step: 'paid' }))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      patchInvoice(gen, { paying: false, error: t('site.zap.errors.paymentFailed', { reason }) })
    }
  }

  const copy = async (bolt11: string) => {
    const gen = shown.gen
    try {
      await navigator.clipboard.writeText(bolt11)
      patchInvoice(gen, { copied: true, error: undefined })
    } catch {
      patchInvoice(gen, { error: t('site.zap.errors.copyFailed') })
    }
  }

  // A manual invoice stays pending until its own validated receipt arrives.
  const confirmed =
    shown.step === 'invoice' &&
    receipts.some(r => r.bolt11 === shown.bolt11.toLowerCase() && r.requestId === shown.requestId)
  const paid = shown.step === 'paid' || confirmed
  const paying = shown.step === 'invoice' && shown.paying

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={open}
        title={totalSats > 0 ? t('site.zap.totalTitle', { sats: totalSats }) : undefined}
      >
        <Zap className="h-4 w-4" />
        {totalSats > 0
          ? formatSats(totalSats)
          : account
            ? t('site.zap.button')
            : t('site.zap.signIn')}
      </Button>

      {!account && (
        <AuthDialog
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={() => setAuthOpen(false)}
          relays={relays}
        />
      )}

      <Dialog
        open={openFor === video.id && !!account}
        onOpenChange={next => {
          if (next || paying) return
          setOpenFor(null)
          restart()
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('site.zap.title')}</DialogTitle>
            <DialogDescription>{t('site.zap.description')}</DialogDescription>
          </DialogHeader>

          {paid ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('site.zap.paid')}</p>
              <Button
                onClick={() => {
                  setOpenFor(null)
                  restart()
                }}
              >
                {t('site.zap.close')}
              </Button>
            </div>
          ) : current?.error ? (
            <div className="space-y-3">
              <p className="text-sm text-red-600">{errorText(current.error, 'providerFailed')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setProvider(undefined)
                  setProviderAttempt(n => n + 1)
                }}
              >
                {t('site.zap.retry')}
              </Button>
            </div>
          ) : shown.step === 'invoice' ? (
            <div className="space-y-3">
              <div className="flex justify-center rounded-lg bg-white p-3">
                <QRCodeSVG value={`LIGHTNING:${shown.bolt11.toUpperCase()}`} size={220} level="M" />
              </div>
              <p className="text-sm text-muted-foreground">{t('site.zap.invoiceHint')}</p>
              <Input readOnly value={shown.bolt11} aria-label={t('site.zap.copy')} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void copy(shown.bolt11)}>
                  {shown.copied ? t('site.zap.copied') : t('site.zap.copy')}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`lightning:${shown.bolt11}`}>{t('site.zap.openWallet')}</a>
                </Button>
                {webln && (
                  <Button
                    size="sm"
                    disabled={paying}
                    onClick={() => void payWithWebln(shown.bolt11)}
                  >
                    {paying ? t('site.zap.paying') : t('site.zap.payWebln')}
                  </Button>
                )}
              </div>
              <p className="text-sm" role="status">
                {t('site.zap.waiting')}
              </p>
              {shown.error && <p className="text-sm text-red-600">{shown.error}</p>}
              <Button variant="ghost" size="sm" disabled={paying} onClick={restart}>
                {t('site.zap.cancel')}
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={e => {
                e.preventDefault()
                void createInvoice()
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="site-zap-amount">{t('site.zap.amount')}</Label>
                <Input
                  id="site-zap-amount"
                  type="number"
                  inputMode="numeric"
                  min={endpoint?.minSats ?? 1}
                  max={endpoint?.maxSats}
                  step={1}
                  value={amount}
                  disabled={shown.step === 'creating'}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="site-zap-comment">{t('site.zap.comment')}</Label>
                <Input
                  id="site-zap-comment"
                  value={comment}
                  maxLength={endpoint?.commentAllowed}
                  disabled={shown.step === 'creating'}
                  onChange={e => setComment(e.target.value)}
                />
              </div>
              {at > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="site-zap-timestamp"
                    checked={withTimestamp}
                    disabled={shown.step === 'creating'}
                    onCheckedChange={checked => setWithTimestamp(checked === true)}
                  />
                  <Label htmlFor="site-zap-timestamp">
                    {t('site.zap.includeTimestamp', { time: formatDuration(at) })}
                  </Label>
                </div>
              )}
              {shown.error && <p className="text-sm text-red-600">{shown.error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={!endpoint || shown.step === 'creating'}>
                  {shown.step === 'creating' ? t('site.zap.creating') : t('site.zap.createInvoice')}
                </Button>
                {shown.step === 'creating' && (
                  <Button type="button" variant="ghost" onClick={restart}>
                    {t('site.zap.cancel')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
