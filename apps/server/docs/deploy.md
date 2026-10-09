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

The signed-in visitor's name and avatar are discovered through public profile indexers and
their NIP-65 write relays. This identity lookup does not widen the site's video sources or
the relays used to publish interactions.
The Site's first login dialog uses a translated, brand-neutral “Welcome” heading.

**Server → Overview** in Studio shows the built-in relay's live event count and distribution
by kind, SQLite size (including WAL), and Blossom's file count, used storage, configured
quota and free disk space. A refresh button reloads the numbers. Upload/download counts
and bytes served are process-local counters and reset on restart. The quota bar is hidden
when storage is unlimited. `GET /api/admin/stats` requires the admin session; it does not
enable public Prometheus metrics or add NIP-45 `COUNT` support to the relay.

## What you have to set

| What               | How                                                            | Why                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The data folder    | mount it at `/data`                                            | everything the instance keeps lives there: `config.toml`, `secrets.toml` (with `signer.key` once a managed key exists), the relay database, the stored videos                                                                      |
| The public address | `NOSTUBE_ORIGIN=https://videos.example.org` on the first start | it ends up in links, in the public config and in published events. After the first start it is read from `/data/config.toml`; changing it later is a hostname transition and not a variable (the server warns when the two differ) |

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
- **Do not publish the instance's own port to the internet.** It speaks plain HTTP, including the
  admin login. In Compose, give only the proxy `ports:`; the instance is reached over the Compose
  network. (The binary alone listens on `127.0.0.1` in proxy mode for the same reason.)
- The server reads no `X-Forwarded-*` headers. The address comes from the config.

## Restart policy

Saving in the studio ends the process on purpose (it then starts again on the new config). The
container therefore needs a restart policy that also restarts a clean exit: **`restart: always`**
or `unless-stopped`. `on-failure` would leave the instance down after the first save. The studio
waits up to 90 s for the new start and says so when nothing came back.

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

**Rolling it out from CI.** `server-image.yml` can deploy after it pushed the image from `main`: it
joins the private network the Coolify host is on and calls Coolify's deploy endpoint. It needs the
repository secrets `TS_AUTHKEY`, `COOLIFY_TAILNET_HOST`, `COOLIFY_DEPLOY_TOKEN`,
`COOLIFY_SERVER_UUID` (the application's id) and, optionally, `NOSTUBE_SERVER_URL` (its public
address). Without the first four the deploy steps are skipped. With the last one the workflow then
waits until the running instance reports exactly the commit that was built: `/api/health` carries a
`revision`, because a green deploy alone does not prove that the new image is the one running.

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

## Not covered yet

The image is built for `linux/amd64` only. `arm64` (a Raspberry Pi, an ARM VPS) needs a native
arm64 build job. Forwarded headers (`trusted_proxies`, ADR 0003) and a built-in ACME client are
not implemented; the proxy owns the certificate.
