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
Hashed assets use a one-year immutable cache policy.

## Build-time configuration

`VITE_NSFW_SAFETY` controls nostube's NSFW safety: the 18+ confirmation before viewers can opt in to
sensitive content, and the embed player's refusal to play flagged videos for viewers without that
opt-in. It is on by default and stays on for any value except `off`. Only disable it on your own
deployment if you take responsibility for the content it then plays directly:

```bash
docker build --build-arg VITE_NSFW_SAFETY=off -t nostube .
```

## Coolify

Create a public Git application with:

- build pack: `dockerfile`
- Dockerfile: `/Dockerfile`
- exposed port: `8080`
- health check: `GET /health` on port `8080`

The GitHub workflow joins the Tailnet as `tag:ci` and triggers the Coolify resource after pushes to
`main`. It requires repository secrets `TS_AUTHKEY`, `COOLIFY_DEPLOY_TOKEN` and `COOLIFY_TAILNET_HOST`
(a secret, not a variable, so the host stays masked in the public Actions log).

TLS terminates at Coolify's Traefik proxy.
