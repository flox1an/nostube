import { useEffect, useMemo, useState } from 'react'
import type { Filter, NostrEvent } from 'nostr-tools'
import { filter as rxFilter } from 'rxjs/operators'
import { INDEXER_RELAYS } from '@/constants/relays'
import { useAppContext } from '@/hooks/useAppContext'
import { relayPool } from '@/nostr/core'
import { extractBlossomHash, type VideoEvent, type VideoVariant } from '@/utils/video-event'

export type ContributedMediaType = 'video' | 'image' | 'subtitle' | 'audio' | 'other'

export type ContributedVariantDebugStatus =
  'accepted' | 'checking' | 'duplicate' | 'invalid' | 'unavailable'

export interface ContributedVariantDebugRecord {
  eventId: string
  eventKind: number
  pubkey: string
  createdAt: number
  hash?: string
  url?: string
  fallbackUrls: string[]
  mimeType?: string
  dimensions?: string
  quality?: string
  size?: number
  tags: string[][]
  mediaType: ContributedMediaType
  status: ContributedVariantDebugStatus
  reachableUrl?: string
  statusCode?: number
  error?: string
}

interface AvailabilityProbeResult {
  reachable: boolean
  reachableUrl?: string
  statusCode?: number
}

export interface ContributedVariantsResult {
  variants: VideoVariant[]
  debugRecords: ContributedVariantDebugRecord[]
}

function firstTagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(tag => tag[0] === name)?.[1]
}

function classifyMediaType(mimeType: string | undefined, url: string): ContributedMediaType {
  const baseMime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (baseMime.startsWith('video/')) return 'video'
  if (baseMime.startsWith('image/')) return 'image'
  if (
    baseMime === 'text/vtt' ||
    baseMime === 'application/x-subrip' ||
    baseMime === 'text/srt' ||
    /\.(vtt|srt)(?:$|\?)/i.test(url)
  ) {
    return 'subtitle'
  }
  if (baseMime.startsWith('audio/')) return 'audio'
  return 'other'
}

interface ParsedContribution {
  variant: VideoVariant
  mediaType: ContributedMediaType
}

function contributedVariantFromEvent(event: NostrEvent): ParsedContribution | null {
  const url = firstTagValue(event, 'url')
  if (!url) return null
  const hash = (firstTagValue(event, 'x') ?? extractBlossomHash(url).sha256)?.toLowerCase()
  if (!hash) return null

  const mimeType = firstTagValue(event, 'm')
  const mediaType = classifyMediaType(mimeType, url)
  const size = firstTagValue(event, 'size')
  const dimensions = firstTagValue(event, 'dim')
  const height = dimensions?.match(/x(\d+)/)?.[1]

  return {
    variant: {
      url,
      hash,
      dimensions,
      quality: height ? `${height}p` : undefined,
      mimeType,
      size: size ? Number.parseInt(size, 10) : undefined,
      fallbackUrls: event.tags.filter(tag => tag[0] === 'fallback' && tag[1]).map(tag => tag[1]),
      mediaType:
        mediaType === 'video' || mediaType === 'audio' || mediaType === 'image'
          ? mediaType
          : undefined,
      contributorPubkey: event.pubkey,
    },
    mediaType,
  }
}

function collectExistingHashes(video: VideoEvent): Set<string> {
  const hashes = new Set<string>()
  const add = (hash?: string | null) => {
    if (hash) hashes.add(hash.toLowerCase())
  }
  const addFromUrl = (url?: string | null) => {
    if (url) add(extractBlossomHash(url).sha256)
  }

  add(video.x)
  for (const v of video.videoVariants ?? []) {
    add(v.hash)
    addFromUrl(v.url)
    for (const fb of v.fallbackUrls ?? []) addFromUrl(fb)
  }
  for (const v of video.allVideoVariants ?? []) {
    add(v.hash)
    addFromUrl(v.url)
    for (const fb of v.fallbackUrls ?? []) addFromUrl(fb)
  }
  for (const v of video.thumbnailVariants ?? []) {
    add(v.hash)
    addFromUrl(v.url)
    for (const fb of v.fallbackUrls ?? []) addFromUrl(fb)
  }
  for (const img of video.images ?? []) addFromUrl(img)
  for (const track of video.textTracks ?? []) addFromUrl(track.url)

  return hashes
}

function debugRecordFromEvent(
  event: NostrEvent,
  parsed: ParsedContribution | null,
  mediaType: ContributedMediaType,
  status: ContributedVariantDebugStatus
): ContributedVariantDebugRecord {
  const variant = parsed?.variant ?? null
  return {
    eventId: event.id,
    eventKind: event.kind,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    hash: variant?.hash ?? firstTagValue(event, 'x')?.toLowerCase(),
    url: variant?.url ?? firstTagValue(event, 'url'),
    fallbackUrls:
      variant?.fallbackUrls ??
      event.tags.filter(tag => tag[0] === 'fallback' && tag[1]).map(tag => tag[1]),
    mimeType: variant?.mimeType ?? firstTagValue(event, 'm'),
    dimensions: variant?.dimensions ?? firstTagValue(event, 'dim'),
    quality: variant?.quality,
    size: variant?.size,
    tags: event.tags,
    mediaType,
    status,
  }
}

async function variantAvailability(
  variant: VideoVariant,
  signal: AbortSignal
): Promise<AvailabilityProbeResult> {
  let statusCode: number | undefined
  for (const url of [variant.url, ...variant.fallbackUrls]) {
    try {
      const response = await fetch(url, { method: 'HEAD', signal })
      statusCode = response.status
      if (response.ok) return { reachable: true, reachableUrl: url, statusCode }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
    }
  }

  return { reachable: false, statusCode }
}

export function useContributedVariants(video: VideoEvent | null): ContributedVariantsResult {
  const { config } = useAppContext()
  const relays = useMemo(
    () => Array.from(new Set([...config.relays.map(relay => relay.url), ...INDEXER_RELAYS])),
    [config.relays]
  )
  const [variants, setVariants] = useState<VideoVariant[]>([])
  const [debugRecords, setDebugRecords] = useState<ContributedVariantDebugRecord[]>([])

  const upsertDebugRecord = (record: ContributedVariantDebugRecord) => {
    setDebugRecords(current => {
      const index = current.findIndex(existing => existing.eventId === record.eventId)
      if (index === -1) return [...current, record]
      return current.map((existing, currentIndex) => (currentIndex === index ? record : existing))
    })
  }
  useEffect(() => {
    setVariants([])
    setDebugRecords([])
    if (!video || relays.length === 0) return

    const existingHashes = collectExistingHashes(video)
    const acceptedHashes = new Set<string>()
    const probingUrls = new Set<string>()
    const filters: Filter[] = []
    if ((video.kind === 34235 || video.kind === 34236) && video.identifier) {
      filters.push({ kinds: [1063], '#a': [`${video.kind}:${video.pubkey}:${video.identifier}`] })
    } else {
      filters.push({ kinds: [1063], '#e': [video.id] })
    }

    const abortController = new AbortController()
    let cancelled = false

    const subscription = relayPool
      .subscription(relays, filters)
      .pipe(rxFilter((msg): msg is NostrEvent => typeof msg !== 'string' && 'kind' in msg))
      .subscribe({
        next: event => {
          const parsed = contributedVariantFromEvent(event)
          if (!parsed) {
            // Malformed kind 1063: surface as 'invalid' so debuggers can see what arrived.
            upsertDebugRecord(debugRecordFromEvent(event, null, 'other', 'invalid'))
            return
          }

          const { variant, mediaType } = parsed
          const hash = variant.hash!

          // Drop kind 1063 events that just announce media already referenced by the
          // original video event (video variants, thumbnails, subtitles). They are
          // not contributions — they're the source publication echoing itself.
          if (existingHashes.has(hash)) return

          if (acceptedHashes.has(hash)) {
            upsertDebugRecord(debugRecordFromEvent(event, parsed, mediaType, 'duplicate'))
            return
          }

          const probeKey = `${hash}\u0000${variant.url}`
          if (probingUrls.has(probeKey)) return
          probingUrls.add(probeKey)
          upsertDebugRecord(debugRecordFromEvent(event, parsed, mediaType, 'checking'))

          void variantAvailability(variant, abortController.signal)
            .then(availability => {
              if (cancelled) return

              if (!availability.reachable) {
                upsertDebugRecord({
                  ...debugRecordFromEvent(event, parsed, mediaType, 'unavailable'),
                  statusCode: availability.statusCode,
                })
                return
              }

              if (existingHashes.has(hash) || acceptedHashes.has(hash)) {
                upsertDebugRecord(debugRecordFromEvent(event, parsed, mediaType, 'duplicate'))
                return
              }

              acceptedHashes.add(hash)
              upsertDebugRecord({
                ...debugRecordFromEvent(event, parsed, mediaType, 'accepted'),
                reachableUrl: availability.reachableUrl,
                statusCode: availability.statusCode,
              })

              // Only video contributions feed the playable variant list.
              // Thumbnails and subtitles are surfaced for the debug section only;
              // their integration paths live elsewhere.
              if (mediaType === 'video') {
                setVariants(current => [...current, variant])
              }
            })
            .catch(error => {
              if (!(error instanceof DOMException && error.name === 'AbortError')) {
                upsertDebugRecord({
                  ...debugRecordFromEvent(event, parsed, mediaType, 'unavailable'),
                  error: error instanceof Error ? error.message : String(error),
                })
                console.error('Contributed variant availability check failed', error)
              }
            })
            .finally(() => probingUrls.delete(probeKey))
        },
        error: err => console.error('Contributed variant subscription failed', err),
      })

    return () => {
      cancelled = true
      abortController.abort()
      subscription.unsubscribe()
    }
  }, [relays, video])

  return { variants, debugRecords }
}
