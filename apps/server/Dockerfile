# syntax=docker/dockerfile:1
#
# Nostube Server: one image with everything built inside it (site, studio, embed player, and
# the Rust binary that embeds them). The build context is the repository root:
#
#   docker build -f apps/server/Dockerfile -t nostube-server .
#
# The image serves plain HTTP on 8080: put a TLS-terminating reverse proxy in front of it
# (docs/deploy.md). Everything the instance stores lives in the volume at /data.

# 1. The web assets: site, studio and embed player (scripts/build-server-web.sh).
FROM node:24-bookworm-slim AS web
WORKDIR /app
# Every workspace manifest has to be here before `npm ci` (npm workspaces, one lockfile).
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/site/package.json apps/site/
COPY apps/studio/package.json apps/studio/
COPY packages/core/package.json packages/core/
COPY packages/widgets/package.json packages/widgets/
RUN npm ci --ignore-scripts
COPY packages packages
COPY apps/web apps/web
COPY apps/site apps/site
COPY apps/studio apps/studio
COPY scripts scripts
RUN scripts/build-server-web.sh

# 2. The server binary, with the web assets embedded at compile time (RustEmbed).
FROM rust:1-bookworm AS server
WORKDIR /src
COPY apps/server/Cargo.toml apps/server/Cargo.lock ./
# The dependencies first, so a source change does not rebuild them.
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
 && cargo build --release --locked \
 && rm -rf src target/release/nostube-server target/release/deps/nostube_server*
COPY apps/server/src src
COPY --from=web /app/apps/server/web web
RUN cargo build --release --locked

# 3. The runtime image.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin nostube \
 && mkdir /data && chown nostube:nostube /data
COPY --from=server /src/target/release/nostube-server /usr/local/bin/nostube-server
COPY apps/server/docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Behind a proxy, on plain HTTP. The only thing the first start needs is NOSTUBE_ORIGIN, the public
# address (https://videos.example.org); after that the config lives in /data/config.toml.
ENV NOSTUBE_DATA=/data \
    NOSTUBE_TLS=proxy \
    NOSTUBE_BIND=0.0.0.0 \
    NOSTUBE_PORT=8080
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${NOSTUBE_PORT}/api/health" || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["nostube-server"]
