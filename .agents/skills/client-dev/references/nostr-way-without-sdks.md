# The Nostr Way Without SDKs

Implement ContextVM clients using raw Nostr primitives—without relying on the TypeScript SDK. Use this when building in languages without SDK support or when you need minimal dependencies.

## The Core Pattern

Calling a ContextVM server follows the same pattern as other Nostr-based RPC (like DVMs): publish a signed request event, then listen for a response that correlates back to your request.

Relays act as a permissionless message bus providing:

- **Identity** via pubkeys
- **Authenticity** via signatures
- **Delivery** via relays
- **Correlation** via event IDs and tags

## The Four Core Capabilities

At minimum, a CVM client needs:

1. **Create and sign a Nostr event** — so the service can verify the sender
2. **Publish to a set of relays** — deliver the request
3. **Subscribe for responses** — listen for the server's reply
4. **Parse the JSON-RPC message** — handle result versus error

## MCP Payload Schemas

All messages carried in the `content` field follow the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) JSON-RPC specification. This provides standardized schemas for:

- **Initialization**: `initialize`, `notifications/initialized`
- **Tools**: `tools/list`, `tools/call`
- **Resources**: `resources/list`, `resources/read`, `resources/subscribe`
- **Prompts**: `prompts/list`, `prompts/get`

The protocol defines exact request/response structures, error formats, and capability negotiation. See the [MCP specification](https://spec.modelcontextprotocol.io/) for complete schema definitions.

## Unencrypted Communication

### Request Event Structure (Kind 25910)

```json
{
  "kind": 25910,
  "pubkey": "<client-pubkey>",
  "created_at": <unix-timestamp>,
  "tags": [
    ["p", "<server-pubkey>"]
  ],
  "content": "<stringified-jsonrpc>"
}
```

The `content` field carries a JSON-RPC message:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### Response Event Structure

```json
{
  "kind": 25910,
  "pubkey": "<server-pubkey>",
  "created_at": <unix-timestamp>,
  "tags": [
    ["e", "<request-event-id>", "<relay-hint>"],
    ["p", "<client-pubkey>"]
  ],
  "content": "<stringified-jsonrpc-response>"
}
```

The `e` tag correlates the response to the original request.

### Implementation Pattern (Meta-Language)

```
FUNCTION send_request(server_pubkey, method, params):
    // Build JSON-RPC payload
    request_payload = {
        jsonrpc: "2.0",
        id: generate_unique_id(),
        method: method,
        params: params
    }

    // Create unsigned Nostr event
    event = {
        kind: 25910,
        created_at: current_unix_timestamp(),
        tags: [["p", server_pubkey]],
        content: serialize_to_json(request_payload)
    }

    // Sign with client private key
    signed_event = sign_nostr_event(event, client_private_key)

    // Publish to all configured relays
    FOR each relay IN relay_connections:
        relay.publish(signed_event)

    RETURN signed_event.id  // For correlation

FUNCTION handle_response(event):
    IF event.kind != 25910:
        RETURN  // Ignore non-CVM events

    // Verify response is from expected server
    IF event.pubkey != expected_server_pubkey:
        RETURN

    // Parse JSON-RPC content
    response = parse_json(event.content)

    IF response.result EXISTS:
        handle_success(response.id, response.result)
    ELSE IF response.error EXISTS:
        handle_error(response.id, response.error)
```

## Encrypted Communication (CEP-4)

### Encryption Detection

Two methods to determine if a server supports encryption:

**Method A: Check Server Announcement**

Query kind 11316 (server announcement) and check for `support_encryption` tag:

```
FUNCTION check_encryption_support(server_pubkey):
    announcement = query_relay_for_kind(11316, author=server_pubkey)
    IF announcement HAS tag "support_encryption":
        RETURN true
    RETURN false
```

**Method B: Attempt Encrypted First (Optional Mode)**

Try encrypted communication first, degrade to unencrypted if server doesn't respond:

```
FUNCTION send_with_optional_encryption(server_pubkey, inner_event):
    // Try encrypted first
    encrypted_sent = send_encrypted(server_pubkey, inner_event)

    // Set timeout and wait for response
    response = wait_for_response(timeout_ms=5000)

    IF response RECEIVED:
        RETURN response
    ELSE:
        // Fall back to unencrypted
        RETURN send_unencrypted(server_pubkey, inner_event)
```

### Encryption Flow

When encryption is enabled, messages use NIP-44 encryption wrapped in NIP-59 gift wraps (kind 1059).

**Sending Encrypted Messages:**

```
FUNCTION send_encrypted(server_pubkey, inner_event):
    // 1. Serialize the inner event (kind 25910)
    plaintext = serialize_to_json(inner_event)

    // 2. Encrypt using NIP-44
    conversation_key = compute_conversation_key(
        client_private_key,
        server_pubkey
    )
    ciphertext = nip44_encrypt(plaintext, conversation_key)

    // 3. Create gift wrap (kind 1059)
    // Use random keys to hide sender identity
    random_keypair = generate_random_keypair()

    gift_wrap = {
        kind: 1059,
        pubkey: random_keypair.public_key,
        created_at: randomize_timestamp(),  // Not strictly necessary, can cause replays
        tags: [["p", server_pubkey]],
        content: ciphertext
    }

    // 4. Sign with random key
    signed_wrap = sign_nostr_event(gift_wrap, random_keypair.private_key)

    // 5. Publish gift wrap
    FOR each relay IN relay_connections:
        relay.publish(signed_wrap)
```

**Receiving Encrypted Messages:**

```
FUNCTION handle_incoming_event(event):
    IF event.kind == 1059:
        // Gift wrap - decrypt to reveal inner event
        ciphertext = event.content

        // Try to decrypt with our private key
        conversation_key = compute_conversation_key(
            client_private_key,
            event.tags["p"]  // Recipient is us
        )

        plaintext = nip44_decrypt(ciphertext, conversation_key)
        IF plaintext IS valid:
            inner_event = parse_json(plaintext)
            process_inner_event(inner_event)

    ELSE IF event.kind == 25910:
        // Unencrypted - process directly
        process_inner_event(event)
```

### NIP-44 Encryption Notes

- Uses ChaCha20-Poly1305 authenticated encryption
- Keys derived via secp256k1 ECDH
- Includes version byte and nonce for security
- See [NIP-44 specification](https://github.com/nostr-protocol/nips/blob/master/44.md) for implementation details

## Comparison: DVMs vs CVM

Both are "RPC over Nostr" with different organizing principles:

| Aspect                    | DVM (NIP-90)                   | CVM                        |
| ------------------------- | ------------------------------ | -------------------------- |
| **Job identification**    | Kind number (5000-5999)        | Tool name                  |
| **Response kind**         | 6000-6999 (kind + 1000)        | Same kind 25910            |
| **Payload**               | Provider-specific in `content` | JSON-RPC message           |
| **Contract discovery**    | External docs/conventions      | `tools/list` introspection |
| **Schema validation**     | Ad hoc                         | JSON Schema                |
| **Correlation**           | Event ID via tags              | Event ID via `e` tag       |
| **Encryption convention** | Provider-specific              | Standardized CEP-4         |

## When to Use

### Use Raw Nostr When:

- Building in a language without SDK support
- You need minimal dependencies
- Learning or debugging the protocol
- Implementing a custom client

### Use the SDK When:

- Building TypeScript/JavaScript applications
- You want type safety and error handling
- You need automatic encryption negotiation
- You want connection management (reconnects, pooling)

## References

### ContextVM Documentation

- [`../overview/references/ceps.md`](../overview/references/ceps.md) — CEP-4 encryption specification
- [`../overview/references/protocol-spec.md`](../overview/references/protocol-spec.md) — Full protocol specification

### MCP (Model Context Protocol)

- [MCP Specification](https://spec.modelcontextprotocol.io/) — Complete JSON-RPC schema definitions
- [MCP Documentation](https://modelcontextprotocol.io/) — Protocol overview and guides

### Nostr NIPs

- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) — Encryption algorithm (ChaCha20-Poly1305)
- [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) — Gift wrap specification
