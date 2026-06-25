import { useCallback, useEffect } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { useAppContext } from './useAppContext'
import { DEFAULT_VIEW_TRACKING_RELAYS } from '@/constants/relays'
import { flushPendingViewEvents, resetPublishingToPending } from '@/lib/view-event-sweeper'

/**
 * Mounts the view-event durable-outbox sweeper.
 *
 * Responsibilities:
 * - On user login: reset any `publishing` rows left over from a crash back to
 *   `pending`, then run an immediate flush.
 * - On tab foreground (visibilitychange → visible, pagehide recovery): flush.
 * - Respects the `viewTrackingEnabled` config flag — no-ops when disabled.
 *
 * Place this hook inside a render-nothing component (`<ViewEventSweeperInit />`)
 * that lives below the AccountsProvider so it has access to the current user.
 */
export function useViewEventSweeper() {
  const { user } = useCurrentUser()
  const { config } = useAppContext()

  const relays: string[] =
    config.viewTrackingRelays && config.viewTrackingRelays.length > 0
      ? config.viewTrackingRelays
      : DEFAULT_VIEW_TRACKING_RELAYS

  const enabled = config.viewTrackingEnabled === true

  const sweep = useCallback(() => {
    if (!user || !enabled) return
    flushPendingViewEvents(user.pubkey, relays).catch(err => {
      if (import.meta.env.DEV) console.warn('[useViewEventSweeper] Flush failed:', err)
    })
  }, [user, enabled, relays])

  // On user change: crash-recovery reset → initial sweep.
  useEffect(() => {
    if (!user || !enabled) return
    resetPublishingToPending(user.pubkey)
      .then(sweep)
      .catch(err => {
        if (import.meta.env.DEV) console.warn('[useViewEventSweeper] Crash recovery failed:', err)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, enabled])

  // Sweep whenever the tab becomes visible again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sweep()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [sweep])
}
