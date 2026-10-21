import { postJson } from './api'

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
 * Whoever signs for the creator: the server (managed key) or the Nostr account logged in in this
 * browser (own key: extension, nsec, bunker or Nostr Connect). The studio only talks to this
 * interface (docs/specs/studio.md).
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
