#!/usr/bin/env bash
# Builds the web assets that nostube-server embeds (RustEmbed folder apps/server/web/dist):
# the site (index.html + assets/) plus the embed player (embed.html and any worker/chunk
# files next to it). Run from anywhere; run it before `cargo build` / `cargo check`.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/apps/server/web/dist"
embed_tmp="$(mktemp -d)"
trap 'rm -rf "$embed_tmp"' EXIT

cd "$root"
npm run build --workspace @nostube/site
(cd apps/web && npx vite build --config vite.embed.config.ts --outDir "$embed_tmp" --emptyOutDir)

rm -rf "$out"
mkdir -p "$out"
cp -R apps/site/dist/. "$out/"
cp -R "$embed_tmp/." "$out/"
test -f "$out/index.html" && test -f "$out/embed.html"
echo "server web assets ready: $out"
