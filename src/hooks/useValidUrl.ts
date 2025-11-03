import { useState, useEffect } from 'react'
import { findValidUrl } from '@/lib/url-validator'

interface UseValidUrlOptions {
  urls: string[]
  blossomServers?: string[]
  resourceType?: 'video' | 'image'
  enabled?: boolean
}

interface UseValidUrlResult {
  validUrl: string | null
  isValidating: boolean
  error: Error | null
}

/**
 * React hook to find a valid URL from a list of URLs
 * Automatically validates URLs and provides Blossom server fallbacks
 */
export function useValidUrl(options: UseValidUrlOptions): UseValidUrlResult {
  const { urls, blossomServers = [], resourceType = 'video', enabled = true } = options

  const [validUrl, setValidUrl] = useState<string | null>(urls[0] || null)
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Create stable references for dependency arrays
  const urlsKey = urls.join(',')
  const blossomServersKey = blossomServers.join(',')

  useEffect(() => {
    // If disabled or no URLs, just use first URL without validation
    if (!enabled || urls.length === 0) {
      return
    }

    let cancelled = false

    // Start validation asynchronously
    const validateUrls = async () => {
      // Set loading state at start of async operation
      if (!cancelled) {
        setIsValidating(true)
      }

      try {
        const url = await findValidUrl({
          urls,
          blossomServers,
          resourceType,
          cache: true,
          timeout: 5000,
        })

        if (!cancelled) {
          setValidUrl(url)
          setIsValidating(false)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setValidUrl(urls[0] || null) // Fallback to first URL
          setIsValidating(false)
        }
      }
    }

    validateUrls()

    return () => {
      cancelled = true
    }
  }, [urlsKey, blossomServersKey, resourceType, enabled, urls, blossomServers])

  return { validUrl, isValidating, error }
}
