# Admin auth: mandatory password, optional NIP-07 login, one server-side session

The single admin always has a password (argon2id), set at registration through the one-time setup token. A Nostr key can optionally be bound later; it logs in by signing one NIP-98 event through a NIP-07 extension, which the server checks once and exchanges for the same server-side session cookie the password login gets. The password stays mandatory because it works in any fresh browser, without a signer, and in recovery mode. Admin rights come from the bound key as a credential, never from that key being a displayed creator or allowed writer.

## Considered Options

- **Passkeys**: rejected for the first cut. WebAuthn credentials are bound to the hostname, and TLS/naming is still open; a hostname change would orphan every passkey.
- **Nostr-only admin**: rejected. No fallback without a signer, and a leaked creator key would also take the instance.
- **NIP-98 bearer token per request**: rejected. Signer prompts on every call, a 60 s validity window, and a second CSRF model next to the cookie session.
- **nsec / NIP-49 or bunker for admin login**: rejected. Typing a raw key into the admin page puts it next to instance control; a bunker adds a moving part offline.
