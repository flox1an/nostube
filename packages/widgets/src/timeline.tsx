import { createContext, useContext, type ReactNode } from 'react'
import type { BlossomServer } from '@nostube/core'
import type { NostubeClient } from '@nostube/core/client'
import type { ReportedPubkeys } from '@nostube/core/reports'

/** What decides which events of a timeline become videos. The host fills it from its own state. */
export interface TimelinePolicy {
  /** Authors whose videos are dropped. */
  blockedPubkeys?: ReportedPubkeys
  blossomServers?: BlossomServer[]
  /** Authors whose videos carry a content warning. */
  nsfwPubkeys?: string[]
  /** Event ids the viewer reported; they are hidden. */
  reportedEventIds?: string[]
  /** Default true. */
  showYouTubeContent?: boolean
  /** Default true. */
  showAudioContent?: boolean
  /** Videos the viewer found unplayable, keyed by event id. The function itself is passed on. */
  getAllMissingVideos: () => Record<string, unknown>
}

export interface TimelineContextValue {
  client: NostubeClient
  policy: TimelinePolicy
}

const TimelineContext = createContext<TimelineContextValue | undefined>(undefined)

export function TimelineProvider({
  value,
  children,
}: {
  value: TimelineContextValue
  children: ReactNode
}) {
  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>
}

/** The client and policy of the timeline hooks. Throws without a provider. */
export function useTimelineContext(): TimelineContextValue {
  const value = useContext(TimelineContext)
  if (!value) throw new Error('useTimelineContext must be used within a TimelineProvider')
  return value
}
