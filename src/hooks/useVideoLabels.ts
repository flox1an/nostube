import { useState, useEffect } from 'react'
import { useAppContext } from './useAppContext'
import { useReadRelays } from './useReadRelays'
import { useEventStore } from 'applesauce-react/hooks'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import type { NostrEvent } from 'nostr-tools'

export interface VideoLabels {
  hashtags: string[] // Additional hashtags from labels
  languages: string[] // Language codes from labels (ISO-639-1)
  loading: boolean
}

/**
 * Hook to load and parse NIP-32 label events (kind 1985) for a video
 * Extracts hashtags from #t namespace and languages from ISO-639-1 namespace
 */
export function useVideoLabels(videoEventId: string | undefined): VideoLabels {
  const { pool } = useAppContext()
  const readRelays = useReadRelays()
  const eventStore = useEventStore()
  const [hashtags, setHashtags] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!videoEventId || !pool || !readRelays || readRelays.length === 0) {
      queueMicrotask(() => setLoading(false))
      return
    }

    queueMicrotask(() => setLoading(true))
    const labelEvents: NostrEvent[] = []

    // Query kind 1985 events that reference this video
    const loader = createTimelineLoader(
      pool,
      readRelays,
      [
        {
          kinds: [1985],
          '#e': [videoEventId],
          limit: 100,
        },
      ],
      { eventStore }
    )

    const subscription = loader().subscribe({
      next: (event: NostrEvent) => {
        labelEvents.push(event)
      },
      error: err => {
        console.error('Error loading label events:', err)
      },
    })

    // Process labels after a delay to allow events to load
    const processTimeout = setTimeout(() => {
      const extractedHashtags = new Set<string>()
      const extractedLanguages = new Set<string>()

      labelEvents.forEach(event => {
        // Parse label tags
        event.tags.forEach((tag, index) => {
          if (tag[0] === 'L') {
            const namespace = tag[1]

            // Look for corresponding 'l' tags
            for (let i = index + 1; i < event.tags.length; i++) {
              const nextTag = event.tags[i]

              // Stop if we hit another 'L' tag (new namespace)
              if (nextTag[0] === 'L') break

              // Process 'l' tag if it matches this namespace
              if (nextTag[0] === 'l' && nextTag[2] === namespace) {
                const value = nextTag[1]

                if (namespace === '#t') {
                  // Hashtag label
                  extractedHashtags.add(value.toLowerCase())
                } else if (namespace === 'ISO-639-1') {
                  // Language label
                  extractedLanguages.add(value.toLowerCase())
                }
              }
            }
          }
        })
      })

      setHashtags(Array.from(extractedHashtags))
      setLanguages(Array.from(extractedLanguages))
      setLoading(false)
    }, 2000) // Wait 2 seconds for events to load

    return () => {
      clearTimeout(processTimeout)
      subscription.unsubscribe()
    }
  }, [videoEventId, pool, readRelays, eventStore])

  return {
    hashtags,
    languages,
    loading,
  }
}
