import type { EventTemplate } from 'nostr-tools'

export const VIDEO_VIEW_EVENT_KIND = 22236
export const MIN_VIEW_SECONDS = 1

export type ViewEventSource =
  'video' | 'shorts' | 'home' | 'profile' | 'search' | 'playlist' | 'share' | 'unknown'

export interface ViewSegment {
  start: number
  end: number
}

export interface BuildVideoViewEventOptions {
  videoId: string
  videoKind: number
  videoPubkey: string
  videoIdentifier?: string
  relayHint?: string
  viewerPubkey: string
  segments: ViewSegment[]
  source?: ViewEventSource
  sourceDetail?: string
  loopCount?: number
  createdAt?: number
}

export interface BuiltVideoViewEvent {
  event: EventTemplate
  normalizedSegments: ViewSegment[]
}

function normalizeSecond(value: number, round: 'floor' | 'ceil') {
  if (!Number.isFinite(value)) return 0
  const normalized = round === 'floor' ? Math.floor(value) : Math.ceil(value)
  return Math.max(0, normalized)
}

export function normalizeViewSegments(segments: ViewSegment[]): ViewSegment[] {
  return segments
    .filter(
      segment => segment.end > segment.start && segment.end - segment.start >= MIN_VIEW_SECONDS
    )
    .map(segment => ({
      start: normalizeSecond(segment.start, 'floor'),
      end: normalizeSecond(segment.end, 'ceil'),
    }))
    .filter(segment => segment.end > segment.start)
}

export function buildVideoViewEvent({
  videoId,
  videoKind,
  videoPubkey,
  videoIdentifier,
  relayHint,
  viewerPubkey,
  segments,
  source = 'unknown',
  sourceDetail,
  loopCount,
  createdAt,
}: BuildVideoViewEventOptions): BuiltVideoViewEvent | null {
  if (!viewerPubkey || viewerPubkey === videoPubkey) return null

  const normalizedSegments = normalizeViewSegments(segments)
  if (normalizedSegments.length === 0) return null

  const relay = relayHint ?? ''
  const tags: string[][] = []

  tags.push(['a', `${videoKind}:${videoPubkey}:${videoIdentifier ?? videoId}`, relay])

  tags.push(['e', videoId, relay])

  for (const segment of normalizedSegments) {
    tags.push(['viewed', String(segment.start), String(segment.end)])
  }

  if (sourceDetail) {
    tags.push(['source', source, sourceDetail])
  } else {
    tags.push(['source', source])
  }

  if (loopCount && loopCount > 0) {
    tags.push(['loops', String(Math.floor(loopCount))])
  }

  tags.push(['client', 'nostube'])

  return {
    event: {
      kind: VIDEO_VIEW_EVENT_KIND,
      content: '',
      tags,
      created_at: createdAt ?? Math.floor(Date.now() / 1000),
    },
    normalizedSegments,
  }
}
