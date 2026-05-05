# ContextVM Protocol Specification

## Abstract

ContextVM defines a Nostr-based transport layer for MCP, enabling decentralized communication between MCP servers and clients using Nostr's relay network and cryptographic primitives.

## Message Structure

### Content Field

All MCP messages are stringified JSON-RPC objects placed in the Nostr event's `content` field.

### Tags

- `p` - Recipient public key
- `e` - Event ID reference (for request-response correlation)

## Initialization Flow

### 1. Client Initialization Request

```json
{
  "kind": 25910,
  "content": {
    "jsonrpc": "2.0",
    "id": 0,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-07-02",
      "capabilities": {},
      "clientInfo": {
        "name": "ExampleClient",
        "version": "1.0.0"
      }
    }
  },
  "tags": [["p", "<server-pubkey>"]]
}
```

### 2. Server Initialization Response

```json
{
  "kind": 25910,
  "pubkey": "<server-pubkey>",
  "content": {
    "jsonrpc": "2.0",
    "id": 0,
    "result": {
      "protocolVersion": "2025-07-02",
      "capabilities": {
        "tools": { "listChanged": true },
        "resources": { "subscribe": true, "listChanged": true }
      },
      "serverInfo": {
        "name": "ExampleServer",
        "version": "1.0.0"
      }
    }
  },
  "tags": [["e", "<client-init-request-id>"]]
}
```

### 3. Client Initialized Notification

```json
{
  "kind": 25910,
  "content": {
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  },
  "tags": [["p", "<server-pubkey>"]]
}
```

## Capability Operations

### List Operations

All list operations follow MCP standard structure:

```json
{
  "kind": 25910,
  "content": {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": { "cursor": "optional-cursor" }
  },
  "tags": [["p", "<server-pubkey>"]]
}
```

### Tool Call

```json
{
  "kind": 25910,
  "content": {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_weather",
      "arguments": { "location": "New York" }
    }
  },
  "tags": [["p", "<server-pubkey>"]]
}
```

## Encryption

### Gift Wrap Structure (Kind 1059)

When encryption is enabled, messages are wrapped:

```json
{
  "kind": 1059,
  "pubkey": "<random-pubkey>",
  "created_at": "<randomized-timestamp>",
  "tags": [["p", "<recipient-pubkey>"]],
  "content": "<nip44-encrypted-kind-25910-event>"
}
```

The encrypted inner content is the standard kind 25910 event.
