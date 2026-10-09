import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const CHUNK = 4 * 1024 * 1024

/**
 * The SHA-256 of a file as hex, read in pieces so a multi-gigabyte video never sits in memory
 * (`crypto.subtle.digest` would take the whole file at once). Every piece is awaited, which
 * gives the page its turn between pieces.
 */
export async function sha256File(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const hash = sha256.create()
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    signal?.throwIfAborted()
    hash.update(new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer()))
    onProgress?.(Math.min(offset + CHUNK, file.size), file.size)
  }
  return bytesToHex(hash.digest())
}
