import { useEffect, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { nip19 } from 'nostr-tools'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { loadNsite, publishNsite, type AdminState, type NsiteStatus } from './api'
import { draftCanBePublic } from './draft'
import { Field, Tile } from './fields'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { KeyList } from './KeyList'
import { ReachChoice } from './ReachChoice'
import { useSigner } from './signer-context'
import type { PageProps } from './AppearancePage'

/** Key lists show the keys' profiles through the instance client; without it the keys show bare. */
export function WithKeyProfiles({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState<InstanceClient | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, () => {})
  }, [])
  return booted ? (
    <InstanceProviders client={booted.client} config={booted.config}>
      {children}
    </InstanceProviders>
  ) : (
    <>{children}</>
  )
}

/** The settings every owner meets: reach, whose videos the site shows, search and storage. */
export function InstancePage({
  draft,
  update,
  state,
  dirty = false,
}: PageProps & { state: AdminState; dirty?: boolean }) {
  const { t } = useTranslation()
  const { mode } = useSigner()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.reach.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReachChoice
            reach={draft.reach}
            onChange={reach => update({ reach })}
            canBePublic={draftCanBePublic(state.originIsPublic, draft)}
            originIsPublic={state.originIsPublic}
            own={mode === 'own'}
          />
        </CardContent>
      </Card>

      <NsiteCard draft={draft} update={update} state={state} dirty={dirty} />

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.creatorsTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.creatorsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <WithKeyProfiles>
            <KeyList
              id="creators"
              label={t('studio.instance.creators')}
              hint={t('studio.instance.creatorsHint')}
              firstLabel={t('studio.instance.startPage')}
              text={draft.creatorsText}
              onChange={creatorsText => update({ creatorsText })}
            />
          </WithKeyProfiles>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.search')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="search-mode"
            label={t('studio.instance.search')}
            hint={t('studio.instance.searchHint')}
          >
            <select
              id="search-mode"
              value={draft.searchMode}
              onChange={e => update({ searchMode: e.target.value as typeof draft.searchMode })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="off">{t('studio.instance.searchModes.off')}</option>
              <option value="local">{t('studio.instance.searchModes.local')}</option>
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.storage')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="quota"
            label={t('studio.instance.quota')}
            hint={t('studio.instance.quotaHint')}
          >
            <Input
              id="quota"
              type="number"
              min={0}
              value={draft.quota}
              onChange={e => update({ quota: e.target.value })}
            />
          </Field>
          <Field id="reserve" label={t('studio.instance.reserve')}>
            <Input
              id="reserve"
              type="number"
              min={0}
              value={draft.reserve}
              onChange={e => update({ reserve: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

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

/** Publishing always uses saved settings; the draft URL is a preview until Save and apply. */
function NsiteCard({
  draft,
  update,
  state,
  dirty,
}: PageProps & { state: AdminState; dirty: boolean }) {
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
      await publishNsite()
      setStatus(await loadNsite())
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studio.nsite.title')}</CardTitle>
        <CardDescription>{t('studio.nsite.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Tile
            title={t('studio.nsite.instance')}
            selected={draft.siteHosting === 'instance'}
            onSelect={() => update({ siteHosting: 'instance' })}
          >
            <span className="block">{t('studio.nsite.instanceBody')}</span>
            <code className="block break-all text-xs">{state.origin}</code>
          </Tile>
          <Tile
            title={t('studio.nsite.nsite')}
            selected={draft.siteHosting === 'nsite'}
            disabled={!available}
            onSelect={() => update({ siteHosting: 'nsite' })}
          >
            <span className="block">{t('studio.nsite.nsiteBody')}</span>
            <code className="block break-all text-xs">{url ?? draft.nsiteGateway}</code>
          </Tile>
        </div>
        {!available ? (
          <p className="text-sm text-muted-foreground">
            {t(mode === 'managed' ? 'studio.nsite.publicRequired' : 'studio.nsite.managedRequired')}
          </p>
        ) : (
          <>
            {draft.siteHosting === 'nsite' && (
              <>
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
                <Field
                  id="nsite-domain"
                  label={t('studio.nsite.domain')}
                  hint={t('studio.nsite.domainHint')}
                >
                  <Input
                    id="nsite-domain"
                    value={draft.nsiteDomain}
                    placeholder="videos.example.org"
                    onChange={e => update({ nsiteDomain: e.target.value })}
                  />
                </Field>
                {gatewayHost && (
                  <p className="break-all text-sm">
                    {t('studio.nsite.cname', { host: gatewayHost })}
                  </p>
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
                {dirty && (
                  <p className="text-sm text-muted-foreground">{t('studio.nsite.saveFirst')}</p>
                )}
                <p className="text-sm text-muted-foreground">{t('studio.nsite.cache')}</p>
              </>
            )}
          </>
        )}
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
            {status.error && (
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
      </CardContent>
    </Card>
  )
}
