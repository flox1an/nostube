# Stateless Mode

Skip the MCP initialization handshake for faster connections.

## How It Works

Standard mode:

1. Client sends `initialize` request
2. Server responds with capabilities
3. Client sends `notifications/initialized`
4. Normal operations begin

Stateless mode:

1. Client emulates server's initialize response locally
2. Normal operations begin immediately

## When to Use

✓ Good for:

- Serverless functions
- Short-lived connections
- Known server configurations
- High-frequency connections

✗ Avoid for:

- Unknown server capabilities
- Servers requiring initialization
- Complex capability negotiation

## Configuration

```typescript
const transport = new NostrClientTransport({
  signer,
  relayHandler,
  serverPubkey: SERVER_PUBKEY,
  isStateless: true,
})
```

## Limitations

- Server may reject stateless connections
- No capability negotiation
- Client assumes server capabilities
