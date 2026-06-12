import { probeTranscodeSource, type TranscodeSourceMeta } from '@/lib/video-transcode'
import type { VideoVariant } from '@/utils/video-event'

/**
 * Download a video variant from its URL (trying fallbacks in order), stream-accumulate
 * the bytes while reporting progress, then probe the resulting File for transcode metadata.
 */
export async function loadSourceForContribution(
  variant: VideoVariant,
  onProgress: (loaded: number, total: number | undefined) => void,
  signal: AbortSignal
): Promise<{ file: File; meta: TranscodeSourceMeta }> {
  const seen = new Set<string>()
  const candidates = [variant.url, ...variant.fallbackUrls].filter(u => {
    if (!u || seen.has(u)) return false
    seen.add(u)
    return true
  })

  let lastError: unknown = new Error('No candidate URLs')

  for (const url of candidates) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    let response: Response
    try {
      response = await fetch(url, { signal, credentials: 'omit' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastError = err
      continue
    }

    if (!response.ok) {
      lastError = new Error(`HTTP ${response.status} from ${url}`)
      continue
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : undefined
    const reader = response.body?.getReader()
    if (!reader) {
      lastError = new Error(`No readable body from ${url}`)
      continue
    }

    const chunks: Uint8Array[] = []
    let loaded = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        onProgress(loaded, total)
      }
    } catch (err) {
      reader.cancel().catch(() => {})
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastError = err
      continue
    }

    // Derive a filename from the URL path
    const pathname = new URL(url).pathname
    const segment = pathname.split('/').pop() || 'source.mp4'
    const filename = segment.includes('.') ? segment : `${segment}.mp4`
    const totalSize = chunks.reduce((s, c) => s + c.byteLength, 0)
    const buffer = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.byteLength
    }
    const blob = new Blob([buffer.buffer], { type: 'video/mp4' })
    const file = new File([blob], filename, { type: 'video/mp4' })

    const meta = await probeTranscodeSource(file)
    return { file, meta }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to download source variant')
}
