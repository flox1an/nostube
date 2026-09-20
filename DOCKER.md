# Docker Deployment Guide

The image serves the Vite bundle and the `/v`, `/short`, `/playlist`, and `/oembed` routes through the
standalone Hono server.

## Run locally

```bash
docker compose up -d --build
curl --fail http://localhost:8080/health
```

Or without Compose:

```bash
docker build -t nostube .
docker run --rm -p 8080:8080 --name nostube nostube
```

The container listens on port `8080`. Unknown non-file routes serve `index.html` for React Router.

## Runtime configuration

The container generates `/runtime-env.js` from these optional environment variables:

| Variable                  | Default                                  |
| ------------------------- | ---------------------------------------- |
| `RUNTIME_RELAYS`          | `wss://relay.divine.video,wss://nos.lol` |
| `RUNTIME_BLOSSOM_SERVERS` | `https://almond.slidestr.net`            |
| `RUNTIME_APP_TITLE`       | `Nostube`                                |
| `RUNTIME_DEBUG`           | `false`                                  |
| `RUNTIME_CUSTOM_CONFIG`   | `null`                                   |

Example:

```bash
docker run --rm -p 8080:8080 \
  -e RUNTIME_RELAYS='wss://relay.divine.video,wss://nos.lol' \
  -e RUNTIME_BLOSSOM_SERVERS='https://almond.slidestr.net' \
  nostube
```

`runtime-env.js` is not cached. Hashed assets use a one-year immutable cache policy.

## Coolify

Create a public Git application with:

- build pack: `dockerfile`
- Dockerfile: `/Dockerfile`
- exposed port: `8080`
- health check: `GET /health` on port `8080`

The GitHub workflow joins the Tailnet as `tag:ci` and triggers the Coolify resource after pushes to
`main`. It requires repository secrets `TS_AUTHKEY` and `COOLIFY_DEPLOY_TOKEN`, plus repository variable
`COOLIFY_TAILNET_HOST`.

TLS terminates at Coolify's Traefik proxy. Keep secrets out of runtime environment variables because
everything in `runtime-env.js` is public.
