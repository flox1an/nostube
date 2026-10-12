import { useEffect, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { nip19, type Filter, type NostrEvent } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'
import { DEFAULT_PROFILE_RELAYS } from '@nostube/core/instance-config'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { Textarea } from '@nostube/widgets/components/textarea'
import {
  loadStats,
  nip07,
  nostrPost,
  saveConfig,
  waitForRestart,
  type AdminState,
} from './api'
import { Field } from './fields'
import {
  identityChoices,
  publishingPreset,
  wizardConfig,
  type Identity,
  type Publishing,
  type PublishingLists,
} from './onboarding-config'
import { bytesText } from './OverviewPage'
import { hashFor } from './route'
import { useSigner } from './signer-context'

/** What the wizard needs of a relay pool: find the owner's profile, copy it to the instance. */
export interface ProfilePool {
  get(relays: string[], filter: Filter, params?: { maxWait?: number }): Promise<NostrEvent | null>
  publish(relays: string[], event: NostrEvent): Promise<string>[]
}

const STEPS = ['identity', 'publishing', 'site', 'summary'] as const

/** A choice that fills its column; `selected` marks the one taken. */
function Tile({
  title,
  selected,
  onSelect,
  disabled,
  children,
}: {
  title: string
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`space-y-2 rounded-md border p-4 text-left text-sm transition-colors disabled:opacity-50 ${
        selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:bg-muted'
      }`}
    >
      <span className="block text-base font-medium">{title}</span>
      {children}
    </button>
  )
}

/**
 * First run: sets a new instance up in one pass (identity, publishing, site) and saves the config
 * once at Finish. It shows while the instance has no creator and cannot be skipped.
 */
export function Onboarding({
  state,
  onFinished,
  pool,
}: {
  state: AdminState
  /** After the save (and the restart): the studio loads afresh. */
  onFinished: () => void
  /** Reads the owner's profile from public relays and writes it to the instance relay. */
  pool?: ProfilePool
}) {
  const { t, i18n } = useTranslation()
  const { status, mode, pubkey: signerKey, connect, createManaged, error: signerError } = useSigner()
  const [step, setStep] = useState(0)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [ownKey, setOwnKey] = useState<string | null>(null)
  const [bindLogin, setBindLogin] = useState(false)
  const [publishing, setPublishing] = useState<Publishing | null>(null)
  const [lists, setLists] = useState<PublishingLists>(() => publishingPreset('local'))
  const [title, setTitle] = useState(state.config.title)
  const [tagline, setTagline] = useState(state.config.site.tagline)
  const [freeDisk, setFreeDisk] = useState<number | null>(null)
  const [phase, setPhase] = useState<null | 'finishing' | 'restarting' | 'stalled'>(null)
  const [error, setError] = useState<string | null>(null)

  const current = STEPS[step]
  useEffect(() => {
    if (current !== 'summary') return
    let live = true
    loadStats().then(
      stats => live && setFreeDisk(stats.blossom.freeDiskBytes),
      () => {} // the summary leaves the line out
    )
    return () => {
      live = false
    }
  }, [current])

  if (status === 'loading') return <Skeleton className="h-64 w-full" />

  const extension = nip07() !== undefined
  const managedKey = mode === 'managed' ? signerKey : null
  const choices = identityChoices({ extension, managedKey: managedKey !== null })
  const wizard = { identity: identity ?? 'channel', title, tagline, ...lists }
  const checked = wizardConfig(state.config, wizard, null)
  const busy = phase !== null

  const chooseOwn = async () => {
    setError(null)
    try {
      setOwnKey(await connect())
      setIdentity('own')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const choosePublishing = (next: Publishing) => {
    setPublishing(next)
    setLists(publishingPreset(next))
  }

  const finish = async () => {
    setError(null)
    setPhase('finishing')
    try {
      const pubkey = identity === 'own' ? ownKey! : (managedKey ?? (await createManaged()))
      const result = wizardConfig(state.config, wizard, pubkey)
      if (!result.config) throw new Error(result.errors.join(' '))
      const relays = pool ?? new SimplePool()
      // Own identity: the owner's signed profile, copied unchanged once the key may write here.
      const profile =
        identity === 'own'
          ? await relays
              .get(DEFAULT_PROFILE_RELAYS, { kinds: [0], authors: [pubkey] }, { maxWait: 4000 })
              .catch(() => null)
          : null
      if (identity === 'own' || bindLogin) await nostrPost('/admin/bind-nostr')
      const { restart } = await saveConfig(result.config)
      if (restart) {
        setPhase('restarting')
        if (!(await waitForRestart(state.bootId))) return setPhase('stalled')
      }
      if (profile) {
        await Promise.allSettled(
          relays.publish([state.origin.replace(/^https:/, 'wss:')], profile)
        )
      }
      onFinished()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase(null)
    }
  }

  const canGoOn =
    current === 'identity'
      ? identity === 'channel' || (identity === 'own' && ownKey !== null)
      : current === 'publishing'
        ? publishing !== null
        : true

  const listField = (id: keyof PublishingLists, label: string) => (
    <Field id={id} label={label} hint={t('studio.onboarding.publishing.oneLine')}>
      <Textarea
        id={id}
        rows={3}
        className="font-mono text-xs"
        spellCheck={false}
        value={lists[id]}
        onChange={e => setLists(l => ({ ...l, [id]: e.target.value }))}
      />
    </Field>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studio.onboarding.title')}</CardTitle>
        <CardDescription>
          {t('studio.onboarding.stepOf', { step: step + 1, total: STEPS.length })}
          {' · '}
          {t(`studio.onboarding.steps.${current}`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signerError && <p className="text-sm text-destructive">{signerError}</p>}

        {current === 'identity' && (
          <>
            <p className="text-sm">{t('studio.onboarding.identity.intro')}</p>
            <div className={`grid gap-3 ${choices.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {choices.includes('own') && (
                <Tile
                  title={t('studio.onboarding.identity.ownTitle')}
                  selected={identity === 'own'}
                  onSelect={() => void chooseOwn()}
                >
                  <span className="block">{t('studio.onboarding.identity.ownBody')}</span>
                  {identity === 'own' && ownKey && (
                    <code className="block break-all text-xs">{nip19.npubEncode(ownKey)}</code>
                  )}
                </Tile>
              )}
              <Tile
                title={t('studio.onboarding.identity.channelTitle')}
                selected={identity === 'channel'}
                onSelect={() => setIdentity('channel')}
              >
                <span className="block">{t('studio.onboarding.identity.channelBody')}</span>
              </Tile>
            </div>
            {identity === 'channel' && extension && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bindLogin}
                  onChange={e => setBindLogin(e.target.checked)}
                />
                {t('studio.onboarding.identity.loginWithNostr')}
              </label>
            )}
            {!extension && (
              <p className="text-sm text-muted-foreground">
                {t('studio.onboarding.identity.noExtension')}
              </p>
            )}
          </>
        )}

        {current === 'publishing' && (
          <>
            <p className="text-sm">{t('studio.onboarding.publishing.intro')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Tile
                title={t('studio.onboarding.publishing.localTitle')}
                selected={publishing === 'local'}
                onSelect={() => choosePublishing('local')}
              >
                <span className="block">{t('studio.onboarding.publishing.localBody')}</span>
              </Tile>
              <Tile
                title={t('studio.onboarding.publishing.networkTitle')}
                selected={publishing === 'network'}
                onSelect={() => choosePublishing('network')}
              >
                <span className="block">{t('studio.onboarding.publishing.networkBody')}</span>
                <span className="block text-muted-foreground">
                  {identity === 'own'
                    ? t('studio.onboarding.publishing.networkOwn')
                    : t('studio.onboarding.publishing.networkChannel')}
                </span>
              </Tile>
            </div>
            {publishing && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {t('studio.onboarding.publishing.advanced')}
                </summary>
                <div className="space-y-3 pt-3">
                  {listField('mirrorRelaysText', t('studio.onboarding.publishing.mirrorRelays'))}
                  {identity === 'channel' &&
                    listField('mirrorBlossomText', t('studio.onboarding.publishing.mirrorBlossom'))}
                  {listField('profileRelaysText', t('studio.onboarding.publishing.profileRelays'))}
                </div>
              </details>
            )}
          </>
        )}

        {current === 'site' && (
          <>
            <Field id="title" label={t('studio.appearance.title')}>
              <Input id="title" value={title} onChange={e => setTitle(e.target.value)} />
            </Field>
            <Field
              id="tagline"
              label={t('studio.appearance.tagline')}
              hint={t('studio.appearance.optional')}
            >
              <Input id="tagline" value={tagline} onChange={e => setTagline(e.target.value)} />
            </Field>
            <p className="text-sm text-muted-foreground">
              <Trans
                i18nKey="studio.onboarding.site.appearance"
                components={{
                  link: <a href={hashFor('appearance')} className="underline" />,
                }}
              />
            </p>
          </>
        )}

        {current === 'summary' && (
          <>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">{t('studio.onboarding.summary.identity')}</dt>
              <dd>
                {identity === 'own'
                  ? `${t('studio.onboarding.identity.ownTitle')} (${nip19.npubEncode(ownKey!)})`
                  : t('studio.onboarding.identity.channelTitle')}
              </dd>
              <dt className="text-muted-foreground">{t('studio.onboarding.summary.login')}</dt>
              <dd>
                {identity === 'own' || bindLogin
                  ? t('studio.onboarding.summary.loginNostr')
                  : t('studio.onboarding.summary.loginPassword')}
              </dd>
              <dt className="text-muted-foreground">
                {t('studio.onboarding.steps.publishing')}
              </dt>
              <dd>
                {publishing === 'network'
                  ? t('studio.onboarding.publishing.networkTitle')
                  : t('studio.onboarding.publishing.localTitle')}
              </dd>
              {checked.config && (
                <>
                  <dt className="text-muted-foreground">
                    {t('studio.onboarding.publishing.mirrorRelays')}
                  </dt>
                  <dd className="break-all">
                    {checked.config.mirror.relays.join(', ') ||
                      t('studio.onboarding.summary.none')}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t('studio.onboarding.publishing.mirrorBlossom')}
                  </dt>
                  <dd className="break-all">
                    {checked.config.mirror.blossom.join(', ') ||
                      t('studio.onboarding.summary.none')}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t('studio.onboarding.publishing.profileRelays')}
                  </dt>
                  <dd className="break-all">
                    {checked.config.profileRelays.join(', ') ||
                      t('studio.onboarding.summary.localOnly')}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('studio.appearance.title')}</dt>
              <dd>{title}</dd>
              {tagline.trim() && (
                <>
                  <dt className="text-muted-foreground">{t('studio.appearance.tagline')}</dt>
                  <dd>{tagline}</dd>
                </>
              )}
              {freeDisk !== null && (
                <>
                  <dt className="text-muted-foreground">
                    {t('studio.onboarding.summary.freeDisk')}
                  </dt>
                  <dd>{bytesText(freeDisk, i18n.resolvedLanguage)}</dd>
                </>
              )}
            </dl>
            {checked.errors.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-destructive">
                {checked.errors.map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t('studio.onboarding.summary.hint')}</p>
          </>
        )}

        {phase === 'stalled' && (
          <Alert variant="destructive">
            <AlertTitle>{t('studio.app.stalledTitle')}</AlertTitle>
            <AlertDescription>
              <Trans i18nKey="studio.app.stalledBody" components={{ code: <code /> }} />
            </AlertDescription>
          </Alert>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setStep(s => s - 1)}
            >
              {t('studio.onboarding.back')}
            </Button>
          )}
          {current === 'summary' ? (
            <Button
              type="button"
              disabled={busy || checked.errors.length > 0}
              onClick={() => void finish()}
            >
              {phase === 'restarting'
                ? t('studio.app.restarting')
                : phase === 'finishing'
                  ? t('studio.onboarding.finishing')
                  : t('studio.onboarding.finish')}
            </Button>
          ) : (
            <Button type="button" disabled={!canGoOn} onClick={() => setStep(s => s + 1)}>
              {t('studio.onboarding.next')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
