# NostrMCPProxy Pattern

Bridge existing MCP clients to ContextVM servers without modifying client code.

## Use Cases

- Connect Claude Desktop to ContextVM servers
- Use existing MCP clients with Nostr-based servers
- Add Nostr support without client modifications

## Architecture

```
MCP Client (stdio) <---> NostrMCPProxy <---> ContextVM Server (Nostr)
     (Existing)          (Bridge)            (Remote)
```

## Example: Claude Desktop Integration

```typescript
import { NostrMCPProxy } from '@contextvm/sdk'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

async function main() {
  const proxy = new NostrMCPProxy({
    // Host transport - client connects here
    mcpHostTransport: new StdioServerTransport(),

    // Remote server configuration
    nostrTransportOptions: {
      signer: new PrivateKeySigner(clientKey),
      relayHandler: new ApplesauceRelayPool(relays),
      serverPubkey: 'remote-server-pubkey',
    },
  })

  await proxy.start()

  // Proxy runs until interrupted
  process.on('SIGINT', async () => {
    await proxy.stop()
    process.exit(0)
  })
}

main()
```

## Configuration in Claude Desktop

```json
{
  "mcpServers": {
    "cvm-bridge": {
      "command": "bun",
      "args": ["run", "/path/to/proxy.ts"]
    }
  }
}
```

## Multiple Server Support

Create a proxy that can route to different servers:

```typescript
// Route based on environment or configuration
const targetServer = process.env.TARGET_SERVER_PUBKEY

const proxy = new NostrMCPProxy({
  mcpHostTransport: new StdioServerTransport(),
  nostrTransportOptions: {
    signer,
    relayHandler,
    serverPubkey: targetServer,
  },
})
```
