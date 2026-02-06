/**
 * Mirror Announcements (NIP-94 Kind 1063)
 *
 * Publishes kind 1063 File Metadata events after successful mirror operations.
 * This announces new file locations to the network so other viewers can discover
 * additional fallback URLs for playback via the url-discovery system.
 */

import type { EventTemplate, NostrEvent } from 'nostr-tools'
import type { BlobDescriptor } from 'blossom-client-sdk'
import { relayPool } from '@/nostr/core'
import { nowInSecs } from '@/lib/utils'
import type { BlossomBlob } from '@/lib/blossom-blob-extractor'

/**
 * Information about the source video event for attribution
 */
export interface VideoEventInfo {
  id: string
  kind: number
  pubkey: string
  dTag?: string // For addressable events (kinds 34235/34236)
}

/**
 * Options for building a mirror announcement event
 */
export interface MirrorAnnouncementOptions {
  /** The mirrored blob with metadata */
  blob: BlossomBlob
  /** Successful mirror results with URLs */
  mirrorResults: BlobDescriptor[]
  /** Source video event info for attribution */
  videoEvent: VideoEventInfo
  /** Best relay hint for e/a tags */
  relayHint: string
}

/**
 * Signer interface for signing events
 */
export interface MirrorAnnouncementSigner {
  signEvent: (event: EventTemplate) => Promise<NostrEvent>
}

/**
 * Build a kind 1063 File Metadata event for a mirrored blob
 *
 * Tags included:
 * - url: Primary mirror URL (first successful mirror)
 * - fallback: Additional mirror URLs (one tag per URL)
 * - x: SHA256 hex hash of the file
 * - m: MIME type
 * - size: File size in bytes
 * - dim: Dimensions (when available, for video/images)
 * - e: Video event ID + relay hint
 * - a: Address for addressable events (kind:pubkey:d-tag)
 * - k: Kind of the referenced video event (addressable only)
 */
export function buildFileMetadataEvent(options: MirrorAnnouncementOptions): EventTemplate {
  const { blob, mirrorResults, videoEvent, relayHint } = options

  if (mirrorResults.length === 0) {
    throw new Error('No mirror results to announce')
  }

  // Primary URL is the first mirror result
  const primaryUrl = mirrorResults[0].url
  const fallbackUrls = mirrorResults.slice(1).map(r => r.url)

  // Build tags
  const tags: string[][] = []

  // Required tags
  tags.push(['url', primaryUrl])

  // Fallback URLs (one tag per additional mirror)
  for (const url of fallbackUrls) {
    tags.push(['fallback', url])
  }

  // File hash (required)
  if (blob.hash) {
    tags.push(['x', blob.hash])
  }

  // MIME type (required)
  const mimeType = blob.variant.mimeType || getMimeTypeForBlob(blob)
  tags.push(['m', mimeType])

  // File size (required)
  const size = mirrorResults[0].size || blob.variant.size
  if (size) {
    tags.push(['size', size.toString()])
  }

  // Dimensions (when available)
  if (blob.variant.dimensions) {
    tags.push(['dim', blob.variant.dimensions])
  }

  // Video event reference (required)
  tags.push(['e', videoEvent.id, relayHint])

  // Addressable event references (for kinds 34235/34236)
  const isAddressable = videoEvent.kind === 34235 || videoEvent.kind === 34236
  if (isAddressable && videoEvent.dTag !== undefined) {
    const address = `${videoEvent.kind}:${videoEvent.pubkey}:${videoEvent.dTag}`
    tags.push(['a', address, relayHint])
    tags.push(['k', videoEvent.kind.toString()])
  }

  return {
    kind: 1063,
    content: '',
    created_at: nowInSecs(),
    tags,
  }
}

/**
 * Get MIME type for a blob based on its type and extension
 */
function getMimeTypeForBlob(blob: BlossomBlob): string {
  // Use variant's mimeType if available
  if (blob.variant.mimeType) {
    return blob.variant.mimeType
  }

  // Infer from blob type and extension
  const ext = blob.ext?.toLowerCase()

  switch (blob.type) {
    case 'video':
      switch (ext) {
        case 'mp4':
          return 'video/mp4'
        case 'webm':
          return 'video/webm'
        case 'mov':
          return 'video/quicktime'
        case 'avi':
          return 'video/x-msvideo'
        default:
          return 'video/mp4'
      }
    case 'thumbnail':
      switch (ext) {
        case 'jpg':
        case 'jpeg':
          return 'image/jpeg'
        case 'png':
          return 'image/png'
        case 'webp':
          return 'image/webp'
        case 'gif':
          return 'image/gif'
        default:
          return 'image/jpeg'
      }
    case 'subtitle':
      switch (ext) {
        case 'vtt':
          return 'text/vtt'
        case 'srt':
          return 'text/srt'
        default:
          return 'text/vtt'
      }
    default:
      return 'application/octet-stream'
  }
}

/**
 * Publish mirror announcement events for multiple blobs
 *
 * Creates and publishes kind 1063 events for each blob that was successfully mirrored.
 * Errors are logged but don't cause the function to throw - the mirror itself
 * already succeeded, so 1063 publishing failures shouldn't break the flow.
 *
 * @param announcements - Array of mirror announcement options (one per blob)
 * @param signer - Signer to sign the events
 * @param publishRelays - Relays to publish the 1063 events to
 */
export async function publishMirrorAnnouncements(
  announcements: MirrorAnnouncementOptions[],
  signer: MirrorAnnouncementSigner,
  publishRelays: string[]
): Promise<void> {
  if (announcements.length === 0 || publishRelays.length === 0) {
    return
  }

  const results = await Promise.allSettled(
    announcements.map(async announcement => {
      // Skip if no mirror results
      if (announcement.mirrorResults.length === 0) {
        return
      }

      // Skip if no hash (can't create valid 1063 without hash)
      if (!announcement.blob.hash) {
        if (import.meta.env.DEV) {
          console.warn('[MirrorAnnouncements] Skipping blob without hash:', announcement.blob.label)
        }
        return
      }

      try {
        const eventTemplate = buildFileMetadataEvent(announcement)
        const signedEvent = await signer.signEvent(eventTemplate)
        await relayPool.publish(publishRelays, signedEvent)

        if (import.meta.env.DEV) {
          console.log(
            '[MirrorAnnouncements] Published 1063 for:',
            announcement.blob.label,
            'to',
            publishRelays.length,
            'relays'
          )
        }
      } catch (error) {
        console.warn(
          '[MirrorAnnouncements] Failed to publish 1063 for:',
          announcement.blob.label,
          error
        )
      }
    })
  )

  // Log summary in dev mode
  if (import.meta.env.DEV) {
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    console.log(`[MirrorAnnouncements] Published ${successful} events, ${failed} failed`)
  }
}

/**
 * Get publish relays for mirror announcements
 *
 * Returns the union of:
 * - User's write relays (from config)
 * - Video event relays (where the video was seen/published)
 */
export function getMirrorAnnouncementRelays(
  userWriteRelays: string[],
  videoEventRelays: string[]
): string[] {
  const relaySet = new Set<string>()

  // Add user's write relays
  for (const relay of userWriteRelays) {
    if (relay) {
      relaySet.add(relay)
    }
  }

  // Add video event relays
  for (const relay of videoEventRelays) {
    if (relay) {
      relaySet.add(relay)
    }
  }

  return Array.from(relaySet)
}
