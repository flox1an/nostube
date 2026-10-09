import type { EventTemplate } from 'nostr-tools'

/**
 * How long an upload authorization has to stay valid: a transfer at a slow 256 KiB/s must fit
 * (a 4 GiB file would need hours), never less than an hour, never more than the server's 24 h.
 */
export function uploadAuthTtl(sizeBytes: number): number {
  const slowTransfer = Math.ceil(sizeBytes / (256 * 1024))
  return Math.min(24 * 60 * 60, Math.max(60 * 60, slowTransfer))
}

/**
 * The authorization for a Blossom upload (BUD-11, kind 24242): `t=upload`, the sha256 of the blob
 * in an `x` tag, and a future `expiration`. The server refuses an event dated in the future
 * (clocks differ by a little), so `created_at` is set slightly back. One event covers every chunk
 * of a chunked upload, so the expiration has to outlast the whole transfer.
 */
export function buildUploadAuth({
  sha256,
  fileName,
  now = Math.floor(Date.now() / 1000),
  ttlSeconds = 60 * 60,
}: {
  sha256: string
  fileName: string
  now?: number
  ttlSeconds?: number
}): EventTemplate {
  return {
    kind: 24242,
    created_at: now - 30,
    tags: [
      ['t', 'upload'],
      ['x', sha256],
      ['expiration', String(now + ttlSeconds)],
    ],
    content: `Upload ${fileName}`,
  }
}

/** `Authorization: Nostr <base64 of the signed event>` (UTF-8 safe: the content has a file name). */
export function blossomAuthorization(signed: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(signed))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Nostr ${btoa(binary)}`
}
