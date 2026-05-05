# Custom Signer Examples

## NIP-07 Browser Extension Signer

```typescript
import { NostrSigner } from '@contextvm/sdk'

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: UnsignedEvent): Promise<NostrEvent>
      nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>
        decrypt(pubkey: string, ciphertext: string): Promise<string>
      }
    }
  }
}

class Nip07Signer implements NostrSigner {
  constructor() {
    if (!window.nostr) {
      throw new Error('NIP-07 extension not found')
    }
  }

  async getPublicKey(): Promise<string> {
    return window.nostr!.getPublicKey()
  }

  async signEvent(event: UnsignedEvent): Promise<NostrEvent> {
    return window.nostr!.signEvent(event)
  }

  nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      if (!window.nostr?.nip44) {
        throw new Error("Extension doesn't support NIP-44")
      }
      return window.nostr.nip44.encrypt(pubkey, plaintext)
    },
    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      if (!window.nostr?.nip44) {
        throw new Error("Extension doesn't support NIP-44")
      }
      return window.nostr.nip44.decrypt(pubkey, ciphertext)
    },
  }
}
```
