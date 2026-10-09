# Managed signer: the server keeps the creator key as an ncryptsec unlocked by a local key file

The studio's default identity (docs/studio-spec.md, "Identität und Signer") is a key the server generates and signs with, so a creator works with the admin password alone. The key is stored in `secrets.toml` as a NIP-49 `ncryptsec` (scrypt + XChaCha20-Poly1305, authenticated: a changed byte fails to unlock). Its password is 256 random bits in `<data>/signer.key` (mode 0600), created with the key. The server unlocks the key once at startup and keeps it in memory; signing, the state query and the `nsec` export are endpoints under `/api/admin/signer`, behind the same session cookie and JSON-only rule as the config endpoint. The export also needs the admin password, and wrong ones count towards the login throttle (ADR 0002 addendum). The key is created once; replacing it would discard the identity, and switching between managed and own keys is not part of the first cut. The server does not put the key into `creators`/`allowed_writers` itself: the studio saves the config with it added, the same step as for a NIP-07 key, so the config stays the one place that grants publishing.

## Threat model

Whoever controls the server owns the identity in managed mode: the process holds the key unlocked, and `signer.key` sits next to `secrets.toml` in the data folder. Root on the host, a compromised process, or a copy of the whole data folder (a backup, a volume snapshot) yields the `nsec`. The same goes for anyone with an admin session: they cannot read the key without the password, but they can have anything signed. What the encryption does buy is that `secrets.toml` alone (pasted into a support request, copied around without the rest) does not give the key away, and the at-rest format is a standard one the owner can open elsewhere with the password file. Owners who do not accept this risk choose their own key in onboarding; the server never sees that one.

`nostube-server admin reset` keeps the key: a forgotten password must not cost the identity. If `signer.key` is lost or does not match, the admin area keeps working and signing and export fail with that error; the key is then gone unless a backup has both files.

## Considered Options

- **Encrypt with the admin password**: rejected. The key would be locked after every restart (each config save restarts the process) until the next password login, the NIP-07 login could not unlock it at all, and `admin reset` would destroy the identity.
- **Plain key in `secrets.toml`**: rejected. No better against a server compromise, worse when that file travels alone.
- **Derive the encryption key from the session secret**: rejected. Same file, and `admin reset` rotates that secret.
- **OS keychain or an operator-supplied environment secret**: rejected for the first cut. No keychain in the container image, and an environment secret would have to be kept outside the data folder by every operator, with the identity lost when it is.
- **Low scrypt work factor (`log_n` 12)**: chosen. The password is random, not chosen by a person, so a higher factor would only slow down startup.
