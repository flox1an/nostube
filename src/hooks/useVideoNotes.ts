import { useEffect, useState, useMemo } from 'react'
import { useAppContext, useReadRelays } from '@/hooks'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { extractBlossomHash } from '@/utils/video-event'
import { nip19 } from 'nostr-tools'
import type { NostrEvent } from 'nostr-tools'

// Test npub: npub10uthwp4ddc9w5adfuv69m8la4enkwma07fymuetmt93htcww6wgs55xdlq
const TEST_PUBKEY = '7f177706ad6e0aea75a9e3345d9ffdae67676faff249be657b596375e1ced391'

export interface VideoNote {
  id: string
  content: string
  created_at: number
  videoUrls: string[]
  imetaTags: string[][]
  blossomHashes: string[]
  thumbnailUrl?: string
  sizeBytes?: number
  /** Pubkeys referenced via p tags or nostr:npub/nprofile mentions in content */
  pubkeys: string[]
  isReposted: boolean
}

// URL regex to extract URLs from content
const URL_REGEX = /https?:\/\/[^\s]+/g

// Regex to match nostr:npub1... and nostr:nprofile1... mentions in content
const NOSTR_MENTION_REGEX = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/g

/**
 * Extract unique pubkeys from event p tags and nostr: mentions in content
 */
function extractPubkeys(content: string, tags: string[][]): string[] {
  const pubkeys = new Set<string>()

  // Extract from p tags
  for (const tag of tags) {
    if (tag[0] === 'p' && tag[1]) {
      pubkeys.add(tag[1])
    }
  }

  // Extract from nostr:npub1... and nostr:nprofile1... in content
  const matches = content.matchAll(NOSTR_MENTION_REGEX)
  for (const match of matches) {
    try {
      const decoded = nip19.decode(match[1])
      if (decoded.type === 'npub') {
        pubkeys.add(decoded.data)
      } else if (decoded.type === 'nprofile') {
        pubkeys.add(decoded.data.pubkey)
      }
    } catch {
      // Invalid nostr identifier, skip
    }
  }

  return Array.from(pubkeys)
}

/**
 * Extract video URLs from Kind 1 note content
 */
function extractVideoUrls(content: string, tags: string[][]): string[] {
  const urls: string[] = []

  // Extract from content
  const contentUrls = content.match(URL_REGEX) || []
  urls.push(...contentUrls)

  // Extract from imeta tags
  const imetaTags = tags.filter(t => t[0] === 'imeta')
  imetaTags.forEach(imetaTag => {
    for (let i = 1; i < imetaTag.length; i++) {
      const [key, value] = imetaTag[i].split(' ', 2)
      if (key === 'url' && value) {
        urls.push(value)
      }
    }
  })

  // Filter for video URLs (must have video extension)
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m3u8', '.flv', '.wmv']
  const videoUrls = urls.filter(url => {
    const lowerUrl = url.toLowerCase()
    // Only include URLs with video extensions
    return videoExtensions.some(ext => lowerUrl.includes(ext))
  })

  return videoUrls
}

/**
 * Hook to load and process Kind 1 notes with videos from a test user
 */
export function useVideoNotes() {
  console.log('VideoNotes: Hook function called')

  const { pool } = useAppContext()
  const readRelays = useReadRelays()
  const eventStore = useEventStore()
  const [notes, setNotes] = useState<VideoNote[]>([])
  const [loading, setLoading] = useState(true)

  console.log('VideoNotes: Dependencies loaded:', {
    testPubkey: TEST_PUBKEY.slice(0, 8),
    hasPool: !!pool,
    readRelaysCount: readRelays?.length,
    hasEventStore: !!eventStore,
  })

  // Track which video URLs the user has already reposted
  const videoUrlSet = useMemo(() => new Set<string>(), [])

  useEffect(() => {
    if (!pool || !readRelays || readRelays.length === 0) {
      console.log('VideoNotes: Waiting for pool or relays...')
      return
    }

    console.log('VideoNotes: Starting to load notes for test user:', TEST_PUBKEY.slice(0, 8))

    let videoSub: { unsubscribe: () => void } | null = null
    let notesSub: { unsubscribe: () => void } | null = null
    const notesArray: NostrEvent[] = []

    // Load test user's video events to check for reposts
    const videoKinds = [21, 22, 34235, 34236]
    const videoLoader = createTimelineLoader(
      pool,
      readRelays,
      [{ kinds: videoKinds, authors: [TEST_PUBKEY], limit: 100 }],
      { eventStore }
    )

    // Load Kind 1 notes in parallel
    const notesLoader = createTimelineLoader(
      pool,
      readRelays,
      [{ kinds: [1], authors: [TEST_PUBKEY], limit: 100 }],
      { eventStore }
    )

    console.log('VideoNotes: Created loaders, subscribing...')

    // Subscribe to video events to build URL set
    videoSub = videoLoader().subscribe({
      next: (event: NostrEvent) => {
        // Extract URLs from imeta tags
        const imetaTags = event.tags.filter(t => t[0] === 'imeta')
        imetaTags.forEach(imetaTag => {
          for (let i = 1; i < imetaTag.length; i++) {
            const [key, value] = imetaTag[i].split(' ', 2)
            if (key === 'url' && value) {
              videoUrlSet.add(value)
            }
          }
        })

        // Extract from old format
        const urlTag = event.tags.find(t => t[0] === 'url')
        if (urlTag?.[1]) {
          videoUrlSet.add(urlTag[1])
        }
      },
      error: err => {
        console.error('VideoNotes: Error loading video events:', err)
      },
    })

    // Subscribe to Kind 1 notes
    notesSub = notesLoader().subscribe({
      next: (event: NostrEvent) => {
        notesArray.push(event)
      },
      error: err => {
        console.error('VideoNotes: Error loading notes:', err)
      },
    })

    // Process notes after a delay to allow events to load
    const processTimeout = setTimeout(() => {
      console.log(
        `VideoNotes: Processing ${notesArray.length} notes with ${videoUrlSet.size} video URLs`
      )

      const processedNotes: VideoNote[] = notesArray
        .map(event => {
          const videoUrls = extractVideoUrls(event.content, event.tags)
          if (videoUrls.length === 0) return null

          const imetaTags = event.tags.filter(t => t[0] === 'imeta')
          const blossomHashes = videoUrls
            .map(url => extractBlossomHash(url).sha256)
            .filter((hash): hash is string => !!hash)

          // Get thumbnail and size from imeta or first video URL
          let thumbnailUrl: string | undefined
          let sizeBytes: number | undefined
          if (imetaTags.length > 0) {
            const firstImeta = imetaTags[0]
            for (let i = 1; i < firstImeta.length; i++) {
              const [key, value] = firstImeta[i].split(' ', 2)
              if (key === 'image' && value && !thumbnailUrl) {
                thumbnailUrl = value
              }
              if (key === 'size' && value) {
                const parsed = parseInt(value, 10)
                if (!isNaN(parsed) && parsed > 0) sizeBytes = parsed
              }
            }
          }
          if (!thumbnailUrl && videoUrls[0]) {
            thumbnailUrl = videoUrls[0]
          }

          // Extract referenced pubkeys from p tags and nostr: mentions
          const pubkeys = extractPubkeys(event.content, event.tags)

          // Check if any of the video URLs have been reposted
          const isReposted = videoUrls.some(url => videoUrlSet.has(url))

          return {
            id: event.id,
            content: event.content,
            created_at: event.created_at,
            videoUrls,
            imetaTags,
            blossomHashes,
            thumbnailUrl,
            sizeBytes,
            pubkeys,
            isReposted,
          } as VideoNote
        })
        .filter((note): note is VideoNote => note !== null)
        .sort((a, b) => b.created_at - a.created_at) // Sort by newest first

      console.log(`VideoNotes: Found ${processedNotes.length} notes with videos`)
      setNotes(processedNotes)
      setLoading(false)
    }, 3000) // Wait 3 seconds for events to load

    return () => {
      clearTimeout(processTimeout)
      if (videoSub) {
        videoSub.unsubscribe()
      }
      if (notesSub) {
        notesSub.unsubscribe()
      }
    }
  }, [pool, readRelays, eventStore, videoUrlSet])

  return {
    notes,
    loading,
  }
}
