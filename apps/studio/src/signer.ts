import { postJson } from './api'
import i18n from './i18n'

/** An event the signer is asked to sign (NIP-01 without id, pubkey and signature). */
export interface UnsignedEvent {
  kind: number
  created_at: number
  tags: string[][]
  content: string
}

export interface SignedEvent extends UnsignedEvent {
  id: string
  pubkey: string
  sig: string
}

/**
 * Whoever signs for the creator: the server (managed key) or the browser's extension (own key).
 * The studio only talks to this interface (docs/studio-spec.md); a NIP-46 bunker would be one more.
 */
export interface Signer {
  getPublicKey(): Promise<string>
  signEvent(event: UnsignedEvent): Promise<SignedEvent>
}

/**
 * The key the server holds (managed mode): it signs through `POST /api/admin/signer/sign`, with
 * the admin session. Only the four fields go along; the server refuses anything else.
 */
export function managedSigner(pubkey: string): Signer {
  return {
    getPublicKey: async () => pubkey,
    signEvent: ({ kind, created_at, tags, content }) =>
      postJson<SignedEvent>('/api/admin/signer/sign', { kind, created_at, tags, content }),
  }
}

interface Nip07Window {
  nostr?: {
    getPublicKey(): Promise<string>
    signEvent(event: UnsignedEvent): Promise<SignedEvent>
  }
}

const HEX64 = /^[0-9a-f]{64}$/

/** The NIP-07 extension of this browser (nos2x, Alby, …) as a `Signer`. */
export function nip07Signer(win: Nip07Window = window as unknown as Nip07Window): Signer | null {
  const nostr = win.nostr
  if (!nostr) return null
  return {
    async getPublicKey() {
      const key = await nostr.getPublicKey()
      if (typeof key !== 'string' || !HEX64.test(key)) {
        throw new Error(i18n.t('studio.errors.notPubkey'))
      }
      return key
    },
    signEvent: event => nostr.signEvent(event),
  }
}

/**
 * Extensions inject `window.nostr` shortly after the page loads: wait a moment for it before
 * deciding that there is none.
 */
export async function findSigner(
  win: Nip07Window = window as unknown as Nip07Window,
  { waitMs = 1500, stepMs = 100 } = {}
): Promise<Signer | null> {
  const deadline = Date.now() + waitMs
  for (;;) {
    const signer = nip07Signer(win)
    if (signer) return signer
    if (Date.now() >= deadline) return null
    await new Promise(resolve => setTimeout(resolve, stepMs))
  }
}
