# MCP Integration

## How ContextVM Extends MCP

ContextVM implements MCP's transport layer using Nostr, adding:

1. **Decentralization**: No single point of failure
2. **Identity**: Cryptographic identity via public keys
3. **Portability**: Servers work across any relay
4. **Encryption**: Optional end-to-end encryption

## Transport Layer Responsibility

Per MCP specification, the transport layer:

- Handles connection establishment
- Manages message framing
- Provides authorization mechanisms

ContextVM adds:

- Relay connection management
- Event signing and verification
- Encryption/decryption
- Public key-based addressing

## Comparison with Standard MCP Transports

| Feature               | STDIO | HTTP        | ContextVM  |
| --------------------- | ----- | ----------- | ---------- |
| Local only            | ✓     | ✗           | ✗          |
| Remote capable        | ✗     | ✓           | ✓          |
| Decentralized         | ✗     | ✗           | ✓          |
| Built-in identity     | ✗     | Token-based | Public key |
| End-to-end encryption | ✗     | TLS         | NIP-44     |

## Event Kind 25910

The unified event kind for all ContextVM messages (ephemeral, 20000-30000 range).

Why ephemeral?

- MCP messages are transient
- Reduces relay storage burden
- Real-time communication pattern
