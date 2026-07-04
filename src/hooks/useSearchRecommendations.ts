import { useState, useEffect } from 'react'
import { useAppContext } from '@/hooks'
import { SEARCH_SERVICE_URL } from '@/lib/search-client'
import { YOUTUBE_REGEX } from '@/utils/origin-utils'
import type { RecommendationVideo } from '@/types/recommendation'

const TIMEOUT_MS = 5000

export function filterRecommendationsForSettings(
  videos: RecommendationVideo[],
  options: { includeYouTube: boolean }
): RecommendationVideo[] {
  if (options.includeYouTube) return videos
  return videos.filter(video => !video.urls.some(url => YOUTUBE_REGEX.test(url)))
}

export function useSearchRecommendations(params: {
  videoRef: string | undefined
  userPubkey: string | undefined
  excludeContentWarnings: boolean
  limit?: number
}): { videos: RecommendationVideo[] | null; isLoading: boolean } {
  const { videoRef, userPubkey, excludeContentWarnings, limit = 30 } = params
  const { config } = useAppContext()
  const [videos, setVideos] = useState<RecommendationVideo[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!videoRef) return

    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    setIsLoading(true)
    setVideos(null)

    fetch(`${config.searchServiceUrl || SEARCH_SERVICE_URL}/api/recommendations/related`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoRef,
        ...(userPubkey ? { user: userPubkey } : {}),
        limit,
        excludeContentWarnings,
      }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ hits: RecommendationVideo[] }>
      })
      .then(data => {
        if (!cancelled) {
          setVideos(
            filterRecommendationsForSettings(data.hits ?? [], {
              includeYouTube: config.showYouTubeContent ?? true,
            })
          )
        }
      })
      .catch(() => {
        if (!cancelled) setVideos(null)
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [
    videoRef,
    userPubkey,
    excludeContentWarnings,
    limit,
    config.searchServiceUrl,
    config.showYouTubeContent,
  ])

  return { videos, isLoading }
}
