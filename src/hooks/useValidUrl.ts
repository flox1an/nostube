import { useMediaUrls } from './useMediaUrls'
import type { MediaType } from '@/lib/media-url-generator'

interface UseValidUrlOptions {
  urls: string[]
  blossomServers?: string[]
  resourceType?: 'video' | 'image'
  enabled?: boolean
  sha256?: string
}

interface UseValidUrlResult {
  validUrl: string | null
  isValidating: boolean
  error: Error | null
}

/**
 * React hook to find a valid URL from a list of URLs
 * Automatically validates URLs and provides Blossom server fallbacks
 *
 * @deprecated Use useMediaUrls instead for better failover support
 */
export function useValidUrl(options: UseValidUrlOptions): UseValidUrlResult {
  const { urls, resourceType = 'video', enabled = true, sha256 } = options

  // Use new media URL failover system
  const { currentUrl, isLoading, error } = useMediaUrls({
    urls,
    mediaType: resourceType as MediaType,
    sha256,
    enabled,
  })

  return {
    validUrl: currentUrl,
    isValidating: isLoading,
    error,
  }
}
