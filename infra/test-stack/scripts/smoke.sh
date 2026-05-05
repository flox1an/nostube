#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WAIT_SCRIPT="$SCRIPT_DIR/wait-for-http.sh"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-180}"

require_body_match() {
  url="$1"
  pattern="$2"
  desc="$3"

  body="$(curl -fsSL "$url")"
  if ! printf '%s' "$body" | grep -Fq "$pattern"; then
    echo "[smoke] FAIL: $desc (pattern not found: $pattern)" >&2
    exit 1
  fi

  echo "[smoke] PASS: $desc"
}

echo "[smoke] waiting for service endpoints"
"$WAIT_SCRIPT" "${NOSTUBE_URL}/health" "$WAIT_TIMEOUT_SECONDS" '^200$'
"$WAIT_SCRIPT" "${ALMOND_URL}/_stats" "$WAIT_TIMEOUT_SECONDS" '^200$'
"$WAIT_SCRIPT" "${DIVICO_URL}/" "$WAIT_TIMEOUT_SECONDS" '^200$'
"$WAIT_SCRIPT" "${IMAGE_RESIZER_URL}/health" "$WAIT_TIMEOUT_SECONDS" '^200$'
"$WAIT_SCRIPT" "${RELAY_URL}/" "$WAIT_TIMEOUT_SECONDS" '^(101|200|204|400|404|426)$'

echo "[smoke] validating nostube runtime env"
require_body_match "${NOSTUBE_URL}/runtime-env.js" "${EXPECTED_RUNTIME_RELAYS}" "runtime relays are injected"
require_body_match "${NOSTUBE_URL}/runtime-env.js" "${EXPECTED_RUNTIME_BLOSSOM_SERVERS}" "runtime blossom servers are injected"

echo "[smoke] validating almond stats response"
require_body_match "${ALMOND_URL}/_stats" "{" "almond stats endpoint returned JSON"

echo "[smoke] validating image resizer health"
require_body_match "${IMAGE_RESIZER_URL}/health" "OK" "image resizer is healthy"

echo "[smoke] all checks passed"
