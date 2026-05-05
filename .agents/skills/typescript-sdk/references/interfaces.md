# SDK Interfaces Reference

## NostrSigner

```typescript
interface NostrSigner {
  /** Returns the public key in hex format */
  getPublicKey(): Promise<string>

  /** Signs a Nostr event */
  signEvent(event: EventTemplate): Promise<NostrEvent>

  /** Optional NIP-44 encryption support */
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}
```

## RelayHandler

```typescript
interface RelayHandler {
  /** Connect to all configured relays */
  connect(): Promise<void>

  /** Disconnect from specified or all relays */
  disconnect(relayUrls?: string[]): Promise<void>

  /** Publish event to all connected relays */
  publish(event: NostrEvent): Promise<void>

  /**
   * Subscribe to events matching filters.
   * Must be non-blocking - return immediately.
   */
  subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void
  ): Promise<void>

  /** Unsubscribe from all active subscriptions */
  unsubscribe(): void
}
```

## ServerInfo

```typescript
interface ServerInfo {
  name?: string // Human-readable name
  picture?: string // Icon URL
  website?: string // Website URL
  about?: string // Description
}
```

## BaseNostrTransportOptions

```typescript
interface BaseNostrTransportOptions {
  signer: NostrSigner
  relayHandler: RelayHandler | string[]
  encryptionMode?: EncryptionMode
  logLevel?: LogLevel
}
```

## NostrTransportOptions (Client)

```typescript
interface NostrTransportOptions extends BaseNostrTransportOptions {
  serverPubkey: string
  isStateless?: boolean
}
```

## NostrServerTransportOptions

```typescript
interface NostrServerTransportOptions extends BaseNostrTransportOptions {
  serverInfo?: ServerInfo
  isPublicServer?: boolean
  publishRelayList?: boolean
  relayListUrls?: string[]
  bootstrapRelayUrls?: string[]
  allowedPublicKeys?: string[]
  excludedCapabilities?: CapabilityExclusion[]
  injectClientPubkey?: boolean
}
```

## CapabilityExclusion

```typescript
interface CapabilityExclusion {
  method: string // e.g., "tools/call"
  name?: string // e.g., "specific_tool"
}
```
