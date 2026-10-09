#!/bin/sh
# Takes over the data volume, then runs the command as the unprivileged `nostube` user. The
# server ends up as PID 1 and handles SIGTERM itself (docker stop).
set -e

if [ "$(id -u)" = "0" ]; then
  data="${NOSTUBE_DATA:-/data}"
  mkdir -p "$data"
  # A fresh bind mount belongs to root; hand it over once (later starts find the owner right).
  if [ "$(stat -c %u "$data")" != "10001" ]; then
    chown -R nostube:nostube "$data"
  fi
  exec setpriv --reuid=10001 --regid=10001 --clear-groups "$@"
fi

exec "$@"
