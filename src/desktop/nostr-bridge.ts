import { invoke, isTauri } from '@tauri-apps/api/core'

type NostrEventTemplate = {
  content: string
  created_at: number
  kind: number
  tags: string[][]
}

type NostrEvent = NostrEventTemplate & {
  id: string
  pubkey: string
  sig: string
}

type EncryptionRequest = {
  pubkey: string
  content: string
}

type DesktopNostrBridge = {
  getPublicKey(): Promise<string>
  signEvent(event: NostrEventTemplate): Promise<NostrEvent>
  nip04: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  nip44: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}

const encrypt = (command: string, pubkey: string, content: string) =>
  invoke<string>(command, { request: { pubkey, content } satisfies EncryptionRequest })

const bridge: DesktopNostrBridge = {
  getPublicKey: () => invoke<string>('desktop_get_public_key'),
  signEvent: event => invoke<NostrEvent>('desktop_sign_event', { event }),
  nip04: {
    encrypt: (pubkey, plaintext) => encrypt('desktop_nip04_encrypt', pubkey, plaintext),
    decrypt: (pubkey, ciphertext) => encrypt('desktop_nip04_decrypt', pubkey, ciphertext),
  },
  nip44: {
    encrypt: (pubkey, plaintext) => encrypt('desktop_nip44_encrypt', pubkey, plaintext),
    decrypt: (pubkey, ciphertext) => encrypt('desktop_nip44_decrypt', pubkey, ciphertext),
  },
}

export const installDesktopNostrBridge = (): boolean => {
  if (!isTauri() || 'nostr' in window) return false

  Object.defineProperty(window, 'nostr', {
    configurable: false,
    enumerable: false,
    value: bridge,
    writable: false,
  })
  return true
}
