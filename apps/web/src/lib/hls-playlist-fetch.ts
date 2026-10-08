import { extractBlossomHash } from '@/lib/blossom-url'
import type { BlossomServer } from '@/contexts/AppContext'

/**
 * Candidate URLs for a Blossom blob: the URL itself first, then the same hash
 * on every configured server. Deduplicated, order preserved.
 */
export function blossomServerCandidates(url: string, servers: BlossomServer[]): string[] {
  const { sha256 } = extractBlossomHash(url)
  const extension = url.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
  return [
    ...new Set([
      url,
      ...(sha256
        ? servers.map(server => `${server.url.replace(/\/$/, '')}/${sha256}${extension}`)
        : []),
    ]),
  ]
}

/**
 * Fetch a playlist, falling back to the configured Blossom servers that hold
 * the same hash. Returns the URL that actually served the text so relative
 * segment/variant URIs resolve against the server the playlist came from.
 */
export async function fetchPlaylistWithFallback(
  url: string,
  servers: BlossomServer[]
): Promise<{ text: string; url: string }> {
  let lastError: Error = new Error('No playlist candidates')

  for (const candidate of blossomServerCandidates(url, servers)) {
    try {
      const response = await fetch(candidate)
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} for ${candidate}`)
        continue
      }
      return { text: await response.text(), url: candidate }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError
}
