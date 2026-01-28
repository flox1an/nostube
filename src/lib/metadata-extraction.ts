/**
 * Video metadata extraction from MP4/M4V files
 * Extracts iTunes-style metadata from moov/udta/meta/ilst atoms
 */

import * as MP4Box from 'mp4box'
import type { Movie } from 'mp4box'
import {
  getIlstBox,
  parseIlstMetadata,
  extractStandardMetadata,
  extractThumbnailFromFile,
  type ThumbnailData,
} from './mp4box-atoms'

/**
 * Extracted video metadata from iTunes-style atoms
 */
export interface VideoMetadata {
  title?: string // From ©nam atom
  description?: string // From desc or ldes atom
  channel?: string // From ©ART atom (artist/creator)
  publishAt?: number // From ©day atom, parsed to Unix timestamp (seconds)
  tags?: string[] // From keyw atom (parsed and split)
  album?: string // From ©alb atom
  genre?: string // From ©gen atom
  comment?: string // From ©cmt atom
  youtubeId?: string // From custom key (logged only)
  source?: string // From custom key (logged only)
  thumbnail?: ThumbnailData // From covr atom
}

/**
 * Parse tags from raw keyword string
 * Splits on commas and semicolons, trims whitespace
 */
function parseTags(rawTags: string): string[] {
  return rawTags
    .split(/[,;]+/) // Split on commas and semicolons
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
}

/**
 * Parse date string to Unix timestamp (seconds)
 * Handles formats: YYYYMMDD, YYYY-MM-DD, YYYY
 */
function parseDate(dateStr: string): number | undefined {
  try {
    // Common formats: "20170307", "2017-03-07", "2017"
    let year: number
    let month = 1
    let day = 1

    if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
      // YYYYMMDD format (e.g., "20170307")
      year = parseInt(dateStr.substring(0, 4), 10)
      month = parseInt(dateStr.substring(4, 6), 10)
      day = parseInt(dateStr.substring(6, 8), 10)
    } else if (dateStr.includes('-')) {
      // YYYY-MM-DD format
      const parts = dateStr.split('-')
      year = parseInt(parts[0], 10)
      if (parts.length > 1) month = parseInt(parts[1], 10)
      if (parts.length > 2) day = parseInt(parts[2], 10)
    } else if (dateStr.length === 4 && /^\d{4}$/.test(dateStr)) {
      // YYYY format
      year = parseInt(dateStr, 10)
    } else {
      // Try to parse as-is
      const timestamp = Date.parse(dateStr)
      if (!isNaN(timestamp)) {
        return Math.floor(timestamp / 1000)
      }
      return undefined
    }

    // Create date and convert to Unix timestamp (seconds)
    const date = new Date(year, month - 1, day, 0, 0, 0, 0)
    return Math.floor(date.getTime() / 1000)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[METADATA] Error parsing date:', dateStr, error)
    }
    return undefined
  }
}

/**
 * Map raw iTunes metadata to VideoMetadata interface
 */
function mapItunesMetadata(rawMetadata: Record<string, any>): VideoMetadata {
  const metadata: VideoMetadata = {}

  // Standard iTunes atoms
  if (rawMetadata['©nam']) {
    metadata.title = rawMetadata['©nam']
  }

  if (rawMetadata['©ART']) {
    metadata.channel = rawMetadata['©ART']
  }

  if (rawMetadata['©day']) {
    const timestamp = parseDate(rawMetadata['©day'])
    if (timestamp) {
      metadata.publishAt = timestamp
    }
  }

  if (rawMetadata['©alb']) {
    metadata.album = rawMetadata['©alb']
  }

  if (rawMetadata['©gen']) {
    metadata.genre = rawMetadata['©gen']
  }

  if (rawMetadata['©cmt']) {
    metadata.comment = rawMetadata['©cmt']
  }

  // Description (prefer long description over short)
  if (rawMetadata['ldes']) {
    metadata.description = rawMetadata['ldes']
  } else if (rawMetadata['desc']) {
    metadata.description = rawMetadata['desc']
  }

  // Keywords/tags
  if (rawMetadata['keyw']) {
    metadata.tags = parseTags(rawMetadata['keyw'])
  }

  // Custom keys (YouTube-specific)
  if (rawMetadata._custom) {
    const custom = rawMetadata._custom

    // Log YouTube-specific fields (dev mode only)
    if (import.meta.env.DEV) {
      if (custom['com.apple.iTunes:youtube_id']) {
        console.log('[METADATA] YouTube ID:', custom['com.apple.iTunes:youtube_id'])
        metadata.youtubeId = custom['com.apple.iTunes:youtube_id']
      }
      if (custom['com.apple.iTunes:source']) {
        console.log('[METADATA] Source:', custom['com.apple.iTunes:source'])
        metadata.source = custom['com.apple.iTunes:source']
      }
    }
  }

  return metadata
}

/**
 * Extract metadata from a video file
 * Reads up to 5MB to find and parse the ilst box
 */
export const extractMetadataFromFile = (file: File): Promise<VideoMetadata> => {
  if (import.meta.env.DEV) {
    console.log('[METADATA] Extracting metadata from file:', file.name)
  }

  return new Promise(resolve => {
    const mp4boxfile = MP4Box.createFile()
    let resolved = false

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        if (import.meta.env.DEV) {
          console.log('[METADATA] Extraction timeout after 5 seconds')
        }
        resolved = true
        resolve({})
      }
    }, 5000)

    mp4boxfile.onError = (err: unknown) => {
      if (!resolved) {
        if (import.meta.env.DEV) {
          console.warn('[METADATA] MP4Box error (non-fatal):', err)
        }
        resolved = true
        clearTimeout(timeout)
        resolve({})
      }
    }

    mp4boxfile.onReady = (_info: Movie) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)

        try {
          let metadata: VideoMetadata = {}

          // Try iTunes-style metadata first (ilst format)
          const ilst = getIlstBox(mp4boxfile)
          if (ilst) {
            if (import.meta.env.DEV) {
              console.log('[METADATA] Found iTunes ilst metadata')
            }
            const rawMetadata = parseIlstMetadata(ilst)
            metadata = mapItunesMetadata(rawMetadata)
          }

          // Extract thumbnail from any available source (ilst or free boxes)
          const thumbnail = extractThumbnailFromFile(mp4boxfile)
          if (thumbnail) {
            metadata.thumbnail = thumbnail
          }

          // Also try standard MP4 metadata (FFmpeg format)
          const standardMeta = extractStandardMetadata(mp4boxfile)
          if (Object.keys(standardMeta).length > 0) {
            if (import.meta.env.DEV) {
              console.log('[METADATA] Found standard MP4 metadata:', standardMeta)
            }

            // Map standard metadata to our format (fallback if iTunes not present)
            if (!metadata.title && standardMeta.titl) {
              metadata.title = standardMeta.titl
            }
            if (!metadata.channel && standardMeta.auth) {
              metadata.channel = standardMeta.auth
            }
            if (!metadata.description && standardMeta.dscp) {
              metadata.description = standardMeta.dscp
            }
            if (!metadata.comment && standardMeta.cprt) {
              metadata.comment = standardMeta.cprt
            }
            if (!metadata.publishAt && standardMeta.yrrc) {
              const timestamp = parseDate(standardMeta.yrrc)
              if (timestamp) {
                metadata.publishAt = timestamp
              }
            }
            if (!metadata.album && standardMeta.albm) {
              metadata.album = standardMeta.albm
            }
          }

          if (import.meta.env.DEV) {
            console.log('[METADATA] Final extracted metadata:', metadata)
          }

          resolve(metadata)
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[METADATA] Error extracting metadata:', error)
          }
          resolve({})
        }
      }
    }

    // Read up to 5MB - metadata can be larger than codec info
    const MAX_BYTES = 5 * 1024 * 1024
    const blob = file.slice(0, MAX_BYTES)

    const fileReader = new FileReader()
    fileReader.onload = () => {
      if (!resolved) {
        try {
          const arrayBuffer = fileReader.result as ArrayBuffer
          const mp4boxBuffer = Object.assign(arrayBuffer, { fileStart: 0 })
          mp4boxfile.appendBuffer(mp4boxBuffer)
          mp4boxfile.flush()
        } catch (error) {
          if (!resolved) {
            if (import.meta.env.DEV) {
              console.error('[METADATA] Error processing buffer:', error)
            }
            resolved = true
            clearTimeout(timeout)
            resolve({})
          }
        }
      }
    }

    fileReader.onerror = error => {
      if (!resolved) {
        if (import.meta.env.DEV) {
          console.error('[METADATA] FileReader error:', error)
        }
        resolved = true
        clearTimeout(timeout)
        resolve({})
      }
    }

    fileReader.readAsArrayBuffer(blob)
  })
}

/**
 * Extract metadata from a video URL by fetching and analyzing the file
 * Attempts range requests first, falls back to regular requests
 */
export const extractMetadataFromUrl = async (url: string): Promise<VideoMetadata> => {
  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB for metadata

  if (import.meta.env.DEV) {
    console.log('[METADATA] Extracting metadata from URL:', url)
  }

  try {
    // Try parsing from beginning (metadata is typically at start)
    const result = await tryParseMetadataFromRange(url, 0, CHUNK_SIZE)
    if (import.meta.env.DEV) {
      console.log('[METADATA] Extracted from URL:', result)
    }
    return result
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[METADATA] Failed to extract from URL:', error)
    }
    return {}
  }
}

/**
 * Attempt to parse metadata from a specific byte range
 */
async function tryParseMetadataFromRange(
  url: string,
  startByte: number,
  endByte: number
): Promise<VideoMetadata> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const rangeResponse = await fetch(url, {
      headers: {
        Range: `bytes=${startByte}-${endByte}`,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!rangeResponse.ok) {
      return {}
    }

    let arrayBuffer: ArrayBuffer

    // Handle range request response
    if (rangeResponse.status === 206) {
      arrayBuffer = await rangeResponse.arrayBuffer()
    } else if (rangeResponse.status === 200 && startByte === 0) {
      // Server doesn't support range requests - read partial response
      if (import.meta.env.DEV) {
        console.log('[METADATA] Range not supported, streaming read')
      }
      const reader = rangeResponse.body?.getReader()
      if (!reader) return {}

      const chunks: Uint8Array[] = []
      let totalBytes = 0
      const maxBytes = endByte - startByte + 1

      while (totalBytes < maxBytes) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalBytes += value.length
      }

      reader.cancel()

      const combined = new Uint8Array(Math.min(totalBytes, maxBytes))
      let offset = 0
      for (const chunk of chunks) {
        const remaining = maxBytes - offset
        const toCopy = Math.min(chunk.length, remaining)
        combined.set(chunk.subarray(0, toCopy), offset)
        offset += toCopy
        if (offset >= maxBytes) break
      }
      arrayBuffer = combined.buffer
    } else {
      return {}
    }

    // Parse metadata from buffer
    return new Promise<VideoMetadata>(resolve => {
      const mp4boxfile = MP4Box.createFile()
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          if (import.meta.env.DEV) {
            console.log('[METADATA] MP4Box timeout for URL')
          }
          resolved = true
          resolve({})
        }
      }, 5000)

      mp4boxfile.onError = (err: unknown) => {
        if (!resolved) {
          if (import.meta.env.DEV) {
            console.warn('[METADATA] MP4Box error for URL:', err)
          }
          resolved = true
          clearTimeout(timeout)
          resolve({})
        }
      }

      mp4boxfile.onReady = (_info: Movie) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)

          try {
            let metadata: VideoMetadata = {}

            // Try iTunes-style metadata first
            const ilst = getIlstBox(mp4boxfile)
            if (ilst) {
              const rawMetadata = parseIlstMetadata(ilst)
              metadata = mapItunesMetadata(rawMetadata)
            }

            // Extract thumbnail from any available source (ilst or free boxes)
            const thumbnail = extractThumbnailFromFile(mp4boxfile)
            if (thumbnail) {
              metadata.thumbnail = thumbnail
            }

            // Also try standard MP4 metadata
            const standardMeta = extractStandardMetadata(mp4boxfile)
            if (Object.keys(standardMeta).length > 0) {
              if (!metadata.title && standardMeta.titl) metadata.title = standardMeta.titl
              if (!metadata.channel && standardMeta.auth) metadata.channel = standardMeta.auth
              if (!metadata.description && standardMeta.dscp)
                metadata.description = standardMeta.dscp
              if (!metadata.comment && standardMeta.cprt) metadata.comment = standardMeta.cprt
              if (!metadata.publishAt && standardMeta.yrrc) {
                const timestamp = parseDate(standardMeta.yrrc)
                if (timestamp) {
                  metadata.publishAt = timestamp
                }
              }
              if (!metadata.album && standardMeta.albm) metadata.album = standardMeta.albm
            }

            resolve(metadata)
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error('[METADATA] Error parsing URL metadata:', error)
            }
            resolve({})
          }
        }
      }

      try {
        const mp4boxBuffer = Object.assign(arrayBuffer, { fileStart: startByte })
        mp4boxfile.appendBuffer(mp4boxBuffer)
        mp4boxfile.flush()
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[METADATA] Error processing URL buffer:', error)
        }
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({})
        }
      }
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[METADATA] Fetch error:', error)
    }
    return {}
  }
}
