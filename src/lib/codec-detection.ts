import * as MP4Box from 'mp4box'
import type { Movie } from 'mp4box'

export interface CodecInfo {
  videoCodec?: string
  audioCodec?: string
  bitrate?: number // Total bitrate in bits per second (video + audio)
}

/**
 * Extract codec information from a video file using MP4Box.js
 * Only reads the first MB of the file to avoid memory issues with large files
 */
export const getCodecsFromFile = (file: File): Promise<CodecInfo> => {
  if (import.meta.env.DEV) {
    console.log('[CODEC] Analyzing file:', file.name, `${(file.size / 1024 / 1024).toFixed(1)}MB`)
  }

  return new Promise((resolve, reject) => {
    const mp4boxfile = MP4Box.createFile()
    let videoCodec: string | undefined
    let audioCodec: string | undefined
    let resolved = false

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        if (import.meta.env.DEV) console.log('[CODEC] File detection timeout after 5 seconds')
        resolved = true
        reject(new Error('Codec detection timeout'))
      }
    }, 5000) // 5 second timeout

    mp4boxfile.onError = (err: unknown) => {
      if (!resolved) {
        console.error('[CODEC] MP4Box error:', err)
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    }

    mp4boxfile.onReady = (info: Movie) => {
      if (!resolved) {
        if (import.meta.env.DEV) {
          console.log('[CODEC] File parsed successfully, tracks:', info.tracks.length)
        }
        resolved = true
        clearTimeout(timeout)

        // Extract bitrate from all tracks
        let totalBitrate = 0
        for (const track of info.tracks) {
          if (import.meta.env.DEV) console.log('[CODEC] Track:', track.type, track.codec, 'bitrate:', track.bitrate)
          if (track.type && track.type === 'video' && track.codec) videoCodec = track.codec
          if (track.type && track.type === 'audio' && track.codec) audioCodec = track.codec
          // Sum up bitrates from video and audio tracks
          if (track.bitrate && (track.type === 'video' || track.type === 'audio')) {
            totalBitrate += track.bitrate
          }
        }

        const bitrate = totalBitrate > 0 ? totalBitrate : undefined
        if (import.meta.env.DEV) console.log('[CODEC] Detected codecs:', { videoCodec, audioCodec, bitrate })
        resolve({ videoCodec, audioCodec, bitrate })
      }
    }

    // Only read the first MB - MP4 metadata is at the beginning
    const MAX_BYTES = 1024 * 1024 // 1MB
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
            resolved = true
            clearTimeout(timeout)
            reject(error)
          }
        }
      }
    }

    fileReader.onerror = error => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(error)
      }
    }

    fileReader.readAsArrayBuffer(blob)
  })
}

/**
 * Extract codec information from a video URL by fetching and analyzing the file.
 * Attempts range requests first, falls back to regular requests with manual abort.
 */
export const getCodecsFromUrl = async (url: string): Promise<CodecInfo> => {
  const CHUNK_SIZE = 1024 * 1024 // 1MB chunks

  if (import.meta.env.DEV) console.log('[CODEC] Fetching codec info from URL:', url)

  try {
    // Try to get file size first via HEAD request
    let fileSize = 0
    try {
      const headResponse = await fetch(url, { method: 'HEAD' })
      const contentLength = headResponse.headers.get('content-length')
      if (contentLength) {
        fileSize = parseInt(contentLength, 10)
        if (import.meta.env.DEV) console.log('[CODEC] File size:', fileSize, 'bytes')
      }
    } catch (error) {
      if (import.meta.env.DEV) console.log('[CODEC] Could not get file size:', error)
    }

    // Try parsing from beginning (fast path for moov-at-start)
    try {
      const result = await tryParseFromRange(url, 0, CHUNK_SIZE)
      if (result.videoCodec || result.audioCodec) {
        if (import.meta.env.DEV) console.log('[CODEC] Successfully parsed from beginning')
        return result
      }
      if (import.meta.env.DEV) console.log('[CODEC] No codec found in first chunk')
    } catch (error) {
      if (import.meta.env.DEV) console.log('[CODEC] Failed to parse from beginning:', error)
    }

    // If no codec found and we know file size, try from end
    if (fileSize > CHUNK_SIZE) {
      if (import.meta.env.DEV) console.log('[CODEC] Trying to parse from end of file')
      try {
        const startOffset = Math.max(0, fileSize - CHUNK_SIZE)
        const result = await tryParseFromRange(url, startOffset, fileSize - 1)
        if (result.videoCodec || result.audioCodec) {
          if (import.meta.env.DEV) console.log('[CODEC] Successfully parsed from end')
          return result
        }
      } catch (error) {
        if (import.meta.env.DEV) console.log('[CODEC] Failed to parse from end:', error)
      }
    }

    if (import.meta.env.DEV) console.log('[CODEC] Could not detect codec from any range')
    return {}
  } catch (error) {
    console.error('[CODEC] Failed to detect codecs:', error)
    return {}
  }
}

async function tryParseFromRange(
  url: string,
  startByte: number,
  endByte: number
): Promise<CodecInfo> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

  const rangeResponse = await fetch(url, {
    headers: {
      Range: `bytes=${startByte}-${endByte}`,
    },
    signal: controller.signal,
  })

  clearTimeout(timeoutId)

  if (!rangeResponse.ok || rangeResponse.status !== 206) {
    throw new Error('Range request failed')
  }

  const arrayBuffer = await rangeResponse.arrayBuffer()
  if (import.meta.env.DEV) {
    console.log('[CODEC] Fetched', arrayBuffer.byteLength, 'bytes from offset', startByte)
  }

  return new Promise<CodecInfo>(resolve => {
    const mp4boxfile = MP4Box.createFile()
    let videoCodec: string | undefined
    let audioCodec: string | undefined
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        if (import.meta.env.DEV) console.log('[CODEC] MP4Box timeout')
        resolved = true
        resolve({})
      }
    }, 5000)

    mp4boxfile.onError = (err: unknown) => {
      if (!resolved) {
        console.error('[CODEC] MP4Box error:', err)
        resolved = true
        clearTimeout(timeout)
        resolve({})
      }
    }

    mp4boxfile.onReady = (info: Movie) => {
      if (!resolved) {
        if (import.meta.env.DEV) console.log('[CODEC] MP4Box ready, tracks:', info.tracks.length)
        resolved = true
        clearTimeout(timeout)

        // Extract bitrate from all tracks
        let totalBitrate = 0
        for (const track of info.tracks) {
          if (import.meta.env.DEV) console.log('[CODEC] Track:', track.type, track.codec, 'bitrate:', track.bitrate)
          if (track.type && track.type === 'video' && track.codec) videoCodec = track.codec
          if (track.type && track.type === 'audio' && track.codec) audioCodec = track.codec
          // Sum up bitrates from video and audio tracks
          if (track.bitrate && (track.type === 'video' || track.type === 'audio')) {
            totalBitrate += track.bitrate
          }
        }

        const bitrate = totalBitrate > 0 ? totalBitrate : undefined
        if (import.meta.env.DEV) console.log('[CODEC] Detected codecs:', { videoCodec, audioCodec, bitrate })
        resolve({ videoCodec, audioCodec, bitrate })
      }
    }

    try {
      const mp4boxBuffer = Object.assign(arrayBuffer, { fileStart: startByte })
      mp4boxfile.appendBuffer(mp4boxBuffer)
      mp4boxfile.flush()
    } catch (error) {
      console.error('[CODEC] Error processing buffer:', error)
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve({})
      }
    }
  })
}
