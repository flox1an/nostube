# Admin auth: mandatory password, optional NIP-07 login, one server-side session

The single admin always has a password (argon2id), set at registration through the one-time setup token. A Nostr key can optionally be bound later; it logs in by signing one NIP-98 event through a NIP-07 extension, which the server checks once and exchanges for the same server-side session cookie the password login gets. The password stays mandatory because it works in any fresh browser, without a signer, and in recovery mode. Admin rights come from the bound key as a credential, never from that key being a displayed creator or allowed writer.

## Considered Options

- **Passkeys**: rejected for the first cut. WebAuthn credentials are bound to the hostname, and TLS/naming is still open; a hostname change would orphan every passkey.
- **Nostr-only admin**: rejected. No fallback without a signer, and a leaked creator key would also take the instance.
- **NIP-98 bearer token per request**: rejected. Signer prompts on every call, a 60 s validity window, and a second CSRF model next to the cookie session.
- **nsec / NIP-49 or bunker for admin login**: rejected. Typing a raw key into the admin page puts it next to instance control; a bunker adds a moving part offline.

## Addendum: slowing down password guessing

Wrong passwords are throttled (`src/login_guard.rs`): three in a row are free, then each further one doubles the wait before the next try (2 s, 4 s, 8 s, up to 15 minutes). While the wait runs the password is not checked at all, the answer is `429` with `Retry-After`, so the right guess is refused too. A success clears the count, and so does an hour without a wrong password; someone who tries again the moment each wait ends never gets cleared. The check, the verification and the count are one step under one lock, so parallel requests cannot all pass the check first. The count is for the whole instance, not per address: the server reads no forwarded headers (ADR 0003), so behind a proxy every request has the proxy's address. The cost is that a stranger who keeps guessing makes the real admin wait as well; the Nostr key login (a signature, nothing to guess) is not throttled and still works, and a restart clears the count. The count is kept in memory only.
