#!/bin/sh
# Runs dnsmasq and the FIPS daemon side by side until docker stop.
#
# A daemon that dies is restarted inside this container instead of ending it: a restarted
# container gets a fresh network namespace, and Nostube (network_mode: service:fips) would stay
# behind in the old one until the whole stack is recreated.
# ponytail: fixed 2 s respawn, no backoff; the healthcheck turns unhealthy while one crash-loops.
set -eu

config="$FIPS_CONFIG"
dir="$(dirname "$config")"
if [ ! -r "$config" ]; then
  echo "no FIPS config at $config: copy docker/fips/fips.yaml into the mounted directory" >&2
  exit 1
fi
# The image's alias roster, unless the operator's directory already has a hosts file.
[ -e "$dir/hosts" ] || cp /usr/share/fips/hosts "$dir/hosts"
mkdir -p /run/fips

keep() {
  trap 'exit 0' TERM INT # let the daemon finish its own shutdown first
  while :; do
    "$@" || true
    echo "$1 exited, restarting in 2 s" >&2
    sleep 2
  done
}

# docker stop: SIGTERM to every process of this script's group (loops and daemons), then wait.
trap 'trap "" TERM INT; kill -TERM 0; wait; exit 0' TERM INT
keep dnsmasq --keep-in-foreground --conf-file=/etc/dnsmasq.conf &
keep fips -c "$config" &
wait
