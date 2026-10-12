import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { InterfaceLanguageSelect } from '@nostube/widgets/components/InterfaceLanguageSelect'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { AccountPage } from './AccountPage'
import { AppearancePage } from './AppearancePage'
import { Onboarding } from './OnboardingWizard'
import { needsOnboarding } from './onboarding-config'
import { InstancePage } from './InstancePage'
import { Nav } from './Nav'
import { NextSteps } from './NextSteps'
import { OverviewPage } from './OverviewPage'
import { PagesPage } from './PagesPage'
import { VideosPage } from './VideosPage'

const UploadPage = lazy(() => import('./UploadPage'))
const ModerationPage = lazy(() => import('./ModerationPage'))
import {
  loadAdmin,
  saveConfig,
  signOut,
  waitForRestart,
  type AdminConfig,
  type AdminState,
} from './api'
import { fromDraft, needsRestart, toDraft, type Draft } from './draft'
import { PAGES, useRoute } from './route'
import { SignerProvider } from './signer-context'

type Phase =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'failed'; message: string }
  | { name: 'ready'; state: AdminState }

type Saving = null | 'saving' | 'restarting' | 'stalled'

export function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const { t } = useTranslation()

  const load = useCallback(async () => {
    try {
      const state = await loadAdmin()
      setPhase(state ? { name: 'ready', state } : { name: 'login' })
    } catch (e) {
      setPhase({ name: 'failed', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  if (phase.name === 'loading') {
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    )
  }
  if (phase.name === 'login') {
    return (
      <Shell>
        <div className="space-y-3 py-12 text-center">
          <p className="text-lg font-medium">{t('studio.app.loggedOut')}</p>
          <p className="text-sm text-muted-foreground">{t('studio.app.logInHint')}</p>
          <Button asChild>
            <a href="/admin/login">{t('studio.app.logIn')}</a>
          </Button>
        </div>
      </Shell>
    )
  }
  if (phase.name === 'failed') {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>{t('studio.app.loadFailed')}</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      </Shell>
    )
  }
  const { config, nostrPubkey } = phase.state
  // Own identity signs with the creator key: the bound login key when it is a creator, else the
  // first creator.
  const creatorKey =
    nostrPubkey && config.creators.includes(nostrPubkey)
      ? nostrPubkey
      : (config.creators[0] ?? null)
  return (
    <SignerProvider creatorKey={creatorKey}>
      {needsOnboarding(config) ? (
        <Shell onLogout={() => void signOut()}>
          <Onboarding state={phase.state} onFinished={() => location.reload()} />
        </Shell>
      ) : (
        <Studio state={phase.state} reload={load} />
      )}
    </SignerProvider>
  )
}

/**
 * The frame of every studio screen: the title, the studio language (this browser only), a way
 * over to the public site and, once logged in, a way out.
 */
export function Shell({
  children,
  onLogout,
}: {
  children: React.ReactNode
  onLogout?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <img src={`${import.meta.env.BASE_URL}nostube.svg`} alt="" className="h-9 w-9" />
          {t('studio.shell.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <InterfaceLanguageSelect />
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {t('studio.shell.viewSite')}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {onLogout && (
            <Button type="button" variant="outline" size="sm" onClick={onLogout}>
              {t('studio.shell.logOut')}
            </Button>
          )}
        </div>
      </header>
      {children}
    </div>
  )
}

function Studio({ state, reload }: { state: AdminState; reload: () => Promise<void> }) {
  const [page, navigate] = useRoute()
  const { t } = useTranslation()
  // The saved config; hiding a video saves it at once, so it moves on without a reload.
  const [config, setConfig] = useState(state.config)
  const [draft, setDraft] = useState<Draft>(() => toDraft(config))
  const [saving, setSaving] = useState<Saving>(null)
  // Branding uploads apply at once; kept here so the page shows them after navigating away.
  const [branding, setBranding] = useState(state.branding)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saved = useMemo(() => toDraft(config), [config])
  const result = fromDraft(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const editsConfig = PAGES.find(p => p.id === page)!.editsConfig
  const restart = result.config !== null && needsRestart(config, result.config)

  const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))

  /** Saves a whole config: the server checks it, keeps the old one and applies it, at once or by
   * restarting (then we wait for it). */
  const apply = async (config: AdminConfig) => {
    setSaveError(null)
    setSaving('saving')
    let restart: boolean
    try {
      ;({ restart } = await saveConfig(config))
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      setSaving(null)
      return
    }
    // A fresh page: the admin data, the draft and the public config the video list was built
    // on all come from the new revision (the address, and with it the page, stays).
    if (!restart) return location.reload()
    setSaving('restarting')
    if (await waitForRestart(state.bootId)) {
      location.reload()
    } else {
      setSaving('stalled')
    }
  }

  const save = () => (result.config ? apply(result.config) : Promise.resolve())

  /** Hiding applies at once: only the hidden list is saved, pending edits elsewhere stay drafts.
   * The server applies site settings without a restart. */
  const saveHidden = async (hiddenText: string) => {
    const hidden = hiddenText.split('\n').filter(Boolean)
    const next = { ...config, site: { ...config.site, videos: { hidden } } }
    await saveConfig(next)
    setConfig(next)
    setDraft(d => ({ ...d, hiddenText }))
  }
  return (
    <Shell onLogout={() => void signOut()}>
      <Nav page={page} onNavigate={navigate} />

      {saving === 'stalled' && (
        <Alert variant="destructive">
          <AlertTitle>{t('studio.app.stalledTitle')}</AlertTitle>
          <AlertDescription>
            <Trans i18nKey="studio.app.stalledBody" components={{ code: <code /> }} />
          </AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertTitle>{t('studio.app.notSaved')}</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}
      {page === 'videos' && <NextSteps config={config} branding={branding} />}
      {page === 'videos' && (
        <VideosPage hiddenText={draft.hiddenText} onHiddenChange={saveHidden} />
      )}
      {page === 'upload' && (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <UploadPage state={state} />
        </Suspense>
      )}
      {page === 'appearance' && (
        <AppearancePage
          draft={draft}
          update={update}
          branding={branding}
          onBranding={(slot, url) => setBranding(b => ({ ...b, [slot]: url }))}
        />
      )}
      {page === 'sitePages' && <PagesPage draft={draft} update={update} />}
      {page === 'instance' && <InstancePage draft={draft} update={update} state={state} />}
      {page === 'account' && <AccountPage state={state} reload={() => void reload()} />}
      {page === 'overview' && <OverviewPage />}
      {page === 'moderation' && (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ModerationPage state={state} />
        </Suspense>
      )}

      {editsConfig && (dirty || saving !== null) && (
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-destructive">
              {result.errors.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">{t('studio.app.unsaved')}</p>
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || !result.config || saving !== null}
            >
              {saving === 'saving'
                ? t('studio.app.saving')
                : saving === 'restarting'
                  ? t('studio.app.restarting')
                  : t('studio.app.save')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!dirty || saving !== null}
              onClick={() => setDraft(saved)}
            >
              {t('studio.app.discard')}
            </Button>
            {restart && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t('studio.app.restartWarning')}
              </p>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}
