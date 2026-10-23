# syntax=docker/dockerfile:1
#
# FIPS sidecar for Nostube Server (docker-compose.fips.yml): the official FIPS release binaries
# plus dnsmasq. The container owns the network namespace Nostube joins: TUN fips0 for the mesh,
# and DNS on 127.0.0.1:53 (.fips to the FIPS responder, everything else to Docker DNS).
#
#   docker build -t nostube-fips apps/server/docker/fips
#
# Upgrading FIPS: change FIPS_VERSION and both checksums (checksums-linux.txt of the release).

FROM debian:bookworm-slim AS download
ARG FIPS_VERSION=0.5.3
ARG FIPS_SHA256_AMD64=fd22c75ab4a7a4334dfe9a0a5535fabdf6cfffcbecdcd795ea16ea44f25d6970
ARG FIPS_SHA256_ARM64=81514d916ce07c7a52bbaeac0ac5a6ee0d9c7931bca0c8cba37681b9723ea4f5
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x86_64; sum="$FIPS_SHA256_AMD64" ;; \
      arm64) arch=aarch64; sum="$FIPS_SHA256_ARM64" ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/fips.tar.gz \
      "https://github.com/jmcorgan/fips/releases/download/v${FIPS_VERSION}/fips-${FIPS_VERSION}-linux-${arch}.tar.gz"; \
    echo "$sum  /tmp/fips.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/fips.tar.gz -C /tmp; \
    mv "/tmp/fips-${FIPS_VERSION}-linux-${arch}" /tmp/fips

FROM debian:bookworm-slim
# libdbus: the release binary links it (BLE support), even with BLE off.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates dnsmasq-base iproute2 libdbus-1-3 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /etc/fips /run/fips /usr/share/fips \
 && printf '%s\n' \
      'port=53' \
      'listen-address=127.0.0.1' \
      'bind-interfaces' \
      'no-resolv' \
      'no-hosts' \
      'server=/fips/127.0.0.1#5354' \
      'server=127.0.0.11' \
      'user=nobody' \
      'log-facility=-' \
      > /etc/dnsmasq.conf
COPY --from=download /tmp/fips/fips /tmp/fips/fipsctl /tmp/fips/fipstop /usr/local/bin/
# The public test mesh roster; copied to /etc/fips/hosts on start when the mounted directory has none.
COPY --from=download /tmp/fips/hosts /usr/share/fips/hosts
COPY --chmod=0755 entrypoint.sh /usr/local/bin/fips-entrypoint.sh

# The config the operator mounts (with fips.key/fips.pub/hosts next to it, in the same directory).
ENV FIPS_CONFIG=/etc/fips/fips.yaml
EXPOSE 2121/udp
# Ready = control socket answers, fips0 has its mesh address, and the node's own name resolves
# through dnsmasq and the FIPS responder (the path Nostube's lookups take).
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD fipsctl show status >/dev/null \
   && ip -6 addr show dev fips0 | grep -q 'inet6 fd' \
   && getent ahostsv6 "$(cat "$(dirname "$FIPS_CONFIG")/fips.pub").fips" >/dev/null \
   || exit 1
ENTRYPOINT ["fips-entrypoint.sh"]
