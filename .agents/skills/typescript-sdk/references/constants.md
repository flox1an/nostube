# SDK Constants

## Event Kinds

```typescript
const CTXVM_MESSAGES_KIND = 25910 // Ephemeral messages
const GIFT_WRAP_KIND = 1059 // Encrypted messages
const SERVER_ANNOUNCEMENT_KIND = 11316 // Server metadata
const RELAY_LIST_METADATA_KIND = 10002 // Relay-list metadata
const TOOLS_LIST_KIND = 11317 // Tools announcement
const RESOURCES_LIST_KIND = 11318 // Resources announcement
const RESOURCETEMPLATES_LIST_KIND = 11319 // Resource templates
const PROMPTS_LIST_KIND = 11320 // Prompts announcement
```

## Nostr Tags

```typescript
const NOSTR_TAGS = {
  PUBKEY: 'p', // Recipient public key
  EVENT_ID: 'e', // Event reference
  CAPABILITY: 'cap', // Pricing metadata
  NAME: 'name', // Server name
  WEBSITE: 'website', // Server website
  PICTURE: 'picture', // Server icon
  ABOUT: 'about', // Server description
  SUPPORT_ENCRYPTION: 'support_encryption',
} as const
```

## Encryption Modes

```typescript
enum EncryptionMode {
  OPTIONAL = 'optional',
  REQUIRED = 'required',
  DISABLED = 'disabled',
}
```

## Announcement Methods

Maps capability types to MCP methods:

```typescript
const announcementMethods = {
  server: 'initialize',
  tools: 'tools/list',
  resources: 'resources/list',
  resourceTemplates: 'resources/templates/list',
  prompts: 'prompts/list',
} as const
```
