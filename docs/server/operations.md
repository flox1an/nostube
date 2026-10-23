# Operations

Commands below assume the Compose setup from [Getting started](/server/#quick-start-with-docker-compose-and-caddy)
with the service name `nostube`.

For the FIPS stack, add `-f docker-compose.fips.yml` to Compose commands. A FIPS sidecar replacement
needs a [whole-stack restart](/server/tls#restarting-and-upgrading), not an app-only rolling upgrade.

## Images and releases

The image `ghcr.io/flox1an/nostube-server` is built by GitHub Actions on every push to `main` that
touches the server, site, Studio, web app or shared packages. Each build is smoke-tested before it is
pushed.

| Tag            | Meaning                                                                            |
| -------------- | ---------------------------------------------------------------------------------- |
| `main`         | The latest build of the `main` branch                                              |
| `sha-<commit>` | A specific commit                                                                  |
| `<version>`    | A release, for example `1.2.0`; the commit carries the git tag `server-v<version>` |

The image is built for `linux/amd64` only. An `arm64` host (Raspberry Pi, ARM VPS) needs a local build:

```sh
docker build -f apps/server/Dockerfile -t nostube-server .
```

## Upgrading

```sh
docker compose pull && docker compose up -d
```

Pin a `<version>` or `sha-<commit>` tag instead of `main` to upgrade deliberately. The build does not
deploy anything; on Coolify, redeploy the application to pull the new image. Check which build is
running with the `revision` field of `/api/health`.

## Logs and health

```sh
docker compose logs -f nostube
docker inspect --format '{{.State.Health.Status}}' $(docker compose ps -q nostube)
curl -s https://videos.example.org/api/health
```

`GET /api/health` answers, uncached:

```json
{ "ok": true, "boot": "3f9c0a1b2c3d4e5f", "revision": "<git commit of the image>" }
```

`boot` changes on every start (Studio polls it to notice a restart); `revision` is `null` when the
build commit is unknown, for example for a binary built from source. The image's Docker health check
calls this endpoint every 30 seconds.

The log level is `info`; set `RUST_LOG` (for example `RUST_LOG=debug`) to change it. Startup failures
end with one line naming the cause.

## Restarts

Most Studio saves apply while the instance runs. A save that changes the allowed writers, the storage
settings (including S3 and its secret) or the mirror targets ends the process on purpose; it then
starts again on the new configuration ([ADR 0010](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0010-apply-public-config-while-running.md)).
The onboarding wizard's **Finish** does the same.

The container therefore needs a restart policy that also restarts a clean exit: **`restart: always`**
or `unless-stopped`. `on-failure` would leave the instance down after such a save. Without Docker, use
a supervisor such as systemd with `Restart=always`. Studio waits up to 90 seconds for the new start
and says so when nothing came back; it keeps waiting and continues once the server is back.

A restart, a SIGTERM (`docker stop`, a redeploy) and Ctrl-C all stop the instance the same way: no new
connections, running requests get up to 30 seconds, exit status 0. Use `stop_grace_period: 40s` in
Compose if you upload large files. Pending mirror deliveries stay queued and go out after the start.

### One instance per data folder

On start the server takes an exclusive lock on `<data>/.instance.lock` and waits up to 90 seconds,
with a line in the log, while another process holds it. The operating system releases the lock when
that process exits, however it exits. A deploy that starts the new container before stopping the old
one is therefore safe, and a second `docker run` on the same volume cannot do damage. `admin reset` and
`config rollback` are file edits for a stopped instance and do not take the lock.

## Admin commands

Run them through `docker compose run`, which starts them through the entrypoint as the unprivileged
user. `docker exec` runs as root and leaves `secrets.toml` owned by root; if you use it, add `-u 10001`.
Without Docker, put the subcommand first: `nostube-server admin reset --data <dir>` (or set
`NOSTUBE_DATA`); the same applies to `config rollback`.

### Reset the admin password

```sh
docker compose stop nostube
docker compose run --rm nostube nostube-server admin reset
docker compose up -d nostube
```

`admin reset` removes the password and the bound Nostr login key, ends all sessions and prints a new
one-time setup token. The next start logs the setup link again; register a new password at
`/admin/setup`. The managed key, the S3 secret and all content are kept.

### Roll back a broken config

Every Studio save keeps the previous file as `config.prev`. If a saved configuration does not start:

```sh
docker compose stop nostube
docker compose run --rm nostube nostube-server config rollback
docker compose up -d nostube
```

`config rollback` copies `config.prev` back to `config.toml` and removes `config.prev`, so it goes back
one step only. It fails when there is no `config.prev`.

If `secrets.toml` cannot be read, the instance still serves the site, relay and media, but the admin
area answers `503` and the log says `admin disabled` with the reason.

## Backups

Stop the container and copy the data directory, or snapshot the volume:

```sh
docker compose stop nostube
sudo tar czf nostube-backup.tar.gz data/   # the files belong to uid 10001
docker compose up -d nostube
```

| What           | Why                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `config.toml`  | All instance settings                                                                                                               |
| `secrets.toml` | Admin password hash, bound login key, the encrypted managed key, the S3 secret                                                      |
| `signer.key`   | Unlocks the managed key. `secrets.toml` and `signer.key` together hold the creator identity; one without the other cannot unlock it |
| `relay.sqlite` | All events, the mirror outbox, nsite state, scheduled videos, play counts                                                           |
| `blossom/`     | The media stored on this machine                                                                                                    |
| `branding/`    | Logo, favicon, banner, app icon                                                                                                     |
| `tls/`         | local-ca only: the CA that viewer devices trust. Losing it means trusting a new CA on every device                                  |

The copy holds secrets and, with a managed key, the creator identity: treat it accordingly. Media in an
S3 bucket is not in the data directory; back up the bucket with your provider's tools. Mirrors keep
copies of media and events on other servers, see [Mirrors as backups](/server/storage#mirrors-as-backups).
Coolify's own backups do not cover the data volume.

## Not built yet

- `linux/arm64` images.
- A built-in ACME client and trusted forwarded headers (`trusted_proxies`): in proxy mode the reverse
  proxy owns the certificate and the server reads no `X-Forwarded-*` headers.
