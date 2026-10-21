# HTTPS and networks

An instance always has an HTTPS origin: the relay is `wss://`, and browsers require HTTPS for logins
and signing. The **TLS mode** decides where HTTPS comes from. It is chosen on the first start and
stored in `[tls]` of `config.toml`; Studio shows it but cannot change it.

| Mode | HTTPS from | Listens on | Use it for |
| --- | --- | --- | --- |
| `proxy` | A reverse proxy in front (Caddy, nginx, Traefik, Coolify) | Plain HTTP, port 8080 | A server with a public DNS name. The container image uses this mode |
| `local-ca` | The instance's own certificate authority | HTTPS on 443, CA onboarding on 80 | A Mac on a home network, also without internet |

The first start picks `proxy` when an origin is given (`--origin` / `NOSTUBE_ORIGIN`) and `local-ca`
otherwise; `--tls` / `NOSTUBE_TLS` sets it explicitly. Background: [ADR 0003](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0003-tls-modes-and-canonical-origin.md).

## Canonical origin

Each instance has exactly one **canonical origin**, `https://host[:port]` without a path. It goes into
the public config, links, the setup link and, when publicly reachable, into URLs inside published
Nostr events. Other names the instance answers to are aliases.

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

| Setting | Default | Notes |
| --- | --- | --- |
| `https_port` / `--port` | 443 | The HTTPS listener |
| `http_port` / `--http-port` | 80 | CA onboarding; everything else redirects to HTTPS. `0` disables it. If the port cannot be opened, the instance logs a warning and starts anyway |

The two ports must differ. `--port` and `--http-port` override the stored ports for one run.

### Trusting the CA: `/ca`

Each viewer device trusts the CA once. On port 80 the instance serves:

| Path | Content |
| --- | --- |
| `http://<host>.local/ca` | Instructions for macOS, iPhone/iPad, Android, Windows and Linux, plus the CA's SHA-256 fingerprint |
| `/ca.pem` | The CA certificate (`nostube-ca.crt`) |
| `/ca.mobileconfig` | An iOS/iPadOS configuration profile |

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
`wss://purplepag.es` and `wss://index.hzrd149.com`, on the visitor's NIP-65 write relays, on the instance
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
traffic. On the site and video page only `wss://purplepag.es` and `wss://index.hzrd149.com` may be
external sockets, and every public `REQ` must filter only kinds 0/10002 for exactly the seeded visitor's
key. It also requires both public sockets and the visitor lookups to be observed, so it needs
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
