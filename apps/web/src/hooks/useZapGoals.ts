import { use$, useEventStore } from 'applesauce-react/hooks'
import { useMemo } from 'react'
import type { Filter, NostrEvent } from 'nostr-tools'
import { getInstanceConfig } from '@nostube/core/instance-config'
import type { LiveStream } from '@nostube/core/live-stream'
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

/**
 * The zap goal shown above a live stream's chat: the one its `goal` tag names, else the host's
 * newest open goal. Undefined while unknown, once the stream is no longer live, and in
 * server-instance builds.
 */
export function useStreamZapGoal(stream: LiveStream): ZapGoalState | undefined {
  const eventStore = useEventStore()
  const { goalId, hostPubkey, relays } = stream
  const live = stream.status === 'live' && !getInstanceConfig()
  const filters = useMemo<Filter[] | null>(() => {
    if (!live) return null
    return goalId
      ? [{ kinds: [ZAP_GOAL_KIND], ids: [goalId] }]
      : [{ kinds: [ZAP_GOAL_KIND], authors: [hostPubkey], limit: GOAL_LIMIT }]
  }, [live, goalId, hostPubkey])
  useLiveRelayFeed(filters, relays)
  const events = use$(
    () => (filters ? eventStore.timeline(filters) : undefined),
    [eventStore, filters]
  )
  const goals = useMemo(() => {
    const parsed = (events ?? [])
      .map((event: NostrEvent) => parseZapGoal(event))
      .filter((goal): goal is ZapGoal => goal !== null)
    // eslint-disable-next-line react-hooks/purity -- picks the goal that is open right now
    const now = Math.floor(Date.now() / 1000)
    const goal = goalId
      ? parsed.find(g => g.id === goalId)
      : sortZapGoals(parsed, now).find(g => g.closedAt === undefined || g.closedAt > now)
    return goal ? [goal] : []
  }, [events, goalId])
  return useGoalProgress(goals, relays)[0]
}
