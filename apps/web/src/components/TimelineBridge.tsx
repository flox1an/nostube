import { useMemo, type ReactNode } from 'react'
import { TimelineProvider, type TimelineContextValue } from '@nostube/widgets/timeline'
import { useAppContext } from '@/hooks/useAppContext'
import { useMissingVideos } from '@/hooks/useMissingVideos'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { client } from '@/nostr/core'

/**
 * Gives the timeline hooks of @nostube/widgets the web client and the viewer's filter policy
 * (reports, mutes, preset NSFW authors, content settings). It needs the event store, account and
 * preset providers, so it sits just around the router. The embed does not render timelines and
 * must not mount it: it would pull nostr/core into the embed bundle.
 */
export function TimelineBridge({ children }: { children: ReactNode }) {
  const blockedPubkeys = useReportedPubkeys()
  const { config } = useAppContext()
  const { getAllMissingVideos } = useMissingVideos()
  const { presetContent } = useSelectedPreset()

  const value = useMemo<TimelineContextValue>(
    () => ({
      client,
      policy: {
        blockedPubkeys,
        blossomServers: config.blossomServers,
        nsfwPubkeys: presetContent.nsfwPubkeys,
        reportedEventIds: config.reportedEventIds,
        showYouTubeContent: config.showYouTubeContent,
        showAudioContent: config.showAudioContent,
        getAllMissingVideos,
      },
    }),
    [
      blockedPubkeys,
      config.blossomServers,
      config.reportedEventIds,
      config.showAudioContent,
      config.showYouTubeContent,
      getAllMissingVideos,
      presetContent.nsfwPubkeys,
    ]
  )

  return <TimelineProvider value={value}>{children}</TimelineProvider>
}
