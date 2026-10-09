import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { AccountPage } from './AccountPage'
import { AppearancePage } from './AppearancePage'
import { ConnectKey } from './ConnectKey'
import { InstancePage } from './InstancePage'
import { Nav } from './Nav'
import { VideosPage } from './VideosPage'
import { loadAdmin, saveConfig, waitForRestart, type AdminConfig, type AdminState } from './api'
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
          <p>You need to log in to use the studio.</p>
          <Button asChild>
            <a href="/admin/login">Log in</a>
          </Button>
        </div>
      </Shell>
    )
  }
  if (phase.name === 'failed') {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>The studio could not load</AlertTitle>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold">Studio</h1>
      </header>
      {children}
    </div>
  )
}

function Studio({ state, reload }: { state: AdminState; reload: () => Promise<void> }) {
  const [page, navigate] = useRoute()
  const [draft, setDraft] = useState<Draft>(() => toDraft(state.config))
  const [saving, setSaving] = useState<Saving>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saved = useMemo(() => toDraft(state.config), [state.config])
  const result = useMemo(() => fromDraft(draft), [draft])
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
    <Shell>
      <Nav page={page} onNavigate={navigate} />

      {saving === 'stalled' && (
        <Alert variant="destructive">
          <AlertTitle>The server did not come back</AlertTitle>
          <AlertDescription>
            The new settings are saved, but nothing restarted the server. Start it again, or run{' '}
            <code>nostube-server config rollback</code> to return to the previous settings.
          </AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertTitle>Not saved</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {page === 'videos' && <VideosPage draft={draft} update={update} banner={banner} />}
      {page === 'appearance' && <AppearancePage draft={draft} update={update} />}
      {page === 'instance' && <InstancePage draft={draft} update={update} state={state} />}
      {page === 'account' && <AccountPage state={state} reload={() => void reload()} />}

      {editsConfig && (
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-destructive">
              {result.errors.map(message => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || !result.config || saving !== null}
            >
              {saving === 'saving'
                ? 'Saving…'
                : saving === 'restarting'
                  ? 'Restarting the server…'
                  : 'Save and apply'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!dirty || saving !== null}
              onClick={() => setDraft(saved)}
            >
              Discard changes
            </Button>
            <p className="text-xs text-muted-foreground">
              Saving restarts the server for a few seconds. The previous settings are kept.
            </p>
          </div>
        </div>
      )}
    </Shell>
  )
}
