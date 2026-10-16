# Nostube Server

A self-hosted Nostube instance: one package with a creator's (or a curated set of creators') video homepage, relay and Blossom storage, operable without WAN; the site may be hosted by the instance or published as an nsite.

## Language

### Instance and modes

**Instance**:
One installation of Nostube Server with its own configuration, data path, and admin.
_Avoid_: server, node, deployment

**Homepage mode** (Homepage-Modus):
The Nostube app running under instance rules, showing only the displayed creators' videos from the video sources.
_Avoid_: creator mode, kiosk mode

**Site hosting**:
Where the creator site is hosted: on the instance (`instance`) or as a static NIP-5A site (`nsite`), independently of reach. Code: `siteHosting`.
_Avoid_: deployment mode, static mode

**nsite URL**:
The public origin baked into the published nsite, either the channel's gateway URL or its custom domain; distinct from the instance's canonical origin.
_Avoid_: instance URL, canonical origin

**Operating profile** (Betriebsprofil):
Which modules run locally vs externally: fully local, hybrid, or external.
_Avoid_: deployment mode, setup type

**Fully local profile**:
The operating profile with the built-in relay and Blossom active and a local file backend; the only profile with the offline acceptance promise.

**First cut**:
The fully local profile with one displayed creator, accepted by the offline acceptance test on the Mac host.
_Avoid_: MVP, v1

### Three independent sets

**Displayed creators** (angezeigte Creator):
The creator list whose videos the homepage shows. One entry gives a personal page; several give a curated page.
_Avoid_: followed creators, members

**Allowed writers** (zugelassene Schreiber):
Keys allowed to write to the instance's own relay and Blossom; one set for both. Everyone else can read but not write — with one exception: the relay accepts visitor interactions with locally stored videos of allowed writers (comments, replies, reactions, deletion of one's own interactions, ADR 0006), plus reports, which may instead target an allowed writer's or another visitor's account directly, with no video at all (ADR 0011). Displaying a creator grants no write access, and removing a writer deletes none of their events.
_Avoid_: whitelist, members, admins

**Locally stored media**:
Blobs actually held in the instance's storage. Removing a displayed creator deletes no media.
_Avoid_: mirror, cache

### Storage limits

**Per-file maximum**:
The size ceiling for any single uploaded file: a video output, an HLS segment, a thumbnail, or an original uploaded unchanged.
_Avoid_: upload limit, max upload size

**Storage quota**:
The ceiling on the total size of locally stored media, output variants included.
_Avoid_: disk limit, space limit

**Free-space reserve**:
Disk space the instance always leaves free on the host; uploads that would cut into it are refused.
_Avoid_: min free, safety margin

### Sources and access

**Video sources** (Videoquellen):
The configured relays that video catalog queries may use. Profiles, comments, and other interactions keep their own relay routes. In private reach the public config narrows them to the instance relay; the configured list is kept for public reach.
_Avoid_: default relays, relay list

**Profile relays** (Profil-Relays):
The relays where the site looks up a signed-in visitor's profile besides the instance relays, mandatory public defaults and the visitor's NIP-65 write relays, in both reaches; in public reach they also receive the managed channel's profile, relay list, Blossom server list and nsite manifest.
_Avoid_: discovery relays, lookup relays

**Reach** (Privat / Öffentlich):
What the instance announces and where the site reads: `private` keeps catalog and interactions on the instance, with outgoing copies only to the owner's mirrors; `public` announces the channel and uses public relay sources. Public reach needs either a public instance origin or public mirror relays and Blossom servers; returning to private cannot revoke foreign copies.
_Avoid_: visibility, mode, privacy setting

**Play counting** (Abrufzählung):
The opt-in (`site.countPlays`) anonymous counter of how often a video's media file starts loading from this instance, per file and day, kept for one year and shown per video in Studio. It counts files, never people: no IP address, no user agent, no cookie. Starts served from mirrors, caches or other Blossom servers stay uncounted. The standard privacy text names it while it is on.
_Avoid_: views, viewers, analytics, tracking

**Admin**:
The instance operator. Admin rights come only from the admin credential (password, optionally a bound Nostr key), never from being a displayed creator or allowed writer.
_Avoid_: creator login, owner key

**Setup token**:
The one-time secret, issued while the instance has no admin, that lets its holder register the admin. Consumed by registration.
_Avoid_: setup link, invite, setup password

**Managed key**:
The creator key the instance generates, keeps encrypted and signs with for Studio; it grants no admin rights and writes only where the config allows it. Its channel profile, relay and Blossom server lists, and optional nsite are managed by the instance; with own identity the server signs none of them.
_Avoid_: server key, instance key, admin key

**Own identity** (eigene Identität):
The creator identity in which videos are published under the owner's own Nostr key, signed in the browser (NIP-07). The first-run wizard makes that key creator, allowed writer and bound login key, and copies the owner's existing profile (kind 0) unchanged to the instance relay. Blobs are not mirrored: that needs the managed key (ADR 0009). Code: `own`.
_Avoid_: own key mode, external signer

**Channel identity** (Kanal-Identität):
The creator identity in which videos are published under the managed key; its profile is derived from the site settings. Logging in with a Nostr key is optional and binds the owner's key as login key only. Code: `managed`.
_Avoid_: server identity, managed mode

**Public config**:
The versioned JSON of non-secret instance settings the frontend loads before building loaders.
_Avoid_: runtime env, settings file

**Instance build**:
The Nostube app build embedded in an instance. It loads the public config before anything else and never runs on the normal app defaults.
_Avoid_: custom build, homepage build

### Moderation

**Report** (Meldung):
A NIP-56 signal (kind 1984) that a locally known video, interaction, blob or account is objectionable, sent by a visitor the same way a comment is (ADR 0006, ADR 0011).
_Avoid_: flag, complaint, abuse report

### Reachability

**TLS mode**:
How the instance gets its HTTPS: terminated by an upstream proxy, from operator-supplied certificate files, from the instance CA, or from a public CA via ACME.
_Avoid_: certificate strategy, SSL setting

**Instance CA**:
The private certificate authority an instance runs in the local-ca TLS mode. Viewer devices trust it once.
_Avoid_: self-signed cert, local root

**Canonical origin**:
The one origin of an instance, distinct from an nsite URL; every other name the instance answers to is an alias. Public events use it only when it is publicly reachable.
_Avoid_: base URL, public URL, domain
