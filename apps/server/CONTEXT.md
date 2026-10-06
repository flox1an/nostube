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
Keys allowed to write to the instance's own relay and Blossom. Displaying a creator grants no write access.
_Avoid_: whitelist, members, admins

**Locally stored media**:
Blobs actually held in the instance's storage. Removing a displayed creator deletes no media.
_Avoid_: mirror, cache

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
