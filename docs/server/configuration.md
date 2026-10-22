# Configuration

An instance is configured in three places: command-line flags or environment variables (how the
process starts), `config.toml` in the data directory (the instance settings), and Studio, which edits
most of `config.toml` for you.

## Data directory

Everything the instance keeps lives in one folder: `--data` / `NOSTUBE_DATA`, `/data` in the container
image, `./data` relative to the working directory otherwise.

| Path | Content |
| --- | --- |
| `config.toml` | The instance configuration, see [below](#config-toml-reference). Written with defaults on the first start |
| `config.prev` | The previous configuration, kept on every Studio save for [`config rollback`](/server/operations#roll-back-a-broken-config) |
| `secrets.toml` | Private (mode 0600): session secret, admin password hash, bound Nostr login key, setup token while no admin exists, the encrypted managed key, the S3 secret access key |
| `signer.key` | The password that decrypts the managed key in `secrets.toml`. Exists once a managed key was created |
| `relay.sqlite` | The relay database, which also holds the mirror outbox, nsite state, play counts and scheduled videos |
| `blossom/` | The stored media files (Blossom) |
| `branding/` | Logo, favicon, banner and app icon uploaded in Studio |
| `tls/` | Only in local-ca mode: `ca.pem`, `ca-key.pem`, `leaf.pem` of the [instance CA](/server/tls#local-ca-mode) |
| `storage-move.json` | Progress of a running [move to S3](/server/storage#moving-existing-files) |
| `.instance.lock` | Lock file: one running instance per data folder |

The managed key is encrypted (NIP-49) with the password in `signer.key`, so a copy of `secrets.toml`
alone does not contain the creator identity ([ADR 0007](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0007-managed-signer.md)).
See [Backups](/server/operations#backups) for what to copy.

## Command line and environment

```text
nostube-server [--data <dir>] [--bind <IP>] [--port <port>] [--http-port <port|0>]
               [--origin <https://host>] [--tls <proxy|local-ca>]
nostube-server admin reset
nostube-server config rollback
```

Every flag has an environment variable; a flag wins over its variable. Empty variables are ignored.

| Flag | Variable | Default | Meaning |
| --- | --- | --- | --- |
| `--data` | `NOSTUBE_DATA` | `data` (image: `/data`) | The data directory |
| `--bind` | `NOSTUBE_BIND` | proxy: `127.0.0.1`; local-ca: `0.0.0.0` (image: `0.0.0.0`) | IP address to listen on |
| `--port` | `NOSTUBE_PORT` | proxy: `8080`; local-ca: `443` (image: `8080`) | HTTP port (proxy) or HTTPS port (local-ca) |
| `--http-port` | `NOSTUBE_HTTP_PORT` | `80` | local-ca only: the CA onboarding port; `0` disables it |
| `--origin` | `NOSTUBE_ORIGIN` | none | First start only: the canonical origin, `https://host[:port]` without a path |
| `--tls` | `NOSTUBE_TLS` | `proxy` if an origin is given, else `local-ca` (image: `proxy`) | First start only: the [TLS mode](/server/tls) |

The origin and the TLS mode are first-start choices. Once `config.toml` exists, the server keeps the
stored values; a different `--origin` is ignored with a warning. The ports given on the first start are
written to `config.toml`; on later starts `--port` and `--http-port` override the stored ports for that
run only. Bind addresses are never stored.

Other variables:

| Variable | Meaning |
| --- | --- |
| `RUST_LOG` | Log filter, default `info` (for example `RUST_LOG=debug`) |
| `NOSTUBE_REVISION` | The build commit reported by `/api/health`; the image sets it |

## What Studio edits

Studio edits every setting except the origin, the TLS section and `revision`. Each save validates the
whole configuration, keeps the old file as `config.prev` and increments `revision`.

Most saves apply while the instance runs. A save that changes one of these ends the process on purpose
so that it starts again on the new configuration ([ADR 0010](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0010-apply-public-config-while-running.md)):

- `allowed_writers`
- anything under `[storage]`, including the S3 settings, or a new S3 secret
- anything under `[mirror]`

This requires a restart policy that also restarts a clean exit, see [Restarts](/server/operations#restarts).

File-only settings: `origin`, `[tls]` (mode, ports, `router_name`) and `revision`. The server reads
`config.toml` at start, so restart it after editing the file by hand. Unknown keys are an error, and an
invalid file stops the start with a message naming the problem.

## config.toml reference

The default file of an instance started with `NOSTUBE_ORIGIN=https://videos.example.org`:

```toml
revision = 1
origin = "https://videos.example.org"
title = "My videos"
reach = "private"
site_hosting = "instance"
creators = []
allowed_writers = []
video_sources = ["wss://videos.example.org"]
interaction_relays = ["wss://videos.example.org"]
profile_relays = [
    "wss://purplepag.es",
    "wss://nos.lol",
    "wss://relay.damus.io",
]

[search]
mode = "off"

[tls]
mode = "proxy"
port = 8080

[storage]
quota_gib = 0
free_space_reserve_gib = 5

[site]
tagline = ""
accent = "#8b5cf6"
font = "sans"
hidden_videos = []
lightning = ""
count_plays = false

[site.links]
profile = "https://njump.me/{nip19}"
video = "https://nostu.be/v/{nip19}"
note = "https://njump.me/{nip19}"

[site.pages]

[site.homepage]
intro = ""
featured = ""
featured_text = ""
selected = []
links = []

[nsite]
gateway = "nsite.lol"
domain = ""
```

### Top level

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `revision` | `1` | | Positive integer, incremented by every Studio save |
| `origin` | from `--origin` | file only | The [canonical origin](/server/tls#canonical-origin), `https://host[:port]` |
| `title` | `"My videos"` | | Site title and relay name; must not be empty |
| `reach` | `"private"` | | `private` or `public`, see [Reach](/server/studio#reach) |
| `site_hosting` | `"instance"` | | `instance` or `nsite`; `nsite` needs `reach = "public"` and the managed key, see [nsite hosting](/server/studio#nsite-hosting) |
| `creators` | `[]` | | **Displayed creators**: public keys (hex or npub) whose videos the site shows. The first one is the start page |
| `allowed_writers` | `[]` | yes | **Allowed writers**: keys that may write to the relay and upload to Blossom. Empty means nobody can upload |
| `video_sources` | `["wss://<origin host>"]` | | **Video sources**: relays for the video catalog (public reach only) |
| `interaction_relays` | `["wss://<origin host>"]` | | Relays for profiles, comments and other interactions (public reach only) |
| `profile_relays` | `purplepag.es`, `nos.lol`, `relay.damus.io` | | **Profile relays**: extra relays for signed-in visitors' profiles; in public reach also where the channel profile is published. `[]` adds none |

All relay lists take `ws://` or `wss://` URLs. In private reach the site uses only the instance relay
for videos and interactions; the stored lists are kept for public reach.

### `[search]`

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `"off"` | `off`: no search. `local`: a search box that finds the shown videos by title, description and tags in the visitor's browser |

### `[tls]`

File only. See [HTTPS and networks](/server/tls).

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `"proxy"` or `"local-ca"` | Chosen on the first start |
| `port` | `8080` | proxy: the plain HTTP port |
| `https_port` | `443` | local-ca: the HTTPS port |
| `http_port` | `80` | local-ca: the CA onboarding port; `0` disables it |
| `router_name` | none | local-ca: an extra DNS name for the certificate, such as `videos.lan` |

### `[storage]`

Changes restart the instance. See [Storage and S3](/server/storage).

| Key | Default | Meaning |
| --- | --- | --- |
| `quota_gib` | `0` | **Storage quota** in GiB over all stored media, local and S3; `0` is unlimited |
| `free_space_reserve_gib` | `5` | **Free-space reserve** in GiB kept free on the local disk |

`[storage.s3]` (absent: local storage only):

| Key | Default | Meaning |
| --- | --- | --- |
| `endpoint` | required | S3 API endpoint, `http://` or `https://` |
| `bucket` | required | Bucket name |
| `access_key_id` | required | Access key ID |
| `region` | `"auto"` | SigV4 region, for example `eu-central-1` |
| `force_path_style` | `false` | Path-style addressing (MinIO, Garage) |

The secret access key is not in `config.toml`; it is `s3_secret_access_key` in `secrets.toml`.

### `[site]`

| Key | Default | Meaning |
| --- | --- | --- |
| `tagline` | `""` | Line under the site title |
| `accent` | `"#8b5cf6"` | Accent colour, `#rrggbb` |
| `font` | `"sans"` | `sans`, `serif` or `mono` |
| `hidden_videos` | `[]` | Videos the site does not show: `<kind>:<pubkey hex>:<d>` or a 64-hex event id |
| `lightning` | `""` | Lightning address (`name@domain.tld`) for zaps to the channel identity |
| `count_plays` | `false` | Opt-in [play counting](/server/studio#play-counting) |

`[site.links]`: where links to Nostr content outside the site go. Each is an `https://` URL template
containing `{nip19}`.

| Key | Default |
| --- | --- |
| `profile` | `https://njump.me/{nip19}` |
| `video` | `https://nostu.be/v/{nip19}` |
| `note` | `https://njump.me/{nip19}` |

`[site.pages]`: the optional `about`, `imprint` and `privacy` pages, each a table from a two-letter
language code to text (at most 20,000 characters). A page without text is not shown.

```toml
[site.pages.about]
en = "Videos about woodworking."
de = "Videos über Holzarbeiten."
```

`[site.homepage]`: the curated start page; all optional.

| Key | Limit | Meaning |
| --- | --- | --- |
| `intro` | 2,000 characters | Introduction text |
| `featured` | | One featured video: an event id or `34235:<pubkey>:<d>` / `34236:<pubkey>:<d>` |
| `featured_text` | 500 characters | Note on the featured video |
| `selected` | 12 videos | Selected videos, same format as `featured` |
| `links` | 5 links | `{ label, url }` tables; label 1–80 characters, `https://` URL |
| `action` | | One main button, `{ label, url }` |

### `[mirror]`

Omitted while both lists are empty. Changes restart the instance. See [Mirrors](/server/storage#mirrors-as-backups).

| Key | Default | Meaning |
| --- | --- | --- |
| `relays` | `[]` | Relays that receive copies of the allowed writers' events (`ws://`/`wss://`) |
| `blossom` | `[]` | Blossom servers that receive copies of uploaded media (`https://`, or `http://` on the LAN) |

### `[nsite]`

| Key | Default | Meaning |
| --- | --- | --- |
| `gateway` | `"nsite.lol"` | nsite gateway host name, without scheme, port or path |
| `domain` | `""` | Optional custom domain host name |
