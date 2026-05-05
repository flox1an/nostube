# ContextVM Enhancement Proposals (CEPs)

## CEP-4: Encryption Support

**Status**: Final

### Summary

Optional end-to-end encryption using simplified NIP-17/NIP-59 pattern.

### Key Points

- Servers advertise encryption support via `support_encryption` tag
- Messages encrypted using NIP-44
- Gift wrap (kind 1059) conceals metadata
- Recipient public key still visible in `p` tag (limitation of NIP-59)

### Discovery

Clients detect encryption support:

1. Check for `support_encryption` tag in server announcements
2. Attempt encrypted handshake during initialization

---

## CEP-6: Public Server Announcements

**Status**: Final

### Summary

Server discovery mechanism using replaceable events.

### Event Kinds

| Kind  | Content                 |
| ----- | ----------------------- |
| 11316 | Server announcement     |
| 11317 | Tools list              |
| 11318 | Resources list          |
| 11319 | Resource templates list |
| 11320 | Prompts list            |

### Server Announcement Example

```json
{
  "kind": 11316,
  "content": {
    "protocolVersion": "2025-07-02",
    "capabilities": {...},
    "serverInfo": {
      "name": "ExampleServer",
      "version": "1.0.0"
    }
  },
  "tags": [
    ["name", "Example Server"],
    ["about", "Server description"],
    ["support_encryption"]
  ]
}
```

---

## CEP-17: Server Relay List Metadata

**Status**: Draft

### Summary

Servers can publish `kind:10002` relay-list metadata so clients can discover where the server is reachable.

### Key Points

- Uses NIP-65-style `r` tags
- Unmarked `r` tags are the recommended ContextVM profile
- Bootstrap relays can be used for discoverability publication without being advertised as operational relays
- Complements CEP-6 by separating what a server offers from where it is reachable

---

## CEP-19: Ephemeral Gift Wraps

**Status**: Draft

### Summary

Optional ephemeral encrypted wrapper using gift-wrap kind `21059`.

### Key Points

- Extends CEP-4 encryption behavior
- `support_encryption_ephemeral` advertises support
- If both peers support it, implementations should prefer `21059`
- Fallback to persistent gift wraps `1059` preserves interoperability

---

## CEP-16: Client Public Key Injection

**Status**: Final

### Summary

Optional injection of client public key into request metadata.

### Configuration

```typescript
const transport = new NostrServerTransport({
  signer: new PrivateKeySigner(serverPrivateKey),
  relayHandler: new ApplesauceRelayPool([relayUrl]),
  injectClientPubkey: true, // Enable injection
})
```

### Injected Metadata

When enabled, requests include `_meta.clientPubkey`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {...},
  "_meta": {
    "clientPubkey": "<client-public-key-hex>"
  }
}
```

### Use Cases

- Authentication and authorization
- Per-client rate limiting
- Usage tracking
- Personalization
