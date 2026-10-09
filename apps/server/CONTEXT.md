# Nostube Server

A self-hosted Nostube instance: one package serving a creator's (or a curated set of creators') video homepage from the instance's own relay and Blossom storage, operable without WAN.

## Language

### Instance and modes

**Instance**:
One installation of Nostube Server with its own configuration, data path, and admin.
_Avoid_: server, node, deployment

**Homepage mode** (Homepage-Modus):
The Nostube app running under instance rules, showing only the displayed creators' videos from the video sources.
_Avoid_: creator mode, kiosk mode

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
Keys allowed to write to the instance's own relay and Blossom; one set for both. Everyone else can read but not write — with one exception: the relay accepts visitor interactions with locally stored videos of allowed writers (comments, replies, reactions, deletion of one's own interactions, ADR 0006). Displaying a creator grants no write access, and removing a writer deletes none of their events.
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
The configured relays that video catalog queries may use. Profiles, comments, and other interactions keep their own relay routes.
_Avoid_: default relays, relay list

**Admin**:
The instance operator. Admin rights come only from the admin credential (password, optionally a bound Nostr key), never from being a displayed creator or allowed writer.
_Avoid_: creator login, owner key

**Setup token**:
The one-time secret, issued while the instance has no admin, that lets its holder register the admin. Consumed by registration.
_Avoid_: setup link, invite, setup password

**Public config**:
The versioned JSON of non-secret instance settings the frontend loads before building loaders.
_Avoid_: runtime env, settings file

**Instance build**:
The Nostube app build embedded in an instance. It loads the public config before anything else and never runs on the normal app defaults.
_Avoid_: custom build, homepage build

### Reachability

**TLS mode**:
How the instance gets its HTTPS: terminated by an upstream proxy, from operator-supplied certificate files, from the instance CA, or from a public CA via ACME.
_Avoid_: certificate strategy, SSL setting

**Instance CA**:
The private certificate authority an instance runs in the local-ca TLS mode. Viewer devices trust it once.
_Avoid_: self-signed cert, local root

**Canonical origin**:
The one origin of an instance that goes into the public config and into URLs inside published events. Every other name the instance answers to is an alias.
_Avoid_: base URL, public URL, domain
