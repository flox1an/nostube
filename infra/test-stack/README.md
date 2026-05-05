# Nostube integration test stack (Docker Compose)

First-pass local integration stack for macOS (Docker Desktop) and Linux (Docker Engine).

This stack lives in `nostube/infra/test-stack` and brings up:

- `nostube` (frontend app)
- `almond` (local Blossom-compatible storage)
- `divico-dvm` (nostube-transcode DVM)
- `relay` (local Nostr relay)
- `image-resizer` (imgproxy)
- `test-runner` (smoke test container)

## Prerequisites

- Docker + Docker Compose v2
- Local sibling repos present:
  - `../nostube` (this repo)
  - `../almond`
  - `../divico-dvm`

> Compose build contexts are relative to this folder and point at those sibling repos.

## Quick start

From the `nostube` repo root:

```bash
cp infra/test-stack/.env.example infra/test-stack/.env
# optional: edit ports and OPERATOR_NPUB

docker compose \
  --env-file infra/test-stack/.env \
  -f infra/test-stack/docker-compose.yml \
  up --build -d
```

Open:

- Nostube: `http://localhost:18080` (or your `NOSTUBE_PORT`)
- Almond: `http://localhost:13000`
- Divico DVM UI: `http://localhost:15207`
- Relay: `ws://localhost:18081`
- Imgproxy health: `http://localhost:18082/health`

## Run smoke tests

```bash
docker compose \
  --profile smoke \
  --env-file infra/test-stack/.env \
  -f infra/test-stack/docker-compose.yml \
  run --rm test-runner
```

Smoke tests wait for services and verify:

- HTTP health/status endpoints
- Nostube `runtime-env.js` includes configured relay + blossom URLs
- Almond stats endpoint responds
- Image resizer health endpoint responds

## Stop and clean up

```bash
docker compose \
  --env-file infra/test-stack/.env \
  -f infra/test-stack/docker-compose.yml \
  down --remove-orphans
```

To also remove local test data volumes/directories managed by Compose mounts:

```bash
rm -rf infra/test-stack/data
```

## Notes / limitations (initial scaffold)

- No GPU devices are requested by default (cross-platform baseline).
- `OPERATOR_NPUB` is required by `divico-dvm`; set it in `.env` for your operator key.
- Relay image is a simple local relay for integration/dev smoke coverage, not production hardening.
- This stack intentionally focuses on pragmatic smoke coverage and maintainability over full e2e fidelity.
