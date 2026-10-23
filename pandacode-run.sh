#!/bin/sh
# pandacode-preview: http://localhost:18080
# Real FIPS node with persistent state; loopback HTTP is only an additional local view.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=${COMPOSE_PROJECT_NAME:-nostube-fips-preview}
base="$root/apps/server/docker-compose.fips.yml"
if [ -n "$(docker compose -p "$project" -f "$base" ps -q)" ]; then
  printf '%s\n' "The $project stack is already running. Stop its Run terminal before starting another one." >&2
  printf '%s\n' 'The old temporary preview deletes its state on stop; back it up first if needed.' >&2
  exit 1
fi
export FIPS_DIR=${FIPS_DIR:-$root/apps/server/fips}
export NOSTUBE_DATA_DIR=${NOSTUBE_DATA_DIR:-$root/apps/server/data}
mkdir -p "$FIPS_DIR" "$NOSTUBE_DATA_DIR"
FIPS_DIR=$(CDPATH= cd -- "$FIPS_DIR" && pwd)
NOSTUBE_DATA_DIR=$(CDPATH= cd -- "$NOSTUBE_DATA_DIR" && pwd)
if [ ! -f "$FIPS_DIR/fips.yaml" ]; then
  cp "$root/apps/server/docker/fips/fips.yaml" "$FIPS_DIR/fips.yaml"
fi
docker compose -p "$project" -f "$base" build fips
if [ ! -f "$FIPS_DIR/fips.key" ]; then
  docker run --rm -v "$FIPS_DIR:/etc/fips" --entrypoint fipsctl nostube-fips keygen --dir /etc/fips
fi
npub=$(cat "$FIPS_DIR/fips.pub")
export NOSTUBE_ORIGIN=${NOSTUBE_ORIGIN:-http://$npub.fips}
state=$(mktemp -d "${TMPDIR:-/tmp}/nostube-fips-run.XXXXXX")
cat > "$state/preview.yml" <<EOF
services:
  fips:
    ports: !override
      - '${FIPS_UDP_PORT:-2121}:2121/udp'
      - '127.0.0.1:${NOSTUBE_PREVIEW_PORT:-18080}:80'
EOF
compose() {
  docker compose -p "$project" -f "$base" -f "$state/preview.yml" "$@"
}
cleanup() {
  compose down
  rm -rf "$state"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "FIPS mesh origin: $NOSTUBE_ORIGIN"
printf '%s\n' "Local view: http://localhost:${NOSTUBE_PREVIEW_PORT:-18080} (browser mesh access still needs local FIPS)."
printf '%s\n' "Persistent FIPS identity/config: $FIPS_DIR; instance data: $NOSTUBE_DATA_DIR"
printf '%s\n' 'Open discovery uses public Nostr relays; allow time for authenticated mesh peers to connect.'
compose up --build --abort-on-container-failure
