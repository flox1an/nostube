# Server Discovery Patterns

## Pattern 1: Known Public Key

Direct connection when you know the server's pubkey:

```typescript
const transport = new NostrClientTransport({
  signer,
  relayHandler: relayPool,
  serverPubkey: 'known-pubkey-hex',
})
```

## Pattern 2: Query Announcements

Find servers on the network:

```typescript
import { SERVER_ANNOUNCEMENT_KIND } from '@contextvm/sdk'

const servers = new Map()

await relayPool.subscribe([{ kinds: [SERVER_ANNOUNCEMENT_KIND] }], event => {
  const info = JSON.parse(event.content)
  servers.set(event.pubkey, {
    pubkey: event.pubkey,
    name: info.serverInfo?.name,
    capabilities: info.capabilities,
  })
})
```

## Pattern 3: Filter by Capability

Find servers supporting specific features:

```typescript
await relayPool.subscribe([{ kinds: [SERVER_ANNOUNCEMENT_KIND] }], event => {
  const info = JSON.parse(event.content)

  // Check for tools support
  if (info.capabilities?.tools) {
    console.log(`Server with tools: ${info.serverInfo.name}`)
  }

  // Check for encryption support
  const supportsEncryption = event.tags.some(t => t[0] === 'support_encryption')
})
```

## Pattern 4: Multi-Relay Discovery

Query multiple relays for redundancy:

```typescript
const relayUrls = ['wss://relay.contextvm.org', 'wss://cvm.otherstuff.ai', 'wss://nos.lol']

const relayPool = new ApplesauceRelayPool(relayUrls)
```
