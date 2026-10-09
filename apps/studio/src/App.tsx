import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { AccountPage } from './AccountPage'
import { AppearancePage } from './AppearancePage'
import { InstancePage } from './InstancePage'
import { loadAdmin, saveConfig, waitForRestart, type AdminState } from './api'
import { fromDraft, toDraft, type Draft } from './draft'

type Section = 'appearance' | 'instance' | 'account'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'instance', label: 'Instance' },
  { id: 'account', label: 'Account' },
]

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
  return <Studio state={phase.state} reload={load} />
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
  const [section, setSection] = useState<Section>('appearance')
  const [draft, setDraft] = useState<Draft>(() => toDraft(state.config))
  const [saving, setSaving] = useState<Saving>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saved = useMemo(() => toDraft(state.config), [state.config])
  const result = useMemo(() => fromDraft(draft), [draft])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))

  const save = async () => {
    if (!result.config) return
    setSaveError(null)
    setSaving('saving')
    try {
      await saveConfig(result.config)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      setSaving(null)
      return
    }
    setSaving('restarting')
    if (await waitForRestart(state.bootId)) {
      setSaving(null)
      await reload()
      setDraft(toDraft(result.config))
    } else {
      setSaving('stalled')
    }
  }

  return (
    <Shell>
      <nav className="flex gap-1 border-b border-border" aria-label="Sections">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            aria-current={section === s.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              section === s.id
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

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

      {section === 'appearance' && <AppearancePage draft={draft} update={update} />}
      {section === 'instance' && <InstancePage draft={draft} update={update} state={state} />}
      {section === 'account' && <AccountPage state={state} reload={() => void reload()} />}

      {section !== 'account' && (
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
