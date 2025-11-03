/**
 * URL Validator Library
 *
 * Handles finding valid URLs for videos and thumbnails with:
 * - HEAD request validation
 * - Blossom server fallback URLs
 * - Multiple URL attempts
 * - Caching of successful URLs
 */

interface UrlValidationResult {
  url: string
  isValid: boolean
  statusCode?: number
  contentType?: string
}

interface FindValidUrlOptions {
  urls: string[]
  blossomServers?: string[]
  timeout?: number
  cache?: boolean
  resourceType?: 'video' | 'image'
}

// Cache for validated URLs to avoid repeated HEAD requests
const urlCache = new Map<string, { url: string; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Extract hash from a URL (for Blossom server fallbacks)
 * Supports both direct URLs and Blossom URLs
 */
function extractHash(url: string): string | null {
  try {
    const urlObj = new URL(url)

    // Check if it's a Blossom URL format: /hash or /hash.ext
    const pathMatch = urlObj.pathname.match(/\/([a-f0-9]{64})(?:\.[a-z0-9]+)?$/i)
    if (pathMatch) {
      return pathMatch[1]
    }

    // Check for hash in query params
    const hashParam = urlObj.searchParams.get('hash')
    if (hashParam) {
      return hashParam
    }

    return null
  } catch {
    return null
  }
}

/**
 * Generate fallback URLs using Blossom servers
 */
function generateBlossomFallbackUrls(
  originalUrl: string,
  blossomServers: string[]
): string[] {
  const hash = extractHash(originalUrl)
  if (!hash || blossomServers.length === 0) {
    return []
  }

  // Get file extension from original URL
  const extension = originalUrl.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || ''

  return blossomServers.map(server => {
    const baseUrl = server.endsWith('/') ? server.slice(0, -1) : server
    return extension ? `${baseUrl}/${hash}.${extension}` : `${baseUrl}/${hash}`
  })
}

/**
 * Validate a single URL using HEAD request
 */
async function validateUrl(
  url: string,
  timeout: number = 5000
): Promise<UrlValidationResult> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      // Don't follow redirects for more control
      redirect: 'manual',
    })

    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || undefined

    // Consider 2xx and 3xx as valid
    const isValid = response.status >= 200 && response.status < 400

    return {
      url,
      isValid,
      statusCode: response.status,
      contentType,
    }
  } catch (error) {
    console.debug(`URL validation failed for ${url}:`, error)
    return {
      url,
      isValid: false,
    }
  }
}

/**
 * Find the first valid URL from a list of URLs
 * Tries URLs in order and returns the first one that responds successfully
 */
export async function findValidUrl(
  options: FindValidUrlOptions
): Promise<string | null> {
  const {
    urls,
    blossomServers = [],
    timeout = 5000,
    cache = true,
    resourceType = 'video',
  } = options

  if (urls.length === 0) {
    return null
  }

  // Check cache first
  if (cache) {
    const cacheKey = urls[0] // Use first URL as cache key
    const cached = urlCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.debug(`Using cached URL for ${resourceType}:`, cached.url)
      return cached.url
    }
  }

  // Build list of URLs to try
  const urlsToTry: string[] = [...urls]

  // Add Blossom server fallbacks for the first URL
  if (blossomServers.length > 0 && urls.length > 0) {
    const fallbackUrls = generateBlossomFallbackUrls(urls[0], blossomServers)
    urlsToTry.push(...fallbackUrls)
  }

  console.debug(`Trying ${urlsToTry.length} URLs for ${resourceType}`)

  // Try URLs sequentially (not in parallel to avoid overwhelming servers)
  for (const url of urlsToTry) {
    const result = await validateUrl(url, timeout)

    if (result.isValid) {
      console.debug(`Found valid URL for ${resourceType}:`, url)

      // Cache the successful URL
      if (cache) {
        urlCache.set(urls[0], { url, timestamp: Date.now() })
      }

      return url
    }
  }

  // If no URL works, return the first one as fallback
  console.warn(`No valid URL found for ${resourceType}, using first URL as fallback`)
  return urls[0] || null
}

/**
 * Find valid URLs for multiple resources in parallel
 * Useful for preloading multiple videos/images
 */
export async function findValidUrls(
  resources: FindValidUrlOptions[]
): Promise<(string | null)[]> {
  return Promise.all(resources.map(options => findValidUrl(options)))
}

/**
 * Preload a URL by making a HEAD request
 * Useful for warming up the cache
 */
export async function preloadUrl(url: string, timeout: number = 5000): Promise<boolean> {
  const result = await validateUrl(url, timeout)
  return result.isValid
}

/**
 * Clear the URL cache
 */
export function clearUrlCache(): void {
  urlCache.clear()
}

/**
 * Get cache statistics
 */
export function getUrlCacheStats() {
  return {
    size: urlCache.size,
    entries: Array.from(urlCache.entries()).map(([key, value]) => ({
      key,
      url: value.url,
      age: Date.now() - value.timestamp,
    })),
  }
}
