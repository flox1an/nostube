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

## What you have to set

| What               | How                                                            | Why                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The data folder    | mount it at `/data`                                            | everything the instance keeps lives there: `config.toml`, `secrets.toml`, the relay database, the stored videos                                                                                                                    |
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

## Login protection

After three wrong admin passwords in a row, each further one makes the next try wait twice as long
(2 s, 4 s, … up to 15 minutes), and during the wait even the right password is refused. The count is
for the whole instance, not per visitor, because the server reads no forwarded headers: someone who
keeps guessing also makes you wait. Logging in with a bound Nostr key (Studio → Server → Account)
is not throttled, and restarting the container clears the count. Put a rate limit in the proxy
(Caddy, nginx) too if the admin address is public.

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
secrets, so treat the copy accordingly.

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
