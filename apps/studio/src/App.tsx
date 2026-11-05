import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { InterfaceLanguageSelect } from '@nostube/widgets/components/InterfaceLanguageSelect'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { PublicationStatusButton } from '@nostube/widgets/components/PublicationStatus'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@nostube/widgets/components/alert-dialog'
import { AccessPage } from './AccessPage'
import { AccountPage } from './AccountPage'
import { AppearancePage } from './AppearancePage'
import { DistributionPage } from './DistributionPage'
import { FeaturesPage } from './FeaturesPage'
import { HomepagePage } from './HomepagePage'
import { Onboarding } from './OnboardingWizard'
import { needsOnboarding } from './onboarding-config'
import { Login } from './Login'
import { MobileBar, Sidebar } from './Nav'
import { NextSteps, useChecklist } from './NextSteps'
import { OverviewPage } from './OverviewPage'
import { PagesPage } from './PagesPage'
import { RelaysPage } from './RelaysPage'
import { StoragePage } from './StoragePage'
import { VideosPage } from './VideosPage'

const UploadPage = lazy(() => import('./UploadPage'))
const ModerationPage = lazy(() => import('./ModerationPage'))
import { loadAdmin, signOut, type AdminState } from './api'
import { useConfigSession } from './config-session'
import { PAGES, useRoute } from './route'
import { SignerProvider, useSigner } from './signer-context'

type Phase =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'failed'; message: string }
  | { name: 'ready'; state: AdminState }

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
        <Login onLoggedIn={() => void load()} />
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
          <PublicationStatusButton />
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
      <footer className="border-t pt-4 text-sm text-muted-foreground">
        <a
          href="https://flox1an.github.io/nostube/server/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          powered by nostube-server
        </a>
      </footer>
    </div>
  )
}

function Studio({ state, reload }: { state: AdminState; reload: () => Promise<void> }) {
  const [page, navigate] = useRoute()
  const { t } = useTranslation()
  const [view, session] = useConfigSession(state)
  const { saved: config, draft, dirty, restart, saving, saveError } = view
  const update = session.update
  // Branding uploads apply at once; kept here so the page shows them after navigating away.
  const [branding, setBranding] = useState(state.branding)
  const checklist = useChecklist(config, branding)
  const progress = checklist
    ? {
        done: checklist.steps.filter(step => step.done).length,
        total: checklist.steps.length,
      }
    : undefined
  const editsConfig = PAGES.find(p => p.id === page)!.editsConfig

  // A new page starts at its top; the sidebar keeps saying where we are.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border lg:block">
        <Sidebar
          page={page}
          onNavigate={navigate}
          onLogout={() => void signOut()}
          instanceTitle={config.title}
          progress={progress}
        />
      </aside>
      <div className="min-w-0">
        <MobileBar
          page={page}
          onNavigate={navigate}
          onLogout={() => void signOut()}
          instanceTitle={config.title}
          progress={progress}
        />
        <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <ConnectSigner />

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

          <div key={page} className="anim-page space-y-6">
            {page === 'start' && checklist && <NextSteps checklist={checklist} />}
            {page === 'videos' && (
              <VideosPage
                hiddenText={draft.hiddenText}
                onHiddenChange={session.saveHidden}
                countPlays={view.savedDraft.countPlays}
              />
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
            {page === 'homepage' && (
              <HomepagePage draft={draft} update={update} branding={branding} />
            )}
            {page === 'sitePages' && <PagesPage draft={draft} update={update} />}
            {page === 'features' && <FeaturesPage draft={draft} update={update} />}
            {page === 'distribution' && (
              <DistributionPage
                draft={draft}
                update={update}
                state={state}
                dirty={dirty}
                canBePublic={view.canBePublic}
              />
            )}
            {page === 'storage' && <StoragePage draft={draft} update={update} state={state} />}
            {page === 'access' && <AccessPage draft={draft} update={update} />}
            {page === 'relays' && <RelaysPage draft={draft} update={update} />}
            {page === 'account' && <AccountPage state={state} reload={() => void reload()} />}
            {page === 'overview' && <OverviewPage />}
            {page === 'moderation' && (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ModerationPage state={state} />
              </Suspense>
            )}
          </div>

          {editsConfig && (dirty || saving !== null) && (
            <div className="anim-rise sticky bottom-4 z-30">
              <div className="space-y-2 rounded-xl border border-border/60 bg-background/90 p-3 pr-4 shadow-lg backdrop-blur-md">
                {view.errors.length > 0 && (
                  <ul className="list-disc pl-5 text-sm text-destructive">
                    {view.errors.map(message => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium">{t('studio.app.unsaved')}</p>
                  <Button
                    type="button"
                    onClick={() => void session.save()}
                    disabled={!dirty || view.errors.length > 0 || saving !== null}
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
                    onClick={session.discard}
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
            </div>
          )}
        </main>
      </div>

      <AlertDialog
        open={view.askNsiteDeletion}
        onOpenChange={open => {
          if (!open) session.answerNsiteDeletion(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('studio.nsite.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('studio.nsite.deleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('studio.nsite.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => session.answerNsiteDeletion(false)}
            >
              {t('studio.nsite.keep')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => session.answerNsiteDeletion(true)}
            >
              {t('studio.nsite.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Own identity without a Nostr account in this browser: nothing can be signed until one logs in. */
function ConnectSigner() {
  const { t } = useTranslation()
  const { mode, status, connect } = useSigner()
  if (mode !== 'own' || status !== 'none') return null
  return (
    <Alert>
      <AlertTitle>{t('studio.signer.noneTitle')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t('studio.signer.noneBody')}</p>
        <Button type="button" size="sm" onClick={() => void connect()}>
          {t('studio.signer.connect')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
