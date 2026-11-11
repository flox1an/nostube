import { use$, useEventStore } from 'applesauce-react/hooks'
import { useMemo } from 'react'
import type { Filter, NostrEvent } from 'nostr-tools'
import { getInstanceConfig } from '@nostube/core/instance-config'
import {
  parseZapGoal,
  sortZapGoals,
  zapGoalProgress,
  ZAP_GOAL_KIND,
  type ZapGoal,
  type ZapGoalProgress,
} from '@nostube/core/zap-goal'
import { useLiveRelayFeed } from './useLiveStreams'
import { useZapEndpoints } from './useZapEndpoints'

const GOAL_LIMIT = 20
const NO_RELAYS: string[] = []

export interface ZapGoalState {
  goal: ZapGoal
  /** Undefined until the author's LNURL endpoint resolved: receipts cannot be verified before. */
  progress?: ZapGoalProgress
}

/**
 * Receipts for `goals`, REQ'd on the relays each goal names (NIP-75: zaps are tallied there) plus
 * the usual live relays, verified against the goal author's LNURL endpoint.
 */
function useGoalProgress(goals: ZapGoal[], hints: string[]): ZapGoalState[] {
  const eventStore = useEventStore()
  const ids = useMemo(() => goals.map(g => g.id), [goals])
  const filters = useMemo<Filter[] | null>(
    () => (ids.length ? [{ kinds: [9735], '#e': ids }] : null),
    [ids]
  )
  const goalRelays = useMemo(
    () => [...new Set([...hints, ...goals.flatMap(g => g.relays)])],
    [goals, hints]
  )
  useLiveRelayFeed(filters, goalRelays)
  const receipts = use$(
    () => (filters ? eventStore.timeline(filters) : undefined),
    [eventStore, filters]
  )
  const authors = useMemo(() => [...new Set(goals.map(g => g.pubkey))], [goals])
  const endpoints = useZapEndpoints(authors)

  return useMemo(
    () =>
      goals.map(goal => {
        const endpoint = endpoints.get(goal.pubkey)
        const own = (receipts ?? []).filter(r => r.tags.some(t => t[0] === 'e' && t[1] === goal.id))
        return { goal, progress: endpoint ? zapGoalProgress(goal, own, endpoint) : undefined }
      }),
    [goals, receipts, endpoints]
  )
}

/** The goal a stream announces with its `goal` tag, loaded by id; undefined while unknown. */
export function useStreamZapGoal(
  goalId: string | undefined,
  hints: string[] = NO_RELAYS
): ZapGoalState | undefined {
  const eventStore = useEventStore()
  const filters = useMemo<Filter[] | null>(
    () => (goalId && !getInstanceConfig() ? [{ kinds: [ZAP_GOAL_KIND], ids: [goalId] }] : null),
    [goalId]
  )
  useLiveRelayFeed(filters, hints)
  const event = use$(
    () => (goalId && filters ? eventStore.event(goalId) : undefined),
    [eventStore, goalId, filters]
  )
  const goals = useMemo(() => {
    const parsed = event && event.id === goalId ? parseZapGoal(event) : null
    return parsed ? [parsed] : []
  }, [event, goalId])
  return useGoalProgress(goals, hints)[0]
}

/** The newest goals an author published, open ones first. Empty in server-instance builds. */
export function useAuthorZapGoals(
  pubkey: string | undefined,
  hints: string[] = NO_RELAYS
): ZapGoalState[] {
  const eventStore = useEventStore()
  const filters = useMemo<Filter[] | null>(
    () =>
      pubkey && !getInstanceConfig()
        ? [{ kinds: [ZAP_GOAL_KIND], authors: [pubkey], limit: GOAL_LIMIT }]
        : null,
    [pubkey]
  )
  useLiveRelayFeed(filters, hints)
  const events = use$(
    () => (filters ? eventStore.timeline(filters) : undefined),
    [eventStore, filters]
  )
  const goals = useMemo(
    () =>
      sortZapGoals(
        (events ?? [])
          .map((event: NostrEvent) => parseZapGoal(event))
          .filter((goal): goal is ZapGoal => goal !== null)
      ),
    [events]
  )
  return useGoalProgress(goals, hints)
}
