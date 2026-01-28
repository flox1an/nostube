/**
 * MP4Box iTunes-style metadata atom parsing utilities
 * Handles low-level box navigation and data atom decoding
 */

import type { ISOFile } from 'mp4box'

/**
 * iTunes metadata atom types (4-character codes converted to hex)
 * These are stored in the ilst box under moov/udta/meta/ilst
 */
export const ITUNES_ATOMS = {
  // Standard iTunes atoms (©xxx format)
  TITLE: 0xa96e616d, // ©nam
  ARTIST: 0xa9415254, // ©ART (channel/creator)
  ALBUM: 0xa9616c62, // ©alb
  ALBUM_ARTIST: 0x61415254, // aART
  COMMENT: 0xa9636d74, // ©cmt
  YEAR: 0xa9646179, // ©day
  COMPOSER: 0xa9777274, // ©wrt
  GENRE: 0xa967656e, // ©gen
  LYRICS: 0xa96c7972, // ©lyr

  // Non-standard atoms (string keys)
  DESCRIPTION: 'desc', // Short description
  LONG_DESCRIPTION: 'ldes', // Long description
  KEYWORDS: 'keyw', // Keywords/tags
  CATEGORY: 'catg', // Category

  // Custom keys marker
  CUSTOM: '----', // Custom metadata container
} as const

/**
 * Data atom type flags
 * Indicates how to interpret the data payload
 */
export const DATA_TYPES = {
  UTF8: 1, // UTF-8 string
  UTF16: 2, // UTF-16 string
  SJIS: 3, // Shift-JIS string
  HTML: 6, // HTML
  XML: 7, // XML
  UUID: 8, // UUID
  JPEG: 13, // JPEG image
  PNG: 14, // PNG image
  SIGNED_INT: 21, // Signed integer
  UNSIGNED_INT: 22, // Unsigned integer
  FLOAT: 23, // Float
  DOUBLE: 24, // Double
} as const

/**
 * Thumbnail data extracted from covr atom
 */
export interface ThumbnailData {
  type: 'jpeg' | 'png'
  data: Uint8Array
  dataUrl: string
  source?: 'ilst' | 'free' | 'skip' // Where the thumbnail was found
}

/**
 * Parse a data atom from an iTunes metadata box
 * iTunes metadata structure: container atom → data atom → actual value
 */
export function parseDataAtom(box: any): string | null {
  try {
    // iTunes metadata atoms contain a 'data' box with the actual value
    if (!box || !box.data) {
      return null
    }

    const data = box.data
    if (!data || data.length < 8) {
      return null
    }

    // Data atom structure:
    // 4 bytes: type indicator (1 = UTF-8, 2 = UTF-16, etc.)
    // 4 bytes: locale
    // remaining: actual data
    const dataView = new DataView(data.buffer || data)
    const type = dataView.getUint32(0)
    const locale = dataView.getUint32(4)

    if (import.meta.env.DEV) {
      console.log('[MP4BOX-ATOMS] Data atom type:', type, 'locale:', locale)
    }

    // Extract the actual value (skip 8-byte header)
    const valueBytes = data.slice(8)

    // Decode based on type
    switch (type) {
      case DATA_TYPES.UTF8:
        return new TextDecoder('utf-8').decode(valueBytes)

      case DATA_TYPES.UTF16:
        return new TextDecoder('utf-16').decode(valueBytes)

      case DATA_TYPES.SJIS:
        // Fallback to UTF-8 if Shift-JIS not supported
        try {
          return new TextDecoder('shift-jis').decode(valueBytes)
        } catch {
          return new TextDecoder('utf-8').decode(valueBytes)
        }

      default:
        // Try UTF-8 as fallback
        if (import.meta.env.DEV) {
          console.warn('[MP4BOX-ATOMS] Unknown data type:', type, '- attempting UTF-8')
        }
        return new TextDecoder('utf-8').decode(valueBytes)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error parsing data atom:', error)
    }
    return null
  }
}

/**
 * Detect if data contains an image by checking magic bytes
 */
function detectImageType(data: Uint8Array): { type: 'jpeg' | 'png'; mimeType: string } | null {
  // JPEG magic bytes: FF D8 FF
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { type: 'jpeg', mimeType: 'image/jpeg' }
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return { type: 'png', mimeType: 'image/png' }
  }

  return null
}

/**
 * Convert image data to base64 data URL
 */
function imageToDataUrl(imageBytes: Uint8Array, mimeType: string): string {
  const base64 = btoa(String.fromCharCode(...Array.from(imageBytes)))
  return `data:${mimeType};base64,${base64}`
}

/**
 * Extract thumbnail from covr atom (album artwork)
 * Returns image data as a data URL for display
 */
export function extractThumbnail(ilst: any): ThumbnailData | null {
  try {
    if (!ilst) {
      return null
    }

    // Look for covr atom (cover art)
    // It can be in ilst.list as a numeric key or in ilst.boxes
    let covrBox: any = null

    // Try ilst.list first (MP4Box parsed format)
    if (ilst.list) {
      for (const [key, dataBox] of Object.entries(ilst.list)) {
        const numKey = parseInt(key, 10)
        const atomCode = String.fromCharCode(
          (numKey >> 24) & 0xff,
          (numKey >> 16) & 0xff,
          (numKey >> 8) & 0xff,
          numKey & 0xff
        )

        if (atomCode === 'covr') {
          covrBox = dataBox
          break
        }
      }
    }

    // Fallback to boxes array
    if (!covrBox && ilst.boxes) {
      covrBox = ilst.boxes.find((box: any) => box.type === 'covr')
    }

    if (!covrBox) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] No covr (cover art) atom found')
      }
      return null
    }

    // Extract image data from the data atom
    const data = covrBox.data
    if (!data || data.length < 8) {
      return null
    }

    // Read data atom header
    const dataView = new DataView(data.buffer || data)
    const type = dataView.getUint32(0)

    // Skip 8-byte header to get image data
    const imageBytes = data.slice(8)

    // Determine image type
    let imageType: 'jpeg' | 'png'
    let mimeType: string

    if (type === DATA_TYPES.JPEG) {
      imageType = 'jpeg'
      mimeType = 'image/jpeg'
    } else if (type === DATA_TYPES.PNG) {
      imageType = 'png'
      mimeType = 'image/png'
    } else {
      // Try to detect from magic bytes
      const detected = detectImageType(imageBytes)
      if (detected) {
        imageType = detected.type
        mimeType = detected.mimeType
      } else {
        if (import.meta.env.DEV) {
          console.warn('[MP4BOX-ATOMS] Unknown image type:', type)
        }
        return null
      }
    }

    // Convert to base64 data URL
    const uint8Array = new Uint8Array(imageBytes)
    const dataUrl = imageToDataUrl(uint8Array, mimeType)

    if (import.meta.env.DEV) {
      console.log(
        `[MP4BOX-ATOMS] Extracted ${imageType} thumbnail from ilst (${imageBytes.length} bytes)`
      )
    }

    return {
      type: imageType,
      data: imageBytes,
      dataUrl,
      source: 'ilst',
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error extracting thumbnail:', error)
    }
    return null
  }
}

/**
 * Extract thumbnail from free/skip boxes
 * Some encoders store thumbnails in free space boxes
 */
export function extractThumbnailFromFreeBoxes(mp4boxfile: ISOFile): ThumbnailData | null {
  try {
    const boxes = (mp4boxfile as any).boxes
    if (!boxes || !Array.isArray(boxes)) {
      return null
    }

    // Look for free or skip boxes that might contain image data
    const freeBoxes = boxes.filter((box: any) => box.type === 'free' || box.type === 'skip')

    for (const box of freeBoxes) {
      if (!box.data || box.data.length < 100) {
        // Skip very small boxes (unlikely to be images)
        continue
      }

      // Check if this looks like an image
      const imageData = new Uint8Array(box.data)
      const detected = detectImageType(imageData)

      if (detected) {
        const dataUrl = imageToDataUrl(imageData, detected.mimeType)

        if (import.meta.env.DEV) {
          console.log(
            `[MP4BOX-ATOMS] Found ${detected.type} thumbnail in ${box.type} box (${imageData.length} bytes)`
          )
        }

        return {
          type: detected.type,
          data: imageData,
          dataUrl,
          source: box.type === 'free' ? 'free' : 'skip',
        }
      }
    }

    return null
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error extracting thumbnail from free boxes:', error)
    }
    return null
  }
}

/**
 * Extract thumbnail from any available source
 * Tries multiple locations in order:
 * 1. covr atom in ilst (iTunes metadata)
 * 2. free/skip boxes (some encoders)
 */
export function extractThumbnailFromFile(mp4boxfile: ISOFile): ThumbnailData | null {
  // Try iTunes ilst first
  const ilst = getIlstBox(mp4boxfile)
  if (ilst) {
    const thumbnail = extractThumbnail(ilst)
    if (thumbnail) {
      return thumbnail
    }
  }

  // Try free boxes
  return extractThumbnailFromFreeBoxes(mp4boxfile)
}

/**
 * Parse custom metadata keys (----:com.apple.iTunes:key_name format)
 * Returns a map of key names to values
 */
export function parseCustomKeys(ilst: any): Record<string, string> {
  const customData: Record<string, string> = {}

  try {
    // Custom keys are stored in ---- atoms
    if (!ilst || !ilst.boxes) {
      return customData
    }

    // Find all ---- boxes
    const customBoxes = ilst.boxes.filter((box: any) => box.type === '----')

    for (const customBox of customBoxes) {
      if (!customBox.boxes) continue

      // Custom box structure:
      // ---- (container)
      //   ├── mean (namespace, e.g., "com.apple.iTunes")
      //   ├── name (key name, e.g., "youtube_id")
      //   └── data (actual value)

      let namespace = ''
      let keyName = ''
      let value = ''

      for (const subBox of customBox.boxes) {
        if (subBox.type === 'mean' && subBox.data) {
          // Skip 4-byte header, decode rest as UTF-8
          const meanData = subBox.data.slice(4)
          namespace = new TextDecoder('utf-8').decode(meanData)
        } else if (subBox.type === 'name' && subBox.data) {
          // Skip 4-byte header, decode rest as UTF-8
          const nameData = subBox.data.slice(4)
          keyName = new TextDecoder('utf-8').decode(nameData)
        } else if (subBox.type === 'data') {
          value = parseDataAtom(subBox) || ''
        }
      }

      if (keyName && value) {
        // Store with full qualified name
        const fullKey = namespace ? `${namespace}:${keyName}` : keyName
        customData[fullKey] = value
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error parsing custom keys:', error)
    }
  }

  return customData
}

/**
 * Extract the ilst box from an MP4Box ISOFile
 * Navigates: moov → udta → meta → ilst
 */
export function getIlstBox(mp4boxfile: ISOFile): any | null {
  try {
    const moov = (mp4boxfile as any).moov
    if (!moov) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] No moov box found')
      }
      return null
    }

    const udta = moov.udta
    if (!udta) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] No udta box found')
      }
      return null
    }

    const meta = udta.meta
    if (!meta) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] No meta box found')
      }
      return null
    }

    const ilst = meta.ilst
    if (!ilst) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] No ilst box found - no iTunes metadata')
      }
      return null
    }

    return ilst
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error navigating to ilst box:', error)
    }
    return null
  }
}

/**
 * Standard MP4 metadata box types (used by FFmpeg/Lavf)
 * These are different from iTunes ilst atoms
 */
export const STANDARD_MP4_ATOMS = {
  TITLE: 'titl', // or ©nam in some encoders
  ARTIST: 'auth', // or ©ART
  DESCRIPTION: 'dscp', // or desc
  COMMENT: 'cprt', // copyright/comment
  DATE: 'yrrc', // year
  ALBUM: 'albm', // album
} as const

/**
 * Parse a standard MP4 metadata box (not iTunes format)
 * These boxes typically have: [4 bytes size][4 bytes type][2 bytes lang][data]
 */
function parseStandardMetadataBox(box: any): string | null {
  try {
    if (!box.data) return null

    // Standard metadata boxes have a 2-byte language code followed by text
    const data = box.data
    if (data.length < 2) return null

    // Skip first 2 bytes (language code) and decode the rest as UTF-8
    const textData = data.slice(2)
    return new TextDecoder('utf-8').decode(textData)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error parsing standard metadata box:', error)
    }
    return null
  }
}

/**
 * Extract standard MP4 metadata from udta box
 * FFmpeg/Lavf stores metadata as direct children of udta
 */
export function extractStandardMetadata(mp4boxfile: ISOFile): Record<string, string> {
  const metadata: Record<string, string> = {}

  try {
    const moov = (mp4boxfile as any).moov
    if (!moov || !moov.udta) {
      return metadata
    }

    const udta = moov.udta

    // FFmpeg stores metadata directly in udta as text boxes
    // Common box types: titl, auth, dscp, cprt
    if (udta.boxes) {
      for (const box of udta.boxes) {
        if (import.meta.env.DEV) {
          console.log(
            '[MP4BOX-ATOMS] UDTA sub-box:',
            box.type,
            'size:',
            box.size,
            'has data:',
            !!box.data
          )
        }

        // Try to extract text from known metadata boxes
        const text = parseStandardMetadataBox(box)
        if (text) {
          metadata[box.type] = text
        }
      }
    }

    // Also check if there are direct properties (some encoders do this)
    const directProps = ['titl', 'auth', 'dscp', 'cprt', 'yrrc', 'albm']
    for (const prop of directProps) {
      if (udta[prop] && typeof udta[prop] === 'string') {
        metadata[prop] = udta[prop]
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error extracting standard metadata:', error)
    }
  }

  return metadata
}

/**
 * Convert numeric atom key to 4-character code
 * MP4Box stores atom keys as numbers (e.g., 0xA96E616D for ©nam)
 */
function atomNumberToString(num: number): string {
  const bytes = [(num >> 24) & 0xff, (num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
  return String.fromCharCode(...bytes)
}

/**
 * Parse all iTunes metadata from an ilst box
 * Returns a map of metadata fields to their values
 *
 * MP4Box.js parses ilst into two formats:
 * 1. ilst.boxes[] - array of raw boxes
 * 2. ilst.list{} - object with numeric keys mapped to DataBox objects
 */
export function parseIlstMetadata(ilst: any): Record<string, any> {
  const metadata: Record<string, any> = {}

  try {
    if (!ilst) {
      return metadata
    }

    // MP4Box.js provides parsed data in ilst.list
    if (ilst.list) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] Found ilst.list with keys:', Object.keys(ilst.list))
      }

      // Iterate through all entries in the list
      for (const [key, dataBox] of Object.entries(ilst.list)) {
        const numKey = parseInt(key, 10)
        const atomCode = atomNumberToString(numKey)

        if (import.meta.env.DEV) {
          console.log(`[MP4BOX-ATOMS] Processing atom ${key} (${atomCode}):`, dataBox)
        }

        // DataBox objects have a 'value' property with the decoded string
        const value = (dataBox as any)?.value
        if (value && typeof value === 'string') {
          metadata[atomCode] = value
          if (import.meta.env.DEV) {
            console.log(`[MP4BOX-ATOMS] Extracted ${atomCode}: ${value.substring(0, 50)}...`)
          }
        }
      }
    }

    // Fallback: try parsing from boxes array if list is not available
    if (ilst.boxes && Object.keys(metadata).length === 0) {
      if (import.meta.env.DEV) {
        console.log('[MP4BOX-ATOMS] Falling back to ilst.boxes parsing')
      }

      for (const box of ilst.boxes) {
        const value = parseDataAtom(box)
        if (value) {
          metadata[box.type] = value
        }
      }
    }

    // Parse custom keys separately
    const customKeys = parseCustomKeys(ilst)
    if (Object.keys(customKeys).length > 0) {
      metadata._custom = customKeys
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[MP4BOX-ATOMS] Error parsing ilst metadata:', error)
    }
  }

  return metadata
}
