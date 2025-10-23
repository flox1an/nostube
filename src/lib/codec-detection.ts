import * as MP4Box from 'mp4box'
import type { Movie } from 'mp4box'

export interface CodecInfo {
  videoCodec?: string
  audioCodec?: string
}

/**
 * Extract codec information from a video file using MP4Box.js
 */
export const getCodecsFromFile = (file: File): Promise<CodecInfo> => {
  return new Promise((resolve, reject) => {
    const mp4boxfile = MP4Box.createFile()
    let videoCodec: string | undefined
    let audioCodec: string | undefined
    let resolved = false

    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        reject(new Error('Codec detection timeout'))
      }
    }, 5000) // 5 second timeout

    mp4boxfile.onError = (err: unknown) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    }

    mp4boxfile.onReady = (info: Movie) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        for (const track of info.tracks) {
          if (track.type && track.type === 'video' && track.codec) videoCodec = track.codec
          if (track.type && track.type === 'audio' && track.codec) audioCodec = track.codec
        }
        resolve({ videoCodec, audioCodec })
      }
    }

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

    fileReader.readAsArrayBuffer(file)
  })
}

/**
 * Extract codec information from a video URL by fetching and analyzing the file.
 * Attempts range requests first, falls back to regular requests with manual abort.
 */
export const getCodecsFromUrl = async (url: string): Promise<CodecInfo> => {
  const MAX_BYTES = 524288 // Reduced to 512KB for better compatibility

  try {
    let arrayBuffer: ArrayBuffer

    // First, try a range request with timeout
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const rangeResponse = await fetch(url, {
        headers: {
          Range: `bytes=0-${MAX_BYTES - 1}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (rangeResponse.ok && rangeResponse.status === 206) {
        // Range request succeeded
        arrayBuffer = await rangeResponse.arrayBuffer()
      } else {
        throw new Error('Range not supported')
      }
    } catch {
      // Range request failed, fall back to regular request with manual abort
      const controller = new AbortController()
      let bytesReceived = 0

      // Set overall timeout for fallback request
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error('Failed to fetch video')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const chunks: Uint8Array[] = []

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          bytesReceived += value.length
          chunks.push(value)

          // Abort if we've received enough data
          if (bytesReceived >= MAX_BYTES) {
            controller.abort()
            break
          }
        }
      } catch (error) {
        // Expected when we abort the request
        if (error instanceof Error && error.name !== 'AbortError') {
          throw error
        }
      } finally {
        clearTimeout(timeoutId)
        reader.releaseLock()
      }

      // Combine chunks into ArrayBuffer
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      arrayBuffer = combined.buffer
    }

    return new Promise(resolve => {
      const mp4boxfile = MP4Box.createFile()
      let videoCodec: string | undefined
      let audioCodec: string | undefined
      let resolved = false

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve({})
        }
      }, 5000) // 5 second timeout

      mp4boxfile.onError = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({}) // Fail silently for codec detection
        }
      }

      mp4boxfile.onReady = (info: Movie) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          for (const track of info.tracks) {
            if (track.type && track.type === 'video' && track.codec) videoCodec = track.codec
            if (track.type && track.type === 'audio' && track.codec) audioCodec = track.codec
          }
          resolve({ videoCodec, audioCodec })
        }
      }

      try {
        const mp4boxBuffer = Object.assign(arrayBuffer, { fileStart: 0 })
        mp4boxfile.appendBuffer(mp4boxBuffer)
        mp4boxfile.flush()
      } catch (error) {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({})
        }
      }
    })
  } catch {
    // If codec detection fails, return empty object
    return {}
  }
}
