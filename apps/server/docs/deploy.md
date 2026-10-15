# Running Nostube Server on the internet

The image `ghcr.io/flox1an/nostube-server` runs the instance as plain HTTP on port 8080. A
reverse proxy in front of it provides HTTPS (Caddy, nginx, Traefik, Coolify). The server needs
two things: a folder to keep its data in, and the public address it is reachable at.

## Quick start (Docker Compose with Caddy)

```sh
cp apps/server/docker-compose.example.yml docker-compose.yml
export NOSTUBE_ORIGIN=https://videos.example.org   # the DNS name must point at this host
docker compose up -d
docker compose logs nostube                         # the admin setup link is printed on the first start
```

Open the setup link, choose the admin password, and continue in the studio at `/studio/`.
Caddy gets and renews the certificate by itself (ports 80 and 443 have to be reachable).

Site and Studio support English, German, French, Spanish, Russian, Chinese and Japanese.
The public Site uses the first supported browser language, falling back to English; it has no
language selector and ignores saved language preferences. Studio offers its operator language
selector under **Server → Instance**, remembered in that browser (`i18nextLng`), not in the instance configuration.
Creator titles, descriptions and other published content are not translated. Long descriptions
on the Site's video page start collapsed to three lines and can be expanded with More/Less.
Video sharing can include the play position, and description timestamps are parsed as player
chapters. Signed-in visitors can like videos and send Lightning zaps through the creator's
LNURL-pay provider (QR/external wallet or an injected WebLN wallet). Like publishing needs an
accepting interaction relay; zap totals include only validated provider receipts.

The signed-in visitor's name and avatar are always discovered through the mandatory public
profile indexers (`wss://purplepag.es`, `wss://index.hzrd149.com`), their NIP-65 write relays,
the instance relays and any additional visitor-profile relays configured in Studio, in both
reaches. `profile_relays = []` means no additional relays, not a public-lookup opt-out. Only
that visitor's kinds 0 and 10002 use this exception. In private reach, video sources, creator
metadata, embed queries and interaction publishing stay on the instance; in public reach they
use the configured public relays and mirrors. Public relays learn the visitor's IP address
and queried public key; a public avatar URL can also contact its host.

**Reach** (Studio: Privat / Öffentlich, `reach` in `config.toml`, ADR 0012) decides whether the
instance announces its channel on the Nostr network. `private` is the default: the instance
publishes nothing but copies to the `[mirror]` targets you enter, and the site reads videos,
creator data and comments only from the instance relay, whatever relay lists are stored.
`public` publishes the managed channel's profile, relay list (10002) and Blossom server list
(10063) to `profile_relays` through the outbox. Public requires either a publicly reachable
origin or at least one public mirror relay **and** one public mirror Blossom server. A LAN,
local-ca, `.local` or IP origin can therefore publish through mirrors, but never appears in
public event URLs or relay lists. Removing the last required mirror while public is refused.
NIP-05 stays on the instance; a LAN-only profile does not advertise an unreachable NIP-05 name.
Returning to private stops announcements but cannot revoke foreign copies.

Signed-in visitors can also report a video or a comment. A report is a signed NIP-56 note on
the relay, public like any other event and never anonymous; **Content → Moderation** in Studio
lists video, comment and account reports next to the comments themselves, resolved against
what the relay already stores (ADR 0011) and with no new storage of its own. A report on a
comment or an account offers the existing mute actions; a report on a video points to the
Videos page instead (the report disappears once the video is deleted, but not just hidden),
and a report on the creator's own account or reply offers nothing to mute.

The Site's first login dialog uses a translated, brand-neutral “Welcome” heading.

**Server → Overview** in Studio shows the built-in relay's live event count and distribution
by kind, SQLite size (including WAL), and Blossom's file count, used storage, configured
quota and free disk space. A refresh button reloads the numbers. Upload/download counts
and bytes served are process-local counters and reset on restart. The quota bar is hidden
when storage is unlimited. `GET /api/admin/stats` requires the admin session; it does not
enable public Prometheus metrics or add NIP-45 `COUNT` support to the relay.

## Publishing the site as an nsite

With a managed channel identity, configure any required mirrors under **Server → Advanced**,
save them, and explicitly select **Public** reach. Under the site settings, **Site hosting**
then offers **nsite**. Own identity and private reach do not offer this option.

Select a gateway (initially `nsite.lol`), optionally enter a custom domain, save the settings,
then press **Publish**. The gateway URL is `https://<channel npub>.<gateway>`. For a custom
domain, point its CNAME at `<channel npub>.<gateway>`; check the gateway's custom-domain TLS
support before using it. The custom domain becomes the baked origin for sharing and embeds.

The instance stores the embedded site, branding and embed player in its Blossom, mirrors
them where configured, and publishes a signed kind 15128 root manifest only after the files
are publicly available. Studio shows the aggregate version, publication time and delivery
state; outbox failures use the existing retry controls. Gateways cache manifests, so changes
can take up to an hour to appear. Config/branding changes and new server builds automatically
republish changed files; unchanged content publishes nothing. Superseded blobs are cleaned up
after delivery, except files still used by the current site or another event.

The instance's site routes redirect with 302, retaining the path and query. Relay, Blossom,
Studio, admin/APIs, NIP-05, branding and `/embed.html` remain on the instance.

For a LAN-only instance, Studio waits for confirmed mirror copies of video outputs, thumbnails
and subtitles before publishing their public URLs. The managed profile's logo/banner also use
confirmed mirror Blossom URLs. Mirror limits, quotas and availability are the owner's concern;
there are no default mirror servers.

Turning nsite off or selecting private asks whether to delete it: **Cancel** leaves settings
unchanged, **Keep** stops redirects but preserves the public site, and **Delete** queues a
manifest deletion plus unreferenced blob deletions with retries. Deletion is best effort;
foreign copies may remain. Shared media and profile images are retained.

The nsite has generic link previews, not per-video prerendered SEO, sitemaps or feeds. With
a LAN-only origin, visitor interactions stay on foreign relays: Studio does not see them and
local moderation has no effect there. The separately planned interaction importer
(ADR 0014, #164) is not enabled or implemented by nsite hosting.

## What you have to set

| What               | How                                                            | Why                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The data folder    | mount it at `/data`                                            | everything the instance keeps lives there: `config.toml`, `secrets.toml` (with `signer.key` once a managed key exists), the relay database (which also holds the mirror outbox, ADR 0009), the stored videos, and `branding/` with the logo, favicon, banner and app icon uploaded in the studio |
| The public address | `NOSTUBE_ORIGIN=https://videos.example.org` on the first start | it ends up in links, in the public config and in published events. After the first start it is read from `/data/config.toml`; changing it later is a hostname transition and not a variable (the server warns when the two differ)                                                     |

Everything else is optional: `NOSTUBE_PORT` (default 8080), `NOSTUBE_BIND` (the image binds all
interfaces, the binary alone binds loopback in proxy mode), `NOSTUBE_DATA` (`/data` in the image).
A mount alone is not enough: without `NOSTUBE_ORIGIN` the first start stops with a message that
says so, because the server cannot know under which address it is published.

## Rules for the proxy

- **Pass `Host` on unchanged** (Caddy, nginx with `proxy_set_header Host $host`, Traefik do). The
  admin login with a Nostr key checks the host.
- **WebSockets** must pass: the relay is `wss://<origin>` on the same address.
- **No small upload limits.** Blossom takes files up to 4 GiB. nginx defaults to 1 MB
  (`client_max_body_size`), Cloudflare's free plan stops at 100 MB per request.
- **Let the server's `Cache-Control` decide.** The studio page, `/api/config`, `/api/health` and
  everything under `/admin` and `/api/admin` must not be cached (admin answers are
  `private, no-store`), hashed assets may be cached for a year; the server says so in its headers.
  A Cloudflare rule that caches everything (Cache Rule with an Edge TTL override, or the "Cache
  Everything" page rule) ignores these headers: it serves an old studio for days after an update,
  old site settings after every save, and the admin answers of one logged-in session (config,
  stats, signer) to anyone who asks. Exclude the instance's host from such rules.
- **Do not publish the instance's own port to the internet.** It speaks plain HTTP, including the
  admin login. In Compose, give only the proxy `ports:`; the instance is reached over the Compose
  network. (The binary alone listens on `127.0.0.1` in proxy mode for the same reason.)
- The server reads no `X-Forwarded-*` headers. The address comes from the config.

## Restart policy

Most studio saves apply while the instance runs. A save that changes who may publish, the storage
limits or the mirror targets ends the process on purpose (it then starts again on the new config,
ADR 0010). The container therefore needs a restart policy that also restarts a clean exit:
**`restart: always`** or `unless-stopped`. `on-failure` would leave the instance down after such a
save. The studio waits up to 90 s for the new start and says so when nothing came back.

A SIGTERM (`docker stop`, a redeploy) stops it the same way: no new connections, running
requests get up to 30 s, exit status 0. Use `stop_grace_period: 40s` if you upload large files.

## Coolify

The same image runs as a Coolify "Docker Image" application; Coolify's proxy provides HTTPS. What
matters in the application:

| Setting               | Value                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image                 | `ghcr.io/<owner>/nostube-server:main`                              | Coolify pulls it on every deploy (the package has to be public, or Coolify needs a registry login)                                                                                                                                                                                                                                                                                                                                                                |
| Port                  | `8080`                                                             | the instance speaks plain HTTP                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Domain                | `https://<your name>`                                              | also the value of `NOSTUBE_ORIGIN`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Environment           | `NOSTUBE_ORIGIN=https://<your name>`                               | read on the first start only (see above)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Persistent storage    | a volume on `/data`                                                | everything the instance keeps; **not** covered by Coolify's own backups, so back it up yourself                                                                                                                                                                                                                                                                                                                                                                   |
| Health check          | **off**                                                            | Coolify starts the new container before it stops the old one (measured: about two seconds apart, also with its health check off). The server therefore locks its data folder, and the new process waits until the old one has exited. With the health check on, Coolify waits for the new container to be healthy before it stops the old one, and the two would wait for each other until the deploy times out. Expect a gap of a few seconds (`503`) per deploy |
| Resource limits       | for example `2g` memory and the same swap value                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Custom Docker options | `--cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID` | the entrypoint needs these three only to take over the data volume; the server itself then runs as uid 10001 with no capabilities at all (Coolify cuts a value at its first hyphen, these have none)                                                                                                                                                                                                                                                              |

Coolify's default restart policy (`unless-stopped`) restarts the container after the clean exit that
saving in the studio causes.

**Rolling it out.** `server-image.yml` only builds, tests and pushes the image; it does not deploy.
Redeploy the application in Coolify to pull it. `/api/health` carries a `revision` (the commit of
the image), so you can check that the new image is the one running.

## Login protection

After three wrong admin passwords in a row, each further one makes the next try wait twice as long
(2 s, 4 s, … up to 15 minutes), and during the wait even the right password is refused. The count is
for the whole instance, not per visitor, because the server reads no forwarded headers: someone who
keeps guessing also makes you wait. Logging in with a bound Nostr key (Studio → Server → Account)
is not throttled, and restarting the container clears the count. Put a rate limit in the proxy
(Caddy, nginx) too if the admin address is public.

## One instance per data folder

The server takes an exclusive lock on `<data>/.instance.lock` when it starts and waits (up to 90 s,
with a line in the log) while another process holds it. The operating system releases the lock when
that process exits, however it exits. That makes a deploy that starts the new container before
stopping the old one safe: two processes never have the SQLite file, the stored videos and the
secrets open at the same time. It also stops a second `docker run` on the same volume from doing
damage. (`admin reset` and `config rollback` are file edits for a stopped instance and do not take
the lock.)

## Operating it

```sh
# Logs and health
docker compose logs -f nostube
docker inspect --format '{{.State.Health.Status}}' $(docker compose ps -q nostube)

# Forgot the admin password: stop, reset, start (prints a new setup link)
docker compose stop nostube
docker compose run --rm nostube nostube-server admin reset
docker compose up -d nostube

# A config you saved does not boot: go back to the previous one
docker compose stop nostube
docker compose run --rm nostube nostube-server config rollback
docker compose up -d nostube
```

Run these commands through `docker compose run` (they start through the entrypoint, as the
unprivileged user). `docker exec` runs as root and leaves `secrets.toml` owned by root; if you
use it, add `-u 10001`.

**Backup:** stop the container and copy the data folder (or snapshot the volume). It holds the
secrets, so treat the copy accordingly. With a managed key (ADR 0007) the copy holds the creator
identity: `secrets.toml` and `signer.key` together unlock it, and one without the other cannot.

**Update:** `docker compose pull && docker compose up -d`. Tags: `main` (latest build of the
main branch), `sha-<commit>`, and `<version>` for releases (`server-v<version>` git tags).

## Without Docker

Build the web assets and the binary on the host and run it behind the same kind of proxy:

```sh
scripts/build-server-web.sh
cargo build --release --manifest-path apps/server/Cargo.toml
./apps/server/target/release/nostube-server --tls proxy --origin https://videos.example.org --data /var/lib/nostube
```

Run it under systemd with `Restart=always` for the reason given above.

## Checking video and visitor-profile traffic boundaries

Signed-in visitor identity always uses the public defaults and NIP-65 write relays (ADR 0008),
in both reaches. There is no “Local only” visitor setting: Studio's visitor-profile list adds
discovery relays, and `profile_relays = []` adds none. An instance with signed-in visitors
therefore cannot promise zero internet traffic. In private reach video catalog, creator
queries and the embed use the instance relay; public reach uses public configured sources.

`apps/server/scripts/check-local-profile.mjs` checks this boundary on macOS. It starts a
throwaway private-reach instance with `profile_relays = []` and seeds a creator video, profile,
thumbnail and media only on its own relay and Blossom. It opens the signed-in site, its video
page and the embed in separate headless Brave targets (`--browser` selects another Chromium).
On the site and video page, only `wss://purplepag.es` and `wss://index.hzrd149.com` may be
external sockets. Every public `REQ` must filter only kinds 0/10002 and exactly the seeded
visitor's public key; public `CLOSE`s are allowed, writes and other messages are not.
Unexpected hosts, external HTTP, public video queries and any external embed traffic exit 1.
The check also requires both public sockets and visitor kind 0/10002 requests to be observed;
it needs public-relay connectivity and may need a longer `--wait` on a slow connection.
This private-reach check does not cover public reach through mirrors or nsite hosting.

Prerequisites: installed workspace dependencies, macOS `scutil`/mDNS, Brave or another
Chromium browser, and freshly built Site/Studio/embed assets and server. The instance uses
a throwaway local CA and browser profile. `--default-profile-relays` compares an omitted
config list with the explicit empty list; both must retain public visitor lookup.
`--serve` only seeds and keeps the instance running for manual inspection.

```sh
scripts/build-server-web.sh && cargo build --manifest-path apps/server/Cargo.toml
node apps/server/scripts/check-local-profile.mjs
node apps/server/scripts/check-local-profile.mjs --default-profile-relays
```

## Not covered yet

The image is built for `linux/amd64` only. `arm64` (a Raspberry Pi, an ARM VPS) needs a native
arm64 build job. Forwarded headers (`trusted_proxies`, ADR 0003) and a built-in ACME client are
not implemented; the proxy owns the certificate.
