/**
 * URL Validator Library
 *
 * Handles finding valid URLs for videos and thumbnails with:
 * - HEAD request validation
 * - Blossom server fallback URLs
 * - Multiple URL attempts
 * - Caching of successful URLs
 * - Media-specific validation (content type, size)
 */

export type MediaType = 'video' | 'image' | 'vtt' | 'audio'

interface UrlValidationResult {
  url: string
  isValid: boolean
  statusCode?: number
  contentType?: string
  contentLength?: number
}

interface FindValidUrlOptions {
  urls: string[]
  blossomServers?: string[]
  timeout?: number
  cache?: boolean
  resourceType?: MediaType
}

export interface ValidationOptions {
  timeout?: number // Default 5s
  expectedContentType?: string[] // e.g., ['video/mp4', 'video/webm']
  minSize?: number // Minimum Content-Length
  maxSize?: number // Maximum Content-Length
}

// Cache for validated URLs to avoid repeated HEAD requests
// Separate caches by media type
const urlCaches = {
  video: new Map<string, { url: string; timestamp: number }>(),
  image: new Map<string, { url: string; timestamp: number }>(),
  vtt: new Map<string, { url: string; timestamp: number }>(),
  audio: new Map<string, { url: string; timestamp: number }>(),
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes for valid URLs
const INVALID_CACHE_TTL = 1 * 60 * 1000 // 1 minute for invalid URLs

// Cache for invalid URLs (shorter TTL for retry)
const invalidUrlCache = new Map<string, number>()

// Metrics for debugging
interface ValidationMetrics {
  totalRequests: number
  cacheHits: number
  cacheMisses: number
  validationTimes: number[]
}

const metrics: Record<MediaType, ValidationMetrics> = {
  video: { totalRequests: 0, cacheHits: 0, cacheMisses: 0, validationTimes: [] },
  image: { totalRequests: 0, cacheHits: 0, cacheMisses: 0, validationTimes: [] },
  vtt: { totalRequests: 0, cacheHits: 0, cacheMisses: 0, validationTimes: [] },
  audio: { totalRequests: 0, cacheHits: 0, cacheMisses: 0, validationTimes: [] },
}

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
function generateBlossomFallbackUrls(originalUrl: string, blossomServers: string[]): string[] {
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
 * Validate a single URL using HEAD request with enhanced validation
 */
async function validateUrl(
  url: string,
  timeout: number = 5000,
  options?: ValidationOptions
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
    const contentLengthStr = response.headers.get('content-length')
    const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined

    // Consider 2xx and 3xx as valid
    let isValid = response.status >= 200 && response.status < 400

    // Validate content type if specified
    if (isValid && options?.expectedContentType && contentType) {
      const matchesContentType = options.expectedContentType.some(expected =>
        contentType.toLowerCase().includes(expected.toLowerCase())
      )
      if (!matchesContentType) {
        isValid = false
        if (import.meta.env.DEV) {
          console.debug(
            `URL content type mismatch: ${url} - Expected: ${options.expectedContentType.join(', ')}, Got: ${contentType}`
          )
        }
      }
    }

    // Validate content length if specified
    if (isValid && contentLength !== undefined) {
      if (options?.minSize && contentLength < options.minSize) {
        isValid = false
        if (import.meta.env.DEV) {
          console.debug(
            `URL content too small: ${url} - Min: ${options.minSize}, Got: ${contentLength}`
          )
        }
      }
      if (options?.maxSize && contentLength > options.maxSize) {
        isValid = false
        if (import.meta.env.DEV) {
          console.debug(
            `URL content too large: ${url} - Max: ${options.maxSize}, Got: ${contentLength}`
          )
        }
      }
    }

    return {
      url,
      isValid,
      statusCode: response.status,
      contentType,
      contentLength,
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
 * Validate a media URL with enhanced validation options
 */
export async function validateMediaUrl(url: string, options?: ValidationOptions): Promise<boolean> {
  const startTime = Date.now()
  const result = await validateUrl(url, options?.timeout || 5000, options)
  const validationTime = Date.now() - startTime

  // Track metrics (we'll use 'video' as default if not specified)
  const mediaType: MediaType = 'video'
  metrics[mediaType].totalRequests++
  metrics[mediaType].validationTimes.push(validationTime)

  // Keep only last 100 validation times for metrics
  if (metrics[mediaType].validationTimes.length > 100) {
    metrics[mediaType].validationTimes = metrics[mediaType].validationTimes.slice(-100)
  }

  return result.isValid
}

/**
 * Find the first valid URL from a list of URLs
 * Tries URLs in order and returns the first one that responds successfully
 */
export async function findValidUrl(options: FindValidUrlOptions): Promise<string | null> {
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

  const mediaType = resourceType as MediaType
  const urlCache = urlCaches[mediaType]

  // Track metrics
  metrics[mediaType].totalRequests++

  // Check cache first
  if (cache) {
    const cacheKey = urls[0] // Use first URL as cache key
    const cached = urlCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.debug(`Using cached URL for ${resourceType}:`, cached.url)
      metrics[mediaType].cacheHits++
      return cached.url
    }

    // Check invalid URL cache
    const invalidTimestamp = invalidUrlCache.get(cacheKey)
    if (invalidTimestamp && Date.now() - invalidTimestamp < INVALID_CACHE_TTL) {
      console.debug(`URL recently failed validation for ${resourceType}:`, cacheKey)
      // Still try it, but we know it recently failed
    }
  }

  metrics[mediaType].cacheMisses++

  // Build list of URLs to try
  const urlsToTry: string[] = [...urls]

  // Add Blossom server fallbacks for the first URL
  if (blossomServers.length > 0 && urls.length > 0) {
    const fallbackUrls = generateBlossomFallbackUrls(urls[0], blossomServers)
    urlsToTry.push(...fallbackUrls)
  }

  console.debug(`Trying ${urlsToTry.length} URLs for ${resourceType}`)

  // Try URLs sequentially (not in parallel to avoid overwhelming servers)
  const startTime = Date.now()
  for (const url of urlsToTry) {
    const result = await validateUrl(url, timeout)

    if (result.isValid) {
      console.debug(`Found valid URL for ${resourceType}:`, url)

      // Cache the successful URL
      if (cache) {
        urlCache.set(urls[0], { url, timestamp: Date.now() })
        // Remove from invalid cache if present
        invalidUrlCache.delete(urls[0])
      }

      // Track validation time
      const validationTime = Date.now() - startTime
      metrics[mediaType].validationTimes.push(validationTime)
      if (metrics[mediaType].validationTimes.length > 100) {
        metrics[mediaType].validationTimes = metrics[mediaType].validationTimes.slice(-100)
      }

      return url
    }
  }

  // Track validation time even if failed
  const validationTime = Date.now() - startTime
  metrics[mediaType].validationTimes.push(validationTime)
  if (metrics[mediaType].validationTimes.length > 100) {
    metrics[mediaType].validationTimes = metrics[mediaType].validationTimes.slice(-100)
  }

  // Cache the failed validation
  if (cache) {
    invalidUrlCache.set(urls[0], Date.now())
  }

  // If no URL works, return the first one as fallback
  console.warn(`No valid URL found for ${resourceType}, using first URL as fallback`)
  return urls[0] || null
}

/**
 * Find valid URLs for multiple resources in parallel
 * Useful for preloading multiple videos/images
 */
export async function findValidUrls(resources: FindValidUrlOptions[]): Promise<(string | null)[]> {
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
 * Clear the URL cache for a specific media type or all types
 */
export function clearUrlCache(mediaType?: MediaType): void {
  if (mediaType) {
    urlCaches[mediaType].clear()
  } else {
    // Clear all caches
    Object.values(urlCaches).forEach(cache => cache.clear())
    invalidUrlCache.clear()
  }
}

/**
 * Get cache statistics for a specific media type or all types
 */
export function getUrlCacheStats(mediaType?: MediaType) {
  if (mediaType) {
    const cache = urlCaches[mediaType]
    return {
      mediaType,
      size: cache.size,
      entries: Array.from(cache.entries()).map(([key, value]) => ({
        key,
        url: value.url,
        age: Date.now() - value.timestamp,
      })),
    }
  } else {
    // Return stats for all media types
    return Object.entries(urlCaches).map(([type, cache]) => ({
      mediaType: type,
      size: cache.size,
      entries: Array.from(cache.entries()).map(([key, value]) => ({
        key,
        url: value.url,
        age: Date.now() - value.timestamp,
      })),
    }))
  }
}

/**
 * Get validation metrics for debugging
 */
export function getValidationMetrics(mediaType?: MediaType) {
  if (mediaType) {
    const m = metrics[mediaType]
    const avgValidationTime =
      m.validationTimes.length > 0
        ? m.validationTimes.reduce((a, b) => a + b, 0) / m.validationTimes.length
        : 0

    return {
      mediaType,
      totalRequests: m.totalRequests,
      cacheHits: m.cacheHits,
      cacheMisses: m.cacheMisses,
      cacheHitRate: m.totalRequests > 0 ? (m.cacheHits / m.totalRequests) * 100 : 0,
      avgValidationTime: Math.round(avgValidationTime),
      validationSamples: m.validationTimes.length,
    }
  } else {
    // Return metrics for all media types
    return Object.keys(metrics).map(type => getValidationMetrics(type as MediaType))
  }
}

/**
 * Reset validation metrics
 */
export function resetValidationMetrics(mediaType?: MediaType): void {
  if (mediaType) {
    metrics[mediaType] = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      validationTimes: [],
    }
  } else {
    // Reset all metrics
    Object.keys(metrics).forEach(type => {
      metrics[type as MediaType] = {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        validationTimes: [],
      }
    })
  }
}
