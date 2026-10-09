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
 * Whoever signs for the creator. The studio only talks to this interface, so a signer that holds
 * the key on the server can take the place of the browser extension later (docs/studio-spec.md).
 */
export interface Signer {
  getPublicKey(): Promise<string>
  signEvent(event: UnsignedEvent): Promise<SignedEvent>
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
        throw new Error('The signer returned something that is not a public key.')
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
