/**
 * Parse a Nostr video event into usable metadata
 * Supports kinds 21, 22, 34235, 34236 (NIP-71)
 * @param {Object} event - Nostr event
 * @returns {Object} Parsed video metadata
 */
export function parseVideoEvent(event) {
  // Find imeta tags (NIP-92)
  const imetaTags = event.tags.filter(t => t[0] === 'imeta')

  if (imetaTags.length > 0) {
    return parseImetaFormat(event, imetaTags)
  } else {
    return parseLegacyFormat(event)
  }
}

/**
 * Parse event with imeta tags (new format)
 */
function parseImetaFormat(event, imetaTags) {
  const allVariants = imetaTags.map(tag => parseImetaTag(tag)).filter(Boolean)

  // Separate videos and thumbnails
  const videoVariants = allVariants.filter(v => v.mimeType?.startsWith('video/'))
  const thumbnails = allVariants.filter(v => v.mimeType?.startsWith('image/'))

  // Also collect image URLs from standalone image fields in imeta
  imetaTags.forEach(tag => {
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i]
      if (part.startsWith('image ')) {
        const imageUrl = part.substring(6).trim()
        if (imageUrl && !thumbnails.some(t => t.url === imageUrl)) {
          thumbnails.push({ url: imageUrl, fallbackUrls: [] })
        }
      }
    }
  })

  // Sort videos by quality (highest first)
  videoVariants.sort((a, b) => {
    const qA = extractNumericQuality(a)
    const qB = extractNumericQuality(b)
    return qB - qA
  })

  // Extract other metadata
  const title = event.tags.find(t => t[0] === 'title')?.[1] ||
                event.tags.find(t => t[0] === 'alt')?.[1] ||
                event.content || 'Untitled Video'

  const description = event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]
  const author = event.pubkey

  return {
    id: event.id,
    kind: event.kind,
    title,
    description,
    author,
    createdAt: event.created_at,
    duration,
    contentWarning,
    videoVariants,
    thumbnails,
  }
}

/**
 * Parse event with legacy url/m/thumb tags (old format)
 */
function parseLegacyFormat(event) {
  const url = event.tags.find(t => t[0] === 'url')?.[1] || ''
  const mimeType = event.tags.find(t => t[0] === 'm')?.[1] || 'video/mp4'
  const thumb = event.tags.find(t => t[0] === 'thumb')?.[1] || ''
  const title = event.tags.find(t => t[0] === 'title')?.[1] || event.content || 'Untitled Video'
  const description = event.tags.find(t => t[0] === 'description')?.[1] || event.content || ''
  const duration = parseInt(event.tags.find(t => t[0] === 'duration')?.[1] || '0', 10)
  const contentWarning = event.tags.find(t => t[0] === 'content-warning')?.[1]
  const dimensions = event.tags.find(t => t[0] === 'dim')?.[1]

  const videoVariants = url ? [{
    url,
    mimeType,
    dimensions,
    fallbackUrls: [],
  }] : []

  const thumbnails = thumb ? [{
    url: thumb,
    fallbackUrls: [],
  }] : []

  return {
    id: event.id,
    kind: event.kind,
    title,
    description,
    author: event.pubkey,
    createdAt: event.created_at,
    duration,
    contentWarning,
    videoVariants,
    thumbnails,
  }
}

/**
 * Parse a single imeta tag
 * Format: ["imeta", "url <url>", "m <mime>", "dim <WxH>", ...]
 */
function parseImetaTag(imetaTag) {
  const data = {}

  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i]
    const spaceIndex = part.indexOf(' ')

    if (spaceIndex === -1) continue

    const key = part.substring(0, spaceIndex)
    const value = part.substring(spaceIndex + 1).trim()

    if (key === 'url') {
      data.url = value
    } else if (key === 'm') {
      data.mimeType = value
    } else if (key === 'dim') {
      data.dimensions = value
    } else if (key === 'size') {
      data.size = parseInt(value, 10)
    } else if (key === 'x') {
      data.hash = value
    } else if (key === 'fallback' || key === 'mirror') {
      if (!data.fallbackUrls) data.fallbackUrls = []
      data.fallbackUrls.push(value)
    }
  }

  if (!data.url) return null
  if (!data.fallbackUrls) data.fallbackUrls = []

  return data
}

/**
 * Extract numeric quality from variant (for sorting)
 */
function extractNumericQuality(variant) {
  if (variant.dimensions) {
    const match = variant.dimensions.match(/x(\d+)/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

/**
 * Select best video variant based on quality preference
 * @param {Array} variants - Video variants
 * @param {string} preferredQuality - 'auto', '1080p', '720p', etc.
 * @returns {Object} Selected variant
 */
export function selectVideoVariant(variants, preferredQuality = 'auto') {
  if (!variants || variants.length === 0) {
    return null
  }

  // Auto: return highest quality (first one, already sorted)
  if (preferredQuality === 'auto') {
    return variants[0]
  }

  // Extract target quality number (e.g., "1080p" -> 1080)
  const targetQuality = parseInt(preferredQuality, 10)
  if (isNaN(targetQuality)) {
    return variants[0]
  }

  // Find exact match or closest
  let bestMatch = variants[0]
  let bestDiff = Math.abs(extractNumericQuality(bestMatch) - targetQuality)

  for (const variant of variants) {
    const quality = extractNumericQuality(variant)
    const diff = Math.abs(quality - targetQuality)
    if (diff < bestDiff) {
      bestMatch = variant
      bestDiff = diff
    }
  }

  return bestMatch
}
