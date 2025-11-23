import { useEffect, useState, useMemo } from 'react'
import { useCurrentUser, useAppContext, useReadRelays } from '@/hooks'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { extractBlossomHash } from '@/utils/video-event'
import type { NostrEvent } from 'nostr-tools'

export interface VideoNote {
  id: string
  content: string
  created_at: number
  videoUrls: string[]
  imetaTags: string[][]
  blossomHashes: string[]
  thumbnailUrl?: string
  isReposted: boolean
}

// URL regex to extract URLs from content
const URL_REGEX = /https?:\/\/[^\s]+/g

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
 * Hook to load and process Kind 1 notes with videos from the current user
 */
export function useVideoNotes() {
  console.log('VideoNotes: Hook function called')

  const { user } = useCurrentUser()
  const { pool } = useAppContext()
  const readRelays = useReadRelays()
  const eventStore = useEventStore()
  const [notes, setNotes] = useState<VideoNote[]>([])
  const [loading, setLoading] = useState(true)

  console.log('VideoNotes: Dependencies loaded:', {
    hasUser: !!user,
    userPubkey: user?.pubkey?.slice(0, 8),
    hasPool: !!pool,
    readRelaysCount: readRelays?.length,
    hasEventStore: !!eventStore,
  })

  // Track which video URLs the user has already reposted
  const videoUrlSet = useMemo(() => new Set<string>(), [])

  useEffect(() => {
    if (!user) {
      console.log('VideoNotes: No user logged in')
      queueMicrotask(() => setLoading(false))
      return
    }

    if (!pool || !readRelays || readRelays.length === 0) {
      console.log('VideoNotes: Waiting for pool or relays...')
      return
    }

    console.log('VideoNotes: Starting to load notes for user:', user.pubkey.slice(0, 8))

    let videoSub: { unsubscribe: () => void } | null = null
    let notesSub: { unsubscribe: () => void } | null = null
    const notesArray: NostrEvent[] = []

    // Load user's video events to check for reposts
    const videoKinds = [21, 22, 34235, 34236]
    const videoLoader = createTimelineLoader(
      pool,
      readRelays,
      [{ kinds: videoKinds, authors: [user.pubkey], limit: 100 }],
      { eventStore }
    )

    // Load Kind 1 notes in parallel
    const notesLoader = createTimelineLoader(
      pool,
      readRelays,
      [{ kinds: [1], authors: [user.pubkey], limit: 100 }],
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

          // Get thumbnail from imeta or first video URL
          let thumbnailUrl: string | undefined
          if (imetaTags.length > 0) {
            const firstImeta = imetaTags[0]
            for (let i = 1; i < firstImeta.length; i++) {
              const [key, value] = firstImeta[i].split(' ', 2)
              if (key === 'image' && value) {
                thumbnailUrl = value
                break
              }
            }
          }
          if (!thumbnailUrl && videoUrls[0]) {
            thumbnailUrl = videoUrls[0]
          }

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
  }, [user, pool, readRelays, eventStore, videoUrlSet])

  return {
    notes,
    loading,
    hasUser: !!user,
  }
}
