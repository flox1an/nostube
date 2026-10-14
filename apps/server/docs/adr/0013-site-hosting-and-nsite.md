# Site hosting: the site on the instance's origin or a static nsite beside it

> **Status:** extends ADR 0012 (public reach without a public origin) and ADR 0009 (the outbox pushes blob bytes); one deliberate deviation from ADR 0012 is stated under deletion.

The concept (#153) adds a second way to host the creator homepage: instead of serving the site from its own origin, the instance publishes it as a static **nsite** (NIP-5A) — the site's files go to Blossom servers, a signed manifest (kind `15128`) maps paths to blob hashes, and visitors open the site through an nsite gateway (`https://<npub>.<gateway>`) or a custom domain. The decisions below come from the grilling session on #154; the implementation is spread over the tickets of #153.

**Site hosting is its own setting.** `siteHosting: "instance" | "nsite"` decides only how the site is served and is independent of reach (ADR 0012). Switching to `nsite` replaces only the site: the instance's relay, Blossom and Studio keep working as before on the instance origin. Both scenarios stay supported: S1, a publicly reachable origin with optional mirrors, and S2, a home-network-only instance where everything public goes out through the mirrors.

**Managed key only.** The manifest, the deletions and the mirror requests are signed by the server, so nsite exists only with the managed key (ADR 0007). Without it the studio does not offer the option at all; publishing in the owner's own identity from the studio is rejected (#159, wontfix).

**Reach first (extends ADR 0012).** The existing origin check stays as it is — local-ca, `.local` and an IP address mean not reachable; reachability is derived, not a second switch, and since relay and Blossom share the origin (ADR 0004) they are reachable or unreachable together. What changes: the owner may switch reach to public even without a reachable origin, when at least one mirror relay **and** one mirror Blossom server are configured. Only a public instance is offered nsite, and that is not only policy: gateways find the manifest through the author's kind 10002 on the indexers, so public reach is technically required. Mirrors come only from the owner, have no defaults, and are required exactly where the instance is not public.

**Only publicly reachable URLs go into published events.** In S1 that is the instance origin plus the mirrors, in S2 the mirrors alone. It applies to kind 10002 (relay list), kind 10063 (Blossom server list), the manifest's `server` tags, the relay lists baked into the nsite config, the video events' `url` and `image`, and the derived profile's `picture` and `banner`; an unreachable origin would leave thumbnails and profile images broken in every client, not only playback (#162).

**The outbox pushes blob bytes when nothing can pull (extends ADR 0009).** ADR 0009 mirrors blobs as BUD-04 `PUT /mirror` with the blob's public URL on this instance — the target pulls. From an instance that is not publicly reachable nothing can pull, so there the outbox uploads the bytes itself (`PUT /upload`) to the mirror Blossom servers, through the same queue and retries and with the same hash-and-size confirmation (#155).

**Publishing and the nsite URL.** The site is published as the root site: kind `15128` of the managed key, no `d` tag; named sites (kind `35128`) and snapshots (kind `5128`) are not used. The nsite URL is a gateway URL `https://<npub>.<gateway>` by default, the gateway chosen in the studio; a custom domain pointed at `<npub>.<gateway>` by CNAME is optional, and whether the gateway issues TLS for it is the gateway's business. The first cut does no pre-rendering: every route gets the generic head, config changes apply after the next republish, and gateways cache manifests (#160 parked).

**The instance origin redirects.** With `siteHosting = "nsite"` the instance answers the site routes (`/`, `/v/…`, `/t/…`, `/search`, `/about`, `/imprint`, `/privacy`) with `302` to the same route on the nsite URL. Everything that needs the server stays on the instance: relay, Blossom, Studio, `/.well-known/nostr.json` and `/embed.html`.

**S2 loses inbound interactions, accepted.** On a home-network-only instance a visitor's comments, reactions and reports land on foreign relays and never reach the instance: the studio does not see them and instance moderation has no effect there. Pulling them in is a separate concept (#164).

**Deletion is owner-chosen and thorough.** ADR 0012 makes no deletion attempts when reach switches to private, because the published profile and relay list never promised revocability. Turning nsite off, or switching to private while `siteHosting = "nsite"`, is different: the owner explicitly destroys a published artifact and the studio asks "Delete the nsite now?". A yes sends a NIP-09 deletion for the root site (`15128:<pubkey>:`, empty `d`) and BUD-02 `DELETE`s for the site's blobs; the redirect ends either way, and copies on gateways and mirrors may remain. The server keeps a ledger of the blobs it uploaded for the nsite and removes superseded ones on republish and all of them on delete, except blobs another event of the instance still references (#157, #158, #163).

## Considered Options

- **Studio-signed publishing in the owner's own identity:** rejected; manifest updates, deletions and mirror tokens are signed while nobody is logged in, which only the server-held managed key can do (ADR 0007) (#159 wontfix).
- **A second switch for "static mode" / "deployment mode":** rejected; reachability is derived from the existing origin check, and site hosting is orthogonal to reach — two switches, not three.
- **Default mirrors:** rejected; nothing leaves the instance unless the owner named the target (ADR 0009).
- **Pre-rendered video pages or kind 5128 snapshots:** parked (#160); the generic head is accepted for the first cut.
- **Pulling S2 interactions into the instance:** a separate concept (#164), not part of nsite publishing.
