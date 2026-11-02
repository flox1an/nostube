import { useState, useSyncExternalStore } from 'react'
import { saveConfig, waitForRestart, type AdminConfig, type AdminState } from './api'
import { fromDraft, needsRestart, toDraft, type Draft, type DraftResult } from './draft'

/** What saving talks to: the admin HTTP calls in the studio, a fake in tests. */
export interface SaveDeps {
  saveConfig: (config: AdminConfig, deleteNsite?: boolean) => Promise<{ restart: boolean }>
  waitForRestart: (bootId: string, options?: { timeoutMs?: number }) => Promise<boolean>
}

export type RestartPhase = 'restarting' | 'stalled'

/**
 * Saves a whole config. When the server restarts for it (ADR 0010), waits until a new boot
 * answers; a slow restart is reported as `stalled` and waited for without a deadline.
 */
export async function applyConfig(
  deps: SaveDeps,
  config: AdminConfig,
  bootId: string,
  onPhase: (phase: RestartPhase) => void,
  deleteNsite?: boolean
): Promise<void> {
  const { restart } = await deps.saveConfig(config, deleteNsite)
  if (!restart) return
  onPhase('restarting')
  if (!(await deps.waitForRestart(bootId))) {
    onPhase('stalled')
    await deps.waitForRestart(bootId, { timeoutMs: Infinity })
  }
}

/** Where the site is hosted once saved: Private always serves it from the instance. */
const hostingOf = (d: Pick<Draft, 'reach' | 'siteHosting'>) =>
  d.reach === 'private' ? 'instance' : d.siteHosting

export interface ConfigSessionView {
  /** The config the server holds (hiding a video moves it on without a reload). */
  saved: AdminConfig
  savedDraft: Draft
  draft: Draft
  /** The draft as the config it would save, or the reasons it cannot be saved. */
  result: DraftResult
  dirty: boolean
  /** Saving the draft restarts the server. */
  restart: boolean
  saving: null | 'saving' | RestartPhase
  saveError: string | null
  /** An edit that takes the nsite down waits for the owner to keep or delete the published copies. */
  askNsiteDeletion: boolean
}

interface SessionState {
  saved: AdminConfig
  draft: Draft
  saving: ConfigSessionView['saving']
  saveError: string | null
  pendingHostingChange: Partial<Draft> | null
  deleteNsite: boolean | undefined
}

/**
 * One editing session over the instance config: the saved config and the draft, what saving it
 * would do, the save with its restart wait, and the edits that apply at once (the hidden videos).
 * Turning the nsite off asks first whether to delete the published copies (ADR 0013).
 */
export function createConfigSession(
  admin: Pick<AdminState, 'config' | 'bootId' | 'originIsPublic'>,
  deps: SaveDeps & { reload: () => void }
) {
  const listeners = new Set<() => void>()
  let state: SessionState = {
    saved: admin.config,
    draft: toDraft(admin.config),
    saving: null,
    saveError: null,
    pendingHostingChange: null,
    deleteNsite: undefined,
  }
  const view = (s: SessionState): ConfigSessionView => {
    const savedDraft = toDraft(s.saved)
    const result = fromDraft(s.draft, admin.originIsPublic)
    return {
      saved: s.saved,
      savedDraft,
      draft: s.draft,
      result,
      dirty: JSON.stringify(s.draft) !== JSON.stringify(savedDraft),
      restart: result.config !== null && needsRestart(s.saved, result.config),
      saving: s.saving,
      saveError: s.saveError,
      askNsiteDeletion: s.pendingHostingChange !== null,
    }
  }
  let snapshot = view(state)
  const set = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch }
    snapshot = view(state)
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,

    update(patch: Partial<Draft>) {
      const next = { ...state.draft, ...patch }
      if (hostingOf(state.draft) === 'nsite' && hostingOf(next) !== 'nsite') {
        set({ pendingHostingChange: { ...patch, siteHosting: 'instance' } })
        return
      }
      set({
        draft: next,
        deleteNsite: hostingOf(next) === 'nsite' ? undefined : state.deleteNsite,
      })
    },

    /** The answer to the nsite question: delete the copies, keep them, or (null) cancel the edit. */
    answerNsiteDeletion(remove: boolean | null) {
      const patch = state.pendingHostingChange
      if (!patch) return
      if (remove === null) return set({ pendingHostingChange: null })
      set({ draft: { ...state.draft, ...patch }, pendingHostingChange: null, deleteNsite: remove })
    },

    discard() {
      set({ draft: toDraft(state.saved), deleteNsite: undefined })
    },

    /** Saves the draft; the page reloads once the server runs the new config. */
    async save() {
      const { config } = snapshot.result
      if (!config || state.saving) return
      set({ saving: 'saving', saveError: null })
      try {
        await applyConfig(
          deps,
          config,
          admin.bootId,
          saving => set({ saving }),
          hostingOf(state.saved) === 'nsite' && config.siteHosting !== 'nsite'
            ? state.deleteNsite
            : undefined
        )
      } catch (e) {
        set({ saving: null, saveError: e instanceof Error ? e.message : String(e) })
        return
      }
      deps.reload()
    },

    /** Hiding applies at once: only the hidden list is saved, other edits stay in the draft. */
    async saveHidden(hiddenText: string) {
      const hidden = hiddenText.split('\n').filter(Boolean)
      const next = { ...state.saved, site: { ...state.saved.site, videos: { hidden } } }
      await deps.saveConfig(next)
      set({ saved: next, draft: { ...state.draft, hiddenText } })
    },
  }
}

export type ConfigSession = ReturnType<typeof createConfigSession>

const studioDeps = { saveConfig, waitForRestart, reload: () => location.reload() }

/** The session for this studio page, created once from the loaded admin state. */
export function useConfigSession(admin: AdminState): [ConfigSessionView, ConfigSession] {
  const [session] = useState(() => createConfigSession(admin, studioDeps))
  return [useSyncExternalStore(session.subscribe, session.getSnapshot), session]
}
