import { lazy, memo, Suspense } from 'react'
import { useEventZaps } from '@/hooks/useEventZaps'

const TimelineMarkers = lazy(() =>
  import('./TimelineMarkers').then(module => ({ default: module.TimelineMarkers }))
)

interface TimelineMarkersLoaderProps {
  duration: number
  currentTime: number
  onSeekToMarker?: (time: number) => void
  onMarkerHoverChange?: (isHovering: boolean) => void
  eventId?: string
  authorPubkey?: string
  kind?: number
  identifier?: string
}

export const TimelineMarkersLoader = memo(function TimelineMarkersLoader({
  duration,
  currentTime,
  onSeekToMarker,
  onMarkerHoverChange,
  eventId,
  authorPubkey,
  kind = 1,
  identifier,
}: TimelineMarkersLoaderProps) {
  const { zaps } = useEventZaps({
    eventId: eventId || '',
    authorPubkey: authorPubkey || '',
    kind,
    identifier,
  })

  if (!eventId || !authorPubkey || zaps.length === 0) return null

  return (
    <Suspense fallback={null}>
      <TimelineMarkers
        duration={duration}
        currentTime={currentTime}
        onSeekToMarker={onSeekToMarker}
        onMarkerHoverChange={onMarkerHoverChange}
        eventId={eventId}
        zaps={zaps}
      />
    </Suspense>
  )
})
