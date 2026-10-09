import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { AccountPage } from './AccountPage'
import { AppearancePage } from './AppearancePage'
import { ConnectKey } from './ConnectKey'
import { InstancePage } from './InstancePage'
import { Nav } from './Nav'
import { OverviewPage } from './OverviewPage'
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
import { addKeyToConfig, fromDraft, toDraft, type Draft } from './draft'
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
  return (
    <SignerProvider>
      <Studio state={phase.state} reload={load} />
    </SignerProvider>
  )
}

/**
 * The frame of every studio screen: the title, a way over to the public site and, once logged in,
 * a way out.
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
  const [draft, setDraft] = useState<Draft>(() => toDraft(state.config))
  const [saving, setSaving] = useState<Saving>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saved = useMemo(() => toDraft(state.config), [state.config])
  const result = fromDraft(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const editsConfig = PAGES.find(p => p.id === page)!.editsConfig

  const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))

  /** Saves a whole config: the server checks it, keeps the old one, restarts, and we wait for it. */
  const apply = async (config: AdminConfig) => {
    setSaveError(null)
    setSaving('saving')
    try {
      await saveConfig(config)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      setSaving(null)
      return
    }
    setSaving('restarting')
    if (await waitForRestart(state.bootId)) {
      // A fresh page: the admin data, the draft and the public config the video list was built
      // on all come from the new revision (the address, and with it the page, stays).
      location.reload()
    } else {
      setSaving('stalled')
    }
  }

  const save = () => (result.config ? apply(result.config) : Promise.resolve())

  // Pending edits go along (this is a save like any other, with one more entry in two lists);
  // if they do not validate, only the key is added to what is saved.
  const connectKey = (pubkey: string) =>
    apply(addKeyToConfig(result.config ?? state.config, pubkey))

  const banner = (
    <ConnectKey config={state.config} onConnected={connectKey} busy={saving !== null} />
  )

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

      {page === 'videos' && <VideosPage draft={draft} update={update} banner={banner} />}
      {page === 'upload' && (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <UploadPage state={state} banner={banner} />
        </Suspense>
      )}
      {page === 'appearance' && <AppearancePage draft={draft} update={update} />}
      {page === 'instance' && <InstancePage draft={draft} update={update} state={state} />}
      {page === 'account' && <AccountPage state={state} reload={() => void reload()} />}
      {page === 'overview' && <OverviewPage />}
      {page === 'moderation' && (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ModerationPage state={state} banner={banner} />
        </Suspense>
      )}

      {editsConfig && (
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-destructive">
              {result.errors.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
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
            <p className="text-xs text-muted-foreground">{t('studio.app.saveHint')}</p>
          </div>
        </div>
      )}
    </Shell>
  )
}
