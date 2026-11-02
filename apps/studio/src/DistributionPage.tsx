import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { nip19 } from 'nostr-tools'
import { Button } from '@nostube/widgets/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { Textarea } from '@nostube/widgets/components/textarea'
import { loadNsite, type AdminState, type NsiteDelivery, type NsiteStatus } from './api'
import type { PageProps } from './AppearancePage'
import { publishNsiteTracked } from './delivery'
import { FeatureCard, Field } from './fields'
import { MirrorCard } from './MirrorCard'
import { PageHeader } from './PageHeader'
import { ReachChoice } from './ReachChoice'
import { useSigner } from './signer-context'

type DistributionProps = PageProps & { state: AdminState; dirty: boolean }

/**
 * Who can find the videos: the reach, the copies on other servers and the nsite. `canBePublic`
 * is the server's answer for the draft's mirror lists.
 */
export function DistributionPage({
  draft,
  update,
  state,
  dirty,
  canBePublic,
}: DistributionProps & { canBePublic: boolean }) {
  const { t } = useTranslation()
  const { mode } = useSigner()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.distribution')}
        description={t('studio.page.distribution.description')}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.reach.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReachChoice
            reach={draft.reach}
            onChange={reach => update({ reach })}
            canBePublic={canBePublic}
            originIsPublic={state.originIsPublic}
            own={mode === 'own'}
          />
        </CardContent>
      </Card>
      <MirrorSection draft={draft} update={update} state={state} />
      <NsiteCard draft={draft} update={update} state={state} dirty={dirty} />
      <p className="text-sm text-muted-foreground">
        <Trans
          i18nKey="studio.instance.fixed"
          values={{ origin: state.origin, tls: state.tls }}
          components={{ code: <code /> }}
        />
      </p>
    </div>
  )
}

/** Mirroring is on while a target is listed; switching it off empties both lists. */
function MirrorSection({ draft, update, state }: PageProps & { state: AdminState }) {
  const { t } = useTranslation()
  const hasTargets = Boolean(draft.mirrorRelaysText.trim() || draft.mirrorBlossomText.trim())
  const [open, setOpen] = useState(false)
  // Switching off clears the lists; switching on again before saving brings them back.
  const stash = useRef({ mirrorRelaysText: '', mirrorBlossomText: '' })
  const on = open || hasTargets
  // A Public instance without a public address lives on its mirrors: they cannot go.
  const required = on && draft.reach === 'public' && !state.originIsPublic
  const list = (id: string, key: 'mirrorRelaysText' | 'mirrorBlossomText', name: string) => (
    <Field id={id} label={t(`studio.instance.${name}`)} hint={t(`studio.instance.${name}Hint`)}>
      <Textarea
        id={id}
        rows={3}
        className="font-mono text-xs"
        spellCheck={false}
        value={draft[key]}
        onChange={e => update({ [key]: e.target.value })}
      />
    </Field>
  )
  return (
    <>
      <FeatureCard
        title={t('studio.instance.mirrorTitle')}
        description={t('studio.instance.mirrorDescription')}
        checked={on}
        disabled={required}
        note={required ? t('studio.distribution.mirrorRequired') : undefined}
        onCheckedChange={next => {
          setOpen(next)
          if (next) {
            if (!hasTargets) update(stash.current)
          } else {
            stash.current = {
              mirrorRelaysText: draft.mirrorRelaysText,
              mirrorBlossomText: draft.mirrorBlossomText,
            }
            update({ mirrorRelaysText: '', mirrorBlossomText: '' })
          }
        }}
      >
        {list('mirror-relays', 'mirrorRelaysText', 'mirrorRelays')}
        {list('mirror-blossom', 'mirrorBlossomText', 'mirrorBlossom')}
      </FeatureCard>
      {/* The outbox status (it hides itself while nothing was ever queued). */}
      <MirrorCard />
    </>
  )
}

/** Publishing always uses saved settings; the draft URL is a preview until Save and apply. */
function NsiteCard({ draft, update, state, dirty }: DistributionProps) {
  const { t, i18n } = useTranslation()
  const { mode, pubkey } = useSigner()
  const [status, setStatus] = useState<NsiteStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    let live = true
    let timer: number | undefined
    const refresh = async () => {
      try {
        const next = await loadNsite()
        if (live) {
          setStatus(next)
          setError(null)
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (live) timer = window.setTimeout(() => void refresh(), 5000)
      }
    }
    void refresh()
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [])

  const publish = async () => {
    setPublishing(true)
    setError(null)
    try {
      // The activity follows the delivery after this card is gone; the card's status follows too.
      await publishNsiteTracked(t('studio.nsite.publish'), setStatus)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishing(false)
    }
  }
  const available = mode === 'managed' && draft.reach === 'public'
  const gatewayHost = pubkey ? `${nip19.npubEncode(pubkey)}.${draft.nsiteGateway.trim()}` : null
  const url = draft.nsiteDomain.trim()
    ? `https://${draft.nsiteDomain.trim()}`
    : gatewayHost
      ? `https://${gatewayHost}`
      : null
  const on = draft.siteHosting === 'nsite'
  return (
    <FeatureCard
      title={t('studio.nsite.nsite')}
      description={t('studio.nsite.nsiteBody')}
      checked={on}
      disabled={!available && !on}
      onCheckedChange={next => update({ siteHosting: next ? 'nsite' : 'instance' })}
      note={
        !available
          ? t(mode === 'managed' ? 'studio.nsite.publicRequired' : 'studio.nsite.managedRequired')
          : !on && status?.retained
            ? t('studio.nsite.retained')
            : undefined
      }
    >
      <Field
        id="nsite-gateway"
        label={t('studio.nsite.gateway')}
        hint={t('studio.nsite.gatewayHint')}
      >
        <Input
          id="nsite-gateway"
          value={draft.nsiteGateway}
          placeholder="nsite.lol"
          onChange={e => update({ nsiteGateway: e.target.value })}
        />
      </Field>
      <Field id="nsite-domain" label={t('studio.nsite.domain')} hint={t('studio.nsite.domainHint')}>
        <Input
          id="nsite-domain"
          value={draft.nsiteDomain}
          placeholder="videos.example.org"
          onChange={e => update({ nsiteDomain: e.target.value })}
        />
      </Field>
      {gatewayHost && (
        <p className="break-all text-sm">{t('studio.nsite.cname', { host: gatewayHost })}</p>
      )}
      {url && (
        <p className="break-all text-sm">
          {t('studio.nsite.url')}{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            {url}
          </a>
        </p>
      )}
      <Button
        type="button"
        onClick={() => void publish()}
        disabled={
          dirty ||
          state.config.siteHosting !== 'nsite' ||
          state.config.reach !== 'public' ||
          publishing ||
          status?.status === 'pending'
        }
      >
        {t(publishing ? 'studio.nsite.publishing' : 'studio.nsite.publish')}
      </Button>
      {dirty && <p className="text-sm text-muted-foreground">{t('studio.nsite.saveFirst')}</p>}
      <p className="text-sm text-muted-foreground">{t('studio.nsite.cache')}</p>
      {status && (
        <div className="space-y-2 text-sm" role="status" aria-live="polite">
          <p>{t(`studio.nsite.status.${status.status}`)}</p>
          {status.aggregate && (
            <dl>
              <dt>{t('studio.nsite.version')}</dt>
              <dd className="break-all font-mono text-xs">{status.aggregate}</dd>
              {status.publishedAt !== null && (
                <>
                  <dt>{t('studio.nsite.publishedAt')}</dt>
                  <dd>
                    <time dateTime={new Date(status.publishedAt * 1000).toISOString()}>
                      {new Date(status.publishedAt * 1000).toLocaleString(i18n.resolvedLanguage)}
                    </time>
                  </dd>
                </>
              )}
            </dl>
          )}
          {status.retained && <p>{t('studio.nsite.retained')}</p>}
          <Deliveries
            title={t('studio.nsite.relays', {
              done: status.relays.filter(r => r.status === 'done').length,
              total: status.relays.length,
            })}
            rows={status.relays}
          />
          <Deliveries
            title={t('studio.nsite.servers', {
              done: status.servers.filter(s => s.status === 'done').length,
              total: status.servers.length,
            })}
            rows={status.servers}
          />
          {status.error &&
            ![...status.relays, ...status.servers].some(r => r.error === status.error) && (
              <p role="alert" className="text-destructive">
                {status.error}
              </p>
            )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </FeatureCard>
  )
}

const deliveryClass = {
  done: '',
  pending: 'text-muted-foreground',
  failed: 'text-destructive',
}

/** Which relays or Blossom servers have the shown version, with each one's last error. */
function Deliveries({
  title,
  rows,
}: {
  title: string
  rows: (NsiteDelivery & { done?: number; total?: number })[]
}) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="space-y-1">
        {rows.map(row => (
          <li key={row.target}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <code className="break-all text-xs">{row.target}</code>
              <span className={deliveryClass[row.status]}>
                {t(`studio.nsite.delivery.${row.status}`)}
                {row.total !== undefined &&
                  ` · ${t('studio.nsite.files', { done: row.done, total: row.total })}`}
              </span>
            </div>
            {row.error && <p className="break-all text-xs text-destructive">{row.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
