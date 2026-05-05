#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <url> [timeout_seconds] [accepted_status_regex]" >&2
  exit 2
fi

URL="$1"
TIMEOUT="${2:-120}"
STATUS_REGEX="${3:-^(2|3)[0-9][0-9]$}"

START_TS="$(date +%s)"

while :; do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$URL" || true)"
  if printf '%s' "$CODE" | grep -Eq "$STATUS_REGEX"; then
    echo "[wait-for-http] $URL is ready (HTTP $CODE)"
    exit 0
  fi

  NOW_TS="$(date +%s)"
  ELAPSED=$((NOW_TS - START_TS))
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "[wait-for-http] timeout after ${TIMEOUT}s waiting for $URL (last code: ${CODE:-n/a})" >&2
    exit 1
  fi

  echo "[wait-for-http] waiting for $URL (last code: ${CODE:-n/a}, elapsed ${ELAPSED}s)"
  sleep 2
done
