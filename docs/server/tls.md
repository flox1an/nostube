# HTTPS and networks

The standard internet deployment uses an HTTPS origin and a `wss://` relay. The
[FIPS deployment](#fips-mesh-with-docker-compose) instead uses an explicit HTTP origin and `ws://`,
without a public domain or certificates. The **TLS mode** controls the listener; it is chosen on
the first start and stored in `[tls]` of `config.toml`.

| Mode       | HTTPS from                                                | Listens on                        | Use it for                                                          |
| ---------- | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `proxy`    | A reverse proxy in front (Caddy, nginx, Traefik, Coolify) | Plain HTTP, port 8080             | A server with a public DNS name. The container image uses this mode |
| `local-ca` | The instance's own certificate authority                  | HTTPS on 443, CA onboarding on 80 | A Mac on a home network, also without internet                      |

The first start picks `proxy` when an origin is given (`--origin` / `NOSTUBE_ORIGIN`) and `local-ca`
otherwise; `--tls` / `NOSTUBE_TLS` sets it explicitly. Background: [ADR 0003](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0003-tls-modes-and-canonical-origin.md).

## Canonical origin

Each instance has exactly one **canonical origin**, `http://host[:port]` or `https://host[:port]`
without a path. It goes into the public config, links, the setup link and, when publicly reachable,
into URLs inside published Nostr events. Other names the instance answers to are aliases.

The origin is set on the first start and is not editable in Studio. A different `--origin` on a later
start is ignored with a warning. URLs already published in events keep the old origin, so changing it
is a hostname transition, not a setting.

An origin counts as **publicly reachable** when the instance is not in local-ca mode and the host is a
public DNS name: not an IP address, not a single-label name, not ending in `.local` or `.localhost`.
This decides what [Public reach](/server/studio#reach) requires.

## Proxy mode

The server speaks plain HTTP on `port` (default 8080) and reads no `X-Forwarded-*` headers: the origin
comes from the config. The binary binds `127.0.0.1` by default in this mode; the container image binds
`0.0.0.0` because only the Compose network reaches it. A working setup with Caddy is in
[Getting started](/server/#quick-start-with-docker-compose-and-caddy).

The name `proxy` describes the existing plain-HTTP listener mode: a reverse proxy is not required
when the canonical origin explicitly uses `http://`, as in the FIPS setup below.

Rules for the proxy:

- **Pass `Host` on unchanged.** Caddy and Traefik do; nginx needs `proxy_set_header Host $host`. The
  admin login with a Nostr key checks the host.
- **Pass WebSockets.** The relay is `wss://<origin>/` on the same address.
- **No small upload limits.** A single file can be up to 4 GiB. Studio sends files larger than 8 MiB
  in 8 MiB pieces, but other Blossom clients may send a whole file in one request. nginx defaults to
  1 MB (`client_max_body_size`); Cloudflare's free plan stops at 100 MB per request.
- **Let the server's `Cache-Control` decide.** The Studio and site shells, `/api/config`,
  `/api/health`, `/admin` and `/api/admin/*` must not be cached (admin answers are
  `private, no-store`); hashed assets under `/assets/` may be cached for a year. A Cloudflare rule that
  caches everything (a Cache Rule with an Edge TTL override, or the "Cache Everything" page rule)
  ignores these headers: it serves an old Studio for days after an update, old site settings after every
  save, and one logged-in session's admin answers (config, stats, signer) to anyone who asks. Exclude
  the instance's host from such rules.
- **Do not publish the instance's own port to the internet.** It speaks plain HTTP, including the admin
  login. In Compose, give only the proxy `ports:`.
- **Rate-limit the admin login** in the proxy if the admin address is public. The built-in throttle is
  per instance, see [Login protection](/server/studio#login-protection).

There is no built-in ACME client and no `trusted_proxies` setting; the proxy owns the certificate.

## FIPS mesh with Docker Compose

`apps/server/docker-compose.fips.yml` runs **Nostube and a FIPS sidecar only**. There is no Caddy,
Coolify domain, ACME or certificate setup. The instance is served at
`http://<this-npub>.fips`; its relay is `ws://<this-npub>.fips/` (port 80).
The host publishes only `2121/udp` for FIPS transport, not the HTTP port.

Only the FIPS container gets `NET_ADMIN` and `/dev/net/tun`. Nostube shares its network namespace,
but not its files or identity key. The server runs as uid 10001 without effective capabilities.
Both containers use the sidecar's loopback DNS: `.fips` queries go to FIPS, other queries to
Docker's resolver. Mesh routes and ordinary outgoing internet routes coexist; this is FIPS-only
**hosting**, not an egress firewall or a claim that the application can never contact the internet.

The FIPS Compose file explicitly sets `NOSTUBE_PORT=80`. Its shared network namespace allows
unprivileged port binding, so the server remains uid 10001 without effective capabilities or
`NET_BIND_SERVICE`. The standard server image and non-FIPS deployment keep their port-8080 default.

### Start

Requirements: a Linux Docker engine with `/dev/net/tun`, Docker Compose, IPv6 support in the
container network namespace, outbound DNS/WebSocket access to the Nostr discovery relays and
a usable FIPS transport path. Docker Desktop/OrbStack must provide TUN inside their Linux VM.
A provider that denies devices or `NET_ADMIN` cannot run this sidecar. No public DNS name or
ports 80/443 are needed. The sample discovers peers through Nostr; static seeds are optional.

From a checkout of the repository, prepare the configuration and a persistent mesh identity:

```sh
cd apps/server
mkdir -p fips
cp docker/fips/fips.yaml fips/fips.yaml
# Optional: edit fips/fips.yaml for your own relays, static peers or transport settings.
docker build -t nostube-fips docker/fips
# Generate the identity once; never overwrite an existing node key.
docker run --rm -v "$PWD/fips:/etc/fips" --entrypoint fipsctl \
  nostube-fips keygen --dir /etc/fips
export NOSTUBE_ORIGIN="http://$(cat fips/fips.pub).fips"
docker compose -f docker-compose.fips.yml up -d --build
docker compose -f docker-compose.fips.yml exec fips fipsctl show status
docker compose -f docker-compose.fips.yml exec fips fipsctl show peers
```

The Compose file builds the standard server Dockerfile from this checkout so HTTP-origin support
and the bundled site/Studio agree. It does not combine the application with FIPS in one image.
The sidecar downloads checksum-pinned FIPS release binaries. The same server Dockerfile supports
the separate HTTPS deployment; no FIPS-specific application image recipe is needed.

The sidecar packages **unmodified FIPS 0.5.3 release binaries**, plus `dnsmasq`, the loopback DNS
forwarding rules and namespace-preserving process supervision. Ports, peering and discovery remain
runtime configuration, not a FIPS fork. Upstream's
[v0.5.3 Compose example](https://github.com/jmcorgan/fips/blob/v0.5.3/examples/sidecar-nostr-relay/docker-compose.yml)
builds its sidecar locally; the [release](https://github.com/jmcorgan/fips/releases/tag/v0.5.3)
publishes binaries/packages, with no official versioned registry image documented. We therefore
keep this small wrapper rather than pulling an unverified third-party image.

For later starts, skip `cp` and `keygen`, export the same origin, and run `docker compose ... up -d`.
Persist `NOSTUBE_ORIGIN` in the deployment's environment or an uncommitted `.env`; do not substitute
a temporary origin for the first start. As elsewhere, an existing `data/config.toml` keeps its
canonical origin even if the environment changes.

For an instance created with the earlier `:8080` mesh origin, stop the stack and back up
`data/config.toml`. Remove `:8080` from `origin` and the instance's own `video_sources` /
`interaction_relays`, set `[tls].port = 80`, and increment `revision` before starting again.
Changing only the environment would leave the old advertised origin in place. Already signed
events keep their old URLs; changing ports on an established published instance is a URL transition.

Keep `fips/` across deployments and back it up separately from `data/`. `fips.key` is the secret
node identity; losing it changes the npub and mesh address. Never reuse the creator's signing key.
Only the sidecar mounts `fips/`; only Nostube mounts `data/`. Both directories are ignored by Git
and excluded from server image builds. Optional `.fips` aliases belong in `fips/hosts`.

### Automatic bootstrap and reachability

The sample enables FIPS's native Nostr rendezvous:

```yaml
node:
  rendezvous:
    nostr:
      enabled: true
      policy: open
      advertise: true
transports:
  udp:
    advertise_on_nostr: true
    public: false
```

These keys belong inside the existing `node` and `transports.udp` sections, not duplicate
top-level sections. Existing configuration files are **not overwritten** by the Run script:
if you copied the earlier sample with `peers: []` and no rendezvous block, enable discovery
there explicitly. With neither static peers nor discovery, FIPS starts as an isolated node.

`enabled` activates the Nostr rendezvous runtime; `policy: open` discovers candidates from signed
kind 37195 adverts in the default `fips-overlay-v1` namespace, without a seed list. Defaults use
`wss://relay.damus.io`, `wss://nos.lol` and `wss://offchain.pub`. `connect_policy: auto_connect`
on an explicit peer only means “dial this peer”; it does not discover arbitrary peers.
The image's `hosts` file supplies DNS aliases, not bootstrap connections.

Discovery and advertising contact public Nostr relays. UDP NAT traversal also uses FIPS's default
STUN servers. The node publishes its mesh identity and transport/signaling information; do not
interpret FIPS-only hosting as “no public-internet traffic.” Discovery can take a minute or two,
and stale adverts or incompatible peers can fail while other links work.

The UDP `public: false` setting advertises `udp:nat`, rather than guessing that the Docker
container's listener is publicly reachable. It does **not** make the service private in FIPS.
NAT hole punching is best effort. On a public server or with an actual router port-forward, use
`public: true` and, when needed, `external_addr: "<public-ip>:<public-port>"` instead.
STUN alone does not prove an inbound listener is reachable. An existing outbound peer link is
already bidirectional and can carry incoming mesh HTTP/WebSocket traffic through the mesh.

The startup log's `connections: 0` is an initial snapshot, not a later connectivity verdict.
`fipsctl show connections` lists pending handshakes; inspect authenticated links with
`fipsctl show peers` and look for `connectivity: "connected"`. The sidecar health check verifies
the daemon, interface and DNS, **not** a working connection to the public mesh.

See upstream [open discovery](https://github.com/jmcorgan/fips/blob/v0.5.3/docs/tutorials/open-discovery.md)
and [Nostr rendezvous/NAT traversal](https://github.com/jmcorgan/fips/blob/v0.5.3/docs/how-to/enable-nostr-discovery.md).

### Outgoing Nostr and Blossom connections

Server-side clients can use `ws://<remote-npub>.fips:<port>/` relays and
`http://<remote-npub>.fips:<port>/<hash>` Blossom endpoints directly. Normal DNS and internet
routes remain available. Resolve `.fips` through this sidecar rather than copying a bare IPv6
address: the DNS lookup also supplies the public-key mapping needed to route the connection.

Check from the unprivileged **Nostube container**, substituting a real peer and port:

```sh
docker compose -f docker-compose.fips.yml exec --user 10001 nostube \
  getent ahosts <remote-npub>.fips
docker compose -f docker-compose.fips.yml exec --user 10001 nostube \
  curl --noproxy '*' -fsS -H 'Accept: application/nostr+json' \
  http://<remote-npub>.fips:<port>/
docker compose -f docker-compose.fips.yml exec --user 10001 nostube \
  getent ahosts example.org
```

Mesh endpoints are publicly reachable **within FIPS**, not from the ordinary internet.
This setup does not change Reach eligibility or filter `.fips` URLs out of publication.
Clients consuming announced mesh URLs need their own FIPS DNS and routing. A server-side mirror
does not proxy a visitor's browser connections.

### HTTP and browser limitations

FIPS encrypts the mesh transport, but an `http://` page is not a browser secure context.
Nostr extensions, Web Crypto, service workers and other browser capabilities can be unavailable.
An HTTPS page also cannot generally fetch HTTP media or open an insecure mesh WebSocket.
This initial deployment deliberately does not solve those browser restrictions with TLS.

Upload, draft and transcode-job identifiers use cryptographic `crypto.getRandomValues()` when
`crypto.randomUUID()` is unavailable on HTTP. This does not enable other secure-context APIs or
override an extension's HTTP-origin restrictions.

Nostr Connect / remote signing does work over HTTP without a browser extension. Under
**Server → Advanced → Additional signer relays**, keep a public relay shared with the signer phone
(defaults: `wss://nos.lol`, `wss://relay.damus.io`). The browser includes those in its pairing link
and permits their replies through the instance relay allowlist. The phone need not join FIPS to
sign; only the browser needs access to the mesh instance. This does not make mesh videos reachable
outside FIPS or turn on public content publication.

The built-in instance relay rejects NIP-46 messages from fresh client keys; its writer ACL is
unchanged. Removing all additional signer relays does not by itself enable mesh-only pairing.
Use an appropriate NIP-46 rendezvous relay. See [Remote signer relays](/server/studio#remote-signer-relays).

Password sessions on an explicitly HTTP canonical origin omit the cookie's `Secure` attribute;
HTTPS origins retain it. Authentication, HttpOnly and SameSite protections remain enabled.
Keep this HTTP listener inside the mesh: do not publish port 80 on a public host or use it over
untrusted unencrypted networks. Mesh peers can reach the admin routes too; FIPS membership is
not admin authorization.

### Restarting and upgrading

FIPS owns the shared network namespace. App-only restarts (including Studio saves) are supported.
The sidecar restarts a failed FIPS or DNS daemon internally without replacing the namespace.
A container-level restart/replacement still needs coordinated recovery of the whole stack:

```sh
docker compose -f docker-compose.fips.yml down
docker compose -f docker-compose.fips.yml build --pull
docker compose -f docker-compose.fips.yml up -d
```

Keep the data directories. Readiness checks gate the initial app start; they are not a runtime
recovery controller. Compose's `depends_on.restart: true` covers explicit Compose operations,
not automatic runtime restarts. Check DNS and a real mesh request after recovery, not only HTTP
health or the existence of `fips0`.

The isolated two-node smoke check exercises normal/mesh DNS from Nostube, peer HTTP and Nostr
WebSockets, unprivileged execution, identity persistence and daemon recovery. It deliberately
disables public discovery and uses explicit test peers: it does not verify public-mesh bootstrap.

```sh
node apps/server/scripts/check-fips.mjs
```

It uses temporary data and removes its containers afterwards. Upstream references:
[sidecar example](https://github.com/jmcorgan/fips/tree/v0.5.3/examples/sidecar-nostr-relay),
[persistent identity](https://github.com/jmcorgan/fips/blob/v0.5.3/docs/how-to/persistent-identity.md).

[`pandacode-run.sh`](https://github.com/flox1an/nostube/blob/main/pandacode-run.sh), run from the
repository root, now starts a real mesh node. It creates `apps/server/fips/fips.yaml` only when
missing, generates the mesh identity only once, derives the canonical `.fips` origin from that
identity, and preserves `apps/server/fips/` and `apps/server/data/` on stop. Override `FIPS_DIR`
and `NOSTUBE_DATA_DIR` to use other state directories.

The Run script additionally maps `http://localhost:18080` to the HTTP listener for local viewing;
this is not the canonical origin and does not provide the host browser with mesh DNS/routing.
UDP port 2121 is published on the host interfaces, not loopback only. `FIPS_UDP_PORT` and
`NOSTUBE_PREVIEW_PORT` can select other host ports. The loopback HTTP mapping is not part of the
production FIPS Compose file. The mesh HTTP service remains on port 80.

An already-running Run stack is left alone rather than replaced by another invocation.
The original Run script used temporary directories and deleted them on stop: back up that old
instance before stopping it if it contains anything you need. The new script does not migrate a
running temporary instance or rewrite an existing instance's canonical origin.

## local-ca mode

The instance runs its own **instance CA** and serves HTTPS itself. Nothing needs the internet, which
makes this the mode for a fully offline instance on a home network.

::: warning macOS only
local-ca reads the host's name with `scutil --get LocalHostName`, so it currently runs only on macOS.
Use proxy mode on Linux and in Docker.
:::

Start the binary without an origin:

```sh
./apps/server/target/release/nostube-server --data ~/nostube-data
```

On the first start the instance:

- sets the origin to `https://<LocalHostName>.local` (with the port appended when it is not 443),
- creates a CA in `<data>/tls/` (`ca.pem`, `ca-key.pem`; valid 10 years, never regenerated while
  `ca.pem` exists),
- issues a server certificate (`leaf.pem`, 1 year) for the `.local` name, the optional router name and
  the host's private LAN IP addresses,
- listens for HTTPS on `0.0.0.0:443` and for CA onboarding on port 80.

Every 10 minutes the instance re-detects its names and LAN IPs. It renews the certificate at two
thirds of its lifetime or when a name or IP changes, without a restart and without internet access.

The CA is name-constrained: it can only vouch for names ending in `.local`, `.home.arpa` or `.lan`
and for private IP addresses (10/8, 172.16/12, 192.168/16, fd00::/8), never for public websites.

### Ports

| Setting                     | Default | Notes                                                                                                                                           |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `https_port` / `--port`     | 443     | The HTTPS listener                                                                                                                              |
| `http_port` / `--http-port` | 80      | CA onboarding; everything else redirects to HTTPS. `0` disables it. If the port cannot be opened, the instance logs a warning and starts anyway |

The two ports must differ. `--port` and `--http-port` override the stored ports for one run.

### Trusting the CA: `/ca`

Each viewer device trusts the CA once. On port 80 the instance serves:

| Path                     | Content                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `http://<host>.local/ca` | Instructions for macOS, iPhone/iPad, Android, Windows and Linux, plus the CA's SHA-256 fingerprint |
| `/ca.pem`                | The CA certificate (`nostube-ca.crt`)                                                              |
| `/ca.mobileconfig`       | An iOS/iPadOS configuration profile                                                                |

Compare the fingerprint with the one the device shows. In Studio, **Server → Account → This device**
links to the CA download as well. Platform notes from the onboarding page:

- iPhone/iPad: after installing the profile, turn on full trust under Settings → General → About →
  Certificate Trust Settings.
- Android: needs Android 12 or later for `.local` names, and not while a VPN is on.
- Linux: Firefox does not use the system store and needs a manual import; `.local` names need avahi
  with nss-mdns, otherwise use the IP address.
- Chrome and Firefox on macOS 15 or later need permission under System Settings → Privacy & Security →
  Local Network.

### Names and aliases

The certificate covers the `.local` name, an optional router name and the LAN IP addresses; the
instance answers on all of them. The canonical origin must be one of these names, otherwise the start
fails with a message listing them. The instance runs no mDNS responder of its own; it uses the name
macOS already announces.

**Router name.** If your router can hand out DNS names, set one in `config.toml` and restart:

```toml
[tls]
mode = "local-ca"
router_name = "videos.lan"
https_port = 443
http_port = 80
```

Use a name ending in `.lan` or `.home.arpa`, the only DNS names besides `.local` the CA may vouch for.
`.local` and IP aliases are single host names, so URLs on them cannot use subdomains.

### Public reach from a LAN instance

A local-ca origin is never publicly reachable, so it never appears in public event URLs or relay
lists. Such an instance can still use [Public reach](/server/studio#reach) when at least one public
mirror relay and one public mirror Blossom server are configured: the mirrors carry everything public.

## What the instance contacts on the internet

In **private** reach, the video catalog, creator metadata, the embed player and interaction publishing
stay on the instance relay. In **public** reach they use the configured public relays and mirrors.

One exception applies in both reaches: when a visitor signs in on the site, their own name and avatar
(kinds 0 and 10002 of that visitor only) are looked up on the mandatory public indexers
`wss://purplepag.es`, `wss://nos.lol` and `wss://relay.damus.io`, on the visitor's NIP-65 write relays, on the instance
relays and on any extra profile relays configured in Studio ([ADR 0008](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0008-local-profile.md)).
`profile_relays = []` means no extra relays, not an opt-out of the public lookup. Those relays learn
the visitor's IP address and public key, and a public avatar URL can contact its host. An instance with
signed-in visitors therefore cannot promise zero internet traffic.

The outbox only contacts mirror targets you configure; there are no default mirror servers.

### Checking the boundary

`apps/server/scripts/check-local-profile.mjs` checks this boundary on macOS. It starts a throwaway
private-reach instance with `profile_relays = []` and a throwaway local CA, seeds a creator's video,
profile, thumbnail and media on its own relay and Blossom only, and opens the signed-in site, a video
page and the embed in separate headless Brave targets (`--browser` selects another Chromium).

The check fails (exit 1) on unexpected hosts, external HTTP, public video queries or any external embed
traffic. On the site and video page only `wss://purplepag.es`, `wss://nos.lol` and `wss://relay.damus.io` may be
external sockets, and every public `REQ` must filter only kinds 0/10002 for exactly the seeded visitor's
key. It also requires every public socket and the visitor lookups to be observed, so it needs
public-relay connectivity and may need a longer `--wait` on a slow connection. It does not cover public
reach through mirrors or nsite hosting.

Prerequisites: installed workspace dependencies, macOS `scutil`/mDNS, Brave or another Chromium, and
freshly built web assets and server.

```sh
scripts/build-server-web.sh && cargo build --manifest-path apps/server/Cargo.toml
node apps/server/scripts/check-local-profile.mjs
node apps/server/scripts/check-local-profile.mjs --default-profile-relays
```

`--default-profile-relays` compares an omitted `profile_relays` with the explicit empty list; both must
keep the public visitor lookup. `--serve` only seeds and keeps the instance running for manual
inspection.
