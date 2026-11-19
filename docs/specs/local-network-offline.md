# Nostube on a local network and without internet

As of 19 November 2026. Analysis and implementation plan, **not approved for implementation**. Basis: issue [#180](https://github.com/flox1an/nostube/issues/180) (Yggdrasil, local Blossom server, "nostube does not load index page in the isolated local network"), code and documentation analysis. Statements about the code cite a file/symbol; behaviour in the browser is marked as an observation.

Applies to both products:

- `apps/web`: the public nostu.be client (static Vite bundle, its own Docker image).
- `apps/server`: site, studio, relay, Blossom, embed (one Rust process that embeds the site and the embed player).

This is not about an offline copy of the public platform (downloading every video beforehand). It is about **using an instance on a LAN, on Yggdrasil, or with no WAN at all**.

## 1. Goal

Without public DNS, without public certificates and without a WAN, an operator should be able to:

1. start the instance,
2. open the site, the studio and the embed player on the LAN,
3. use videos, profiles, images and uploads on the local relay/Blossom,
4. manage and publish in the studio,
5. and know which connections the instance still opens to the outside.

The web app (nostu.be) is **not** the LAN product. It is a client for the public Nostr network; a LAN setup with it only makes sense with an explicitly built "local" bundle (section 8, decision 1).

### Non-goals

- No DRM, no protection against sharing.
- No change to the security defaults of the public build: private IP addresses in event URLs stay blocked there (section 5, B4).
- No automatic download of the whole network.
- No replacement for backups.

## 2. Terms

| Term                 | Meaning                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LAN**              | A network without public DNS, often without a WAN: 192.168/16, 10/8, 172.16/12, ULA `fd00::/8`, Tailscale `100.64/10`, Yggdrasil `200::/7`.           |
| **Offline**          | No outbound internet access. A LAN can be offline, but does not have to be.                                                                           |
| **Private reach**    | Server setting `reach = "private"` (default): catalogue, creator metadata, embed and interactions stay on the instance.                               |
| **Instance origin**  | The canonical URL of the instance (`origin` in `config.toml`, e.g. `http://192.168.1.5:8080`). Everything the instance serves itself is trusted.      |
| **Insecure context** | A page served over `http://` on a non-loopback address. The browser then blocks, among other things, `navigator.clipboard`, service workers and OPFS. |
| **Preset gate**      | The web app's boot path, which has to load a moderation preset (kind 30078) before the app renders.                                                   |
| **Separate Blossom** | A Blossom server outside the instance. For the server it is a **mirror** (upload target), not built-in storage.                                       |

## 3. Starting point

### 3.1 Server: what works today

- **One process, no external services.** Relay, Blossom, site, studio and embed run in the same binary. The only outbound HTTP client is the **opt-in outbox mirror** (`apps/server/src/outbox.rs`; `reqwest` in `apps/server/Cargo.toml`). Without configured mirror targets there is no mirror traffic.
- **TLS modes** (`apps/server/src/tls.rs`, `docs/server/tls.md`):
  - `proxy`: TLS terminates in front of the server (Caddy, Traefik); the server speaks HTTP. Required: `NOSTUBE_ORIGIN` on first start (`apps/server/src/main.rs:230`).
  - `local-ca`: own CA, HTTPS directly; **macOS only** (`scutil`, `getifaddrs`); covers `.local`, an optional router name and private IPs (10/8, 172.16/12, 192.168/16, `fd00::/8`).
- **Private reach** is the default; in private reach `public_json` returns only the instance as video/interaction relay (`apps/server/src/config.rs`, `public_json`).
- **Existing check:** `apps/server/scripts/check-local-profile.mjs --offline` starts a throwaway instance with `local-ca`, lets the browser resolve **only** the instance name (`MAP * ~NOTFOUND`) and checks that the site, a video page and the embed render **without any external request** (`docs/server/tls.md`, "Checking the boundary"). This is the strongest offline evidence so far, but it covers macOS/`local-ca` and **signed-out** visitors only.
- **Docs:** `docs/guide/self-hosting.md` explicitly recommends the server for a LAN; `docs/server/tls.md` says: Linux/Docker → `proxy`, Yggdrasil → `proxy`; `local-ca` runs on macOS only.
- **Docker:** `apps/server/Dockerfile` sets `NOSTUBE_TLS=proxy`, `NOSTUBE_PORT=8080` and exposes 8080. Without `NOSTUBE_ORIGIN` the first start aborts with a clear message.

### 3.2 Web app: what works today

- **Instance build:** `getInstanceConfig()` (`packages/core/src/instance-config.ts`) reads `/api/config` and derives relays, Blossom servers, search and links from it. When an instance config is present, **no** presets are loaded (`PresetContext`).
- **Embed player** of the instance: same origin, same config; works offline as long as the assets are served.
- **Everything else** (public client, fresh browser profile) depends on the public network (section 4).

### 3.3 What the issue reporter probably sees

In order of likelihood, based on code and docs:

1. **Yggdrasil + `local-ca`:** the CA does not cover `200::/7` (`is_lan` only checks `v4.is_private()` and `fd00::/8`), so startup fails or the certificate does not match. The right setup is `proxy` plus an origin the browser can reach.
2. **`proxy` without `NOSTUBE_ORIGIN`:** startup aborts; the site does not load.
3. **HTTP origin + port 80 redirect:** whoever opens `http://<ip>` is redirected to the canonical origin; without mDNS that is often a `.local` name the client cannot resolve (section 5, B7).
4. **Web app instead of server:** the public client does not boot without internet (B1).

## 4. Where traffic leaves today

| Product | Path                                        | Targets                                                                                                                 | Can be switched off?                                         |
| ------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Server  | Visitor sign-in on the site (kinds 0/10002) | `wss://purplepag.es`, `wss://nos.lol`, `wss://relay.damus.io`, `profileRelays`, the visitor's NIP-65 write relays       | Only by a code decision; ADR 0012 explicitly says "no" (B10) |
| Server  | NIP-46 signer                               | `signer_relays` (default `wss://nos.lol`, `wss://relay.damus.io`)                                                       | Yes: `signer_relays = []`                                    |
| Server  | Outbox mirror                               | configured mirror relays/Blossom                                                                                        | Yes: no defaults                                             |
| Server  | Search                                      | `off` by default; `local` uses a local index                                                                            | Yes                                                          |
| Server  | nsite publishing                            | configured gateway                                                                                                      | Yes: feature off                                             |
| Web app | **Preset gate** at boot                     | `config.relays` + `presetRelays` + `METADATA_RELAYS` (purplepag); default preset from `wss://relay.nostu.be` and others | No (B1)                                                      |
| Web app | Client default relays                       | `DEFAULT_RELAYS` = `presetRelays` (nostu.be, divine, primal, nos.lol, offchain.pub, nostr.wine)                         | Only with a local build (B2)                                 |
| Web app | Host bridge                                 | `INDEXER_RELAYS` = noswhere, snort; `METADATA_RELAYS` = purplepag; `ZAP_RELAYS` = primal, nos.lol                       | Only with a local build (B2)                                 |
| Web app | Profiles                                    | `readRelays` **plus** `metadata` (purplepag)                                                                            | No (B2)                                                      |
| Web app | Trust score                                 | ContextVM via `wss://relay.contextvm.org` (refresh only)                                                                | No (B5)                                                      |
| Web app | Live/voice                                  | `LIVE_RELAYS` = damus, nos.lol, primal, zap.stream; `NostrRTC`                                                          | Off in the instance build                                    |
| Web app | View tracking                               | `wss://relay.divine.video`                                                                                              | **Off** by default                                           |
| Web app | NIP-46                                      | `DEFAULT_SIGNER_RELAYS`                                                                                                 | Only when a remote signer is chosen                          |
| Web app | Avatars                                     | `https://api.dicebear.com/...`                                                                                          | Only without a picture; off in the instance build            |
| Web app | FIPS                                        | `.fips` peers over the FIPS network                                                                                     | Only when FIPS is active                                     |

## 5. Findings and measures

Priority: **P0** = blocks LAN/offline, **P1** = wrong or unsafe behaviour, **P2** = convenience/test gap, **P3** = docs/detail.

### B1 – The preset gate prevents booting (P0, web app)

**Evidence:** `apps/web/src/contexts/PresetContext.tsx`: `RemotePresetProvider` loads the selected preset from `discoveryRelays` (settings + preset + metadata). Without a preset, without a cache and after `LOAD_TIMEOUT` (10 s, `preset-storage.ts`), `fail` sets `failedPubkey`; the provider then renders the error screen instead of the app. A preset that is **not** the default first falls back to the default preset and then fails the same way. The cache (`preset-storage.ts`, TTL 1 h) only exists after an earlier successful online load.

**Effect:** a fresh browser profile on a LAN/offline only sees "preset could not be loaded"; settings are unreachable even though the relays are configured locally. This is the hardest web app blocker.

**Measure:** **render** after the timeout instead of blocking: `presetContent = EMPTY_PRESET_CONTENT` plus a subtle, dismissible notice ("moderation lists not loaded"), retry in the background. Only an **explicitly** chosen non-default preset may keep showing an error, if the user asks for it. In addition, ship the official default preset as JSON in the bundle (it provides the NSFW author list; without it the protection is weaker). The cache path stays unchanged.

**Test:** `PresetContext` test with a pool that never answers and an empty cache → the app renders; browser: fresh profile, offline, local relays → home page and settings reachable. `EMPTY_PRESET_CONTENT` must not switch off the NSFW labels (`getEffectiveNsfwFilter` stays).

**Risk:** a bundled preset goes stale; it needs a visible notice and the same update path as the cache.

### B2 – The web app depends on public relay constants (P1, web app)

**Evidence:** `apps/web/src/constants/relays.ts`: `presetRelays` (nostu.be, divine, primal, nos.lol, offchain.pub, nostr.wine), `METADATA_RELAYS` (purplepag), `INDEXER_RELAYS` (noswhere, snort), `ZAP_RELAYS`, `LIVE_RELAYS`, `DEFAULT_VIEW_TRACKING_RELAYS`. `apps/web/src/nostr/core.ts` builds `DEFAULT_RELAYS` from them and creates the client with that default. `NostubeHostBridge` sets `indexer`, `metadata` and `zap` to these constants, regardless of `config.relays`. `useBatchedProfileLoader` uses `readRelays` **plus** `metadata`.

**Effect:** even with only local relays in the settings, the app connects to purplepag (metadata), noswhere/snort (indexer), primal/nos.lol (zaps) and the preset relays (nostu.be, divine, primal, nos.lol, offchain.pub, nostr.wine). Profiles are looked up publicly.

**Measure:** an **explicit local mode** (runtime setting `networkMode: 'public' | 'local'` in `AppConfig`, default `public`, or a dedicated build flag). In local mode: no preset discovery, `DEFAULT_RELAYS` = the configured read relays, host bridge `indexer/metadata/zap` = config or empty, `LIVE_RELAYS`/view tracking off. Do not revive `VITE_INSTANCE_BUILD` (ADR 0004: the instance build is being replaced); the server stays the instance path.

**Test:** only one local relay configured; Chromium netlog / the `check-local-profile` approach: no sockets to public hosts. In addition: a profile that exists only on the local relay is found.

**Risk:** local mode is a second network path; it has to be tested with the same load/publish flows, or it drifts.

### B3 – CSP blocks local HTTP media (P0/P1, web app)

**Evidence:** `apps/web/index.html` (CSP meta): `img-src` allows `'self' data: blob: https:` plus `localhost`, `127.0.0.1` and `*.fips`; `media-src` the same sources without `data:`; **no** general `http:` and no private IPs. `connect-src`, by contrast, allows `http:`/`https:`/`ws:`/`wss:`.

**Effect:** an event with a thumbnail/avatar/VTT on `http://192.168.1.5:24242` is not rendered in the public client (CSP violation); uploads and relay traffic keep working. The **server's site** sets no CSP; only B4 applies there.

**Measure:** extend the directives (`http:` or the configured hosts) only for a local web app build. The server needs no change. Alternative: do not support the web app on a LAN (decision 1).

**Test:** the Chrome console shows the violation; after the fix the image loads. Same test for `media-src` (VTT).

### B4 – The media policy drops private event URLs (P1, both)

**Evidence:** `packages/core/src/media-url-policy.ts`: `classifyMediaUrl` blocks `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `127/8`, `169.254/16`, `fc00::/7`, `fe80::/10`, `::1`, `::`. Exception: `trust: 'instance'` allows private targets **only on the instance origin**. `trust: 'event'` (video event, profile avatar) stays blocked. `same-origin` does not help because the image lives on another host. The code checks the **host class**, not the configured Blossom list.

**Effect:** a video event whose `imeta`/thumbnail lives on a **separate** local Blossom (`http://192.168.1.5:24242`) loses its image/VTT. The video itself may still play via the `x` hash and the configured mirror servers. The instance's built-in Blossom (same origin) works.

**Measure:** an **explicit allowlist** in the config (`media.trustedOrigins`, empty by default) that `classifyMediaUrl` accepts for `trust: 'event'`. No blanket unlocking of private ranges, no reach heuristic. Server and web app pass the list through (`useImageCascade`, `video-event.ts`, `useVideoEvent`). The public build without entries stays unchanged.

**Test:** unit tests: private + not listed → `null`; private + listed → URL; public → URL. Integration: an event with `http://<lan-blossom>/…jpg` renders; the same URL without the allowlist does not.

**Security:** the allowlist is a deliberate admin decision; it must not grow automatically from `profileRelays` or event content.

### B5 – The trust score queries ContextVM (P2, web app)

**Evidence:** `apps/web/src/nostr/contextvm.ts` hardcodes `wss://relay.contextvm.org`; `useTrustScore` only queries on refresh and otherwise returns the bundled snapshot; early return in the instance build.

**Effect:** not a boot blocker, but an external socket on a manual refresh.

**Measure:** skip it in local mode (B2) or point it at a configurable relay. Without a local mode: document it.

### B6 – IPv6 origins break the NIP-98 admin login (P0, server)

**Evidence:** `apps/server/src/config.rs`: `origin_host()` strips the brackets (`test: origin_host("https://[fd00::1]:8443") == "fd00::1"`). `apps/server/src/admin.rs:367`, however, compares `url.host_str()` (for IPv6 **with** brackets) against `state.origin_host` and `covered_hosts` (without brackets). Result: always unequal → 401.

**Effect:** on Yggdrasil (`http://[200::1]:8080`) and in IPv6 LANs the admin cannot sign in with a **bound Nostr key**; password login works. This hits exactly the issue's setup.

**Measure:** use `origin_host()` (or a normalised `url::Host::Ipv6`) in `admin.rs`; add a test with `[fd00::1]:8443` and `[200::1]:8080`. No security loss: the comparison just becomes correct.

**Test:** reproduces as 401 today; after the fix 200 with a valid NIP-98 event. Leave the `Host` header check (DNS rebinding) unchanged.

### B7 – Onboarding sends clients without mDNS to `.local` (P1, server)

**Evidence:** `apps/server/src/tls.rs`, `onboarding_router`: port 80 redirects to the **canonical** origin; `/ca` redirects there as well. If the origin is `https://host.local:443` and the client has no mDNS (many Linux systems, Android), the page is unreachable. The CA page lists Linux/IP hints, but is itself served via the canonical origin.

**Effect:** "the page does not load" although the server is running, especially after typing the LAN IP.

**Measure:** bind the redirect and the CA page to the **requested host** (only if it is covered by `covered_hosts`/the origin), plus explicit IP links. No open redirect: check the host against the allowed names.

**Test:** `curl -H 'Host: 192.168.1.5' http://192.168.1.5/` → 301 to `https://192.168.1.5/`, not `.local`; `curl http://<name>.local/` → canonical.

### B8 – `.lan`/`.home.arpa` count as public (P1, server, `proxy`)

**Evidence:** `apps/server/src/config.rs`: `is_public_host` only excludes `.local`, `.localhost` and IP literals. `.lan`/`.home.arpa` contain a dot and are not IPs → "public". `origin_is_public` is always false with `Tls::LocalCa`, so this affects **proxy** instances.

**Effect:** a `.lan` instance behind a local reverse proxy can choose `reach=public`, report `originIsPublic=true` and publish public event URLs/relay lists with a name that only resolves locally. This is a silent data error.

**Measure:** exclude `.lan` and `.home.arpa` in `is_public_host`; decide `.fips` deliberately (FIPS is a mesh that is public for its purpose). Tests for every suffix.

**Test:** `is_public_host("nostube.lan") == false`, `("nostube.home.arpa") == false`, `("videos.example.org") == true`; `origin_is_public` with `proxy` + `.lan` is false.

### B9 – `local-ca` does not cover Tailscale/Ygg/Linux (P1/P2, server)

**Evidence:** `apps/server/src/tls.rs`: `is_lan` = `v4.is_private()` (10/8, 172.16/12, 192.168/16) and `v6[0] == 0xfd` (`fd00::/8`). The CA name constraints allow the same ranges plus `.local`/`.lan`/`.home.arpa`. `LocalNames::detect` calls `scutil` (macOS).

**Effect:** `local-ca` cannot serve **Tailscale** (`100.64/10`) or **Yggdrasil** (`200::/7`); on Linux/containers the mode does not exist. Ygg users have to use `proxy` + `http(s)` (the docs already say so, but the error is not self-explanatory).

**Measure:** keep `proxy` as the documented path; optionally add `100.64/10` to `is_lan` and the CA constraints if Tailscale is a target. Build a Linux `local-ca` only if there is a real need (portable name/IP detection). Do **not** extend the CA for Ygg (`200::/7` is globally addressed).

**Test:** unit test for `is_lan(100.64.0.1)` (false today); docs example Ygg → `proxy`.

### B10 – Visitor sign-in creates external traffic (decision, server)

**Evidence:** `apps/server/docs/adr/0008-local-profile.md` and `0012-reach.md`: the visitor lookup is **independent of reach**; the three public indexers are mandatory, and `profile_relays = []` is **not** an opt-out. `apps/server/src/config.rs` (`default_profile_relays`, `public_json`) sends the three defaults in private reach too; `apps/site/src/use-visitor-profile.ts` (`visitorProfileRelays`) adds `DEFAULT_PROFILE_RELAYS`. The server already sends `"reach"` and `"originIsPublic"`; `packages/core/src/instance-config.ts` **drops** `reach` while parsing (it is not in the destructuring).

**Effect:** when a visitor signs in, three public sockets plus the visitor's NIP-65 relays go out; the indexers learn the IP and pubkey. This contradicts "no internet", but it is deliberate and documented.

**Measure (decision):**

- **A – keep:** document only (issue answer, privacy page). No code. Defensible, because the lookup only concerns the signed-in visitor.
- **B – opt-out in private reach:** add `reach` to `InstanceConfig`, `visitorProfileRelays(..., reach)`; in `private`, leave out `DEFAULT_PROFILE_RELAYS` **and** the `profileRelays` sent by the server (or use only explicitly configured local lookup relays). Update ADR 0008/0012 and the privacy page. The wire value already exists; the change is small.

**Recommendation:** A, as long as "fully offline, signed in too" is not a product promise. B only with a clear privacy commitment.

**Test:** `check-local-profile --offline` (signed out) stays at zero. For B: the same run **signed in** → zero external sockets; today it is the three indexers.

### B11 – HTTP insecure context: clipboard, PWA, OPFS (P1, both)

**Evidence:** `packages/widgets/src/components/ShareButton.tsx`, `apps/site/src/pages/VideoPage.tsx` (embed code) and the studio invite/QR use `navigator.clipboard.writeText`. `apps/site/vite.config.ts` registers VitePWA. `packages/core/src/transcode-sink.ts` uses OPFS, otherwise a memory fallback. `crypto.randomUUID` already has a fallback; WebCrypto (`crypto.subtle`) is not needed for NIP-44 (noble).

**Effect:** over `http://<lan-ip>`:

- Copying fails (`navigator.clipboard` is `undefined`), visible for the zap invoice, Nostr address, embed code and invite.
- No service worker, no install prompt, no offline shell.
- Transcoding large files falls back to RAM; risky for several GB.

**Measure:** a shared `copyText` helper with a `document.execCommand('copy')` fallback, used in the site, studio and web app. Docs: HTTP limits. Optionally warn when OPFS is missing and the file is large. The PWA stays HTTPS-only; that is a browser limit, not a Nostube gap.

**Test:** Chrome on `http://<lan-ip>`: the copy button copies; `navigator.serviceWorker` is `undefined` (expected).

### B12 – Test gaps: Linux/Ygg/HTTP and web app (P1)

**Evidence:** `check-local-profile.mjs --offline` covers macOS + `local-ca` + signed out. There is no test for `proxy`/HTTP, Linux, Ygg or the web app.

**Measure:**

1. `--proxy-http`: throwaway instance with `tls=proxy`, `origin=http://127.0.0.1:<port>`, Chromium `--host-resolver-rules` (no certificate needed). Checks site/video/embed offline. This is the Ygg/Linux path.
2. `--offline --signed-in`: expects the three indexers today, zero after B10B.
3. A dedicated web app offline test (fresh profile, `MAP * ~NOTFOUND`, local relays): boot, feed, profile, image on a local Blossom. Separate from the server test.
4. Optional CI: `--proxy-http` on Linux.

**Test:** the scripts are the test; document their output and exit code.

### B13 – LAN compose file and docs are missing (P0, docs)

**Evidence:** `apps/server/docker-compose.example.yml` (public/Caddy/FIPS) and `docs/server/` describe no minimal LAN setup; `docs/guide/self-hosting.md` only covers the choice of product.

**Measure:** an `apps/server/docker-compose.lan.yml` (or a documented snippet) with:

```yaml
services:
  nostube:
    image: ghcr.io/flox1an/nostube-server:main
    ports: ['8080:8080']
    volumes: ['./data:/data']
    environment:
      NOSTUBE_ORIGIN: http://192.168.1.5:8080
      NOSTUBE_DATA: /data
```

Plus a "LAN and offline" page under `docs/server/` covering: `reach=private`, `profile_relays=[]`, `signer_relays=[]` (mind B10), Ygg/Tailscale → `proxy`, HTTP limits (B11), separate Blossom = mirror (B14), and the test order from B12. The issue answer (appendix) is derived from it.

**Test:** on a fresh machine without a WAN: start the compose file, open the site/studio/embed, publish a video, reload.

### B14 – Separate Blossom, CORS and relay origin (P2, docs)

**Evidence:** the server has Blossom built in (`apps/server/src/main.rs`, `blossom`); `mirror` uploads to the configured Blossom **and** the instance. The web app uploads directly to the configured Blossom; a different origin needs CORS (`Access-Control-Allow-Origin`, `HEAD`/`PUT`). The local relay has to accept the web app's origin; a server relay checks writers.

**Measure:** clarify in the LAN document: built-in Blossom (recommended) vs. separate Blossom (mirror, CORS required, upload permissions). No code change.

**Test:** upload from the web app to a separate LAN Blossom with correct CORS headers; without CORS, the expected error message.

### B15 – Docker comment and error messages (P3, server)

**Evidence:** `apps/server/Dockerfile` says "serves plain HTTP on 8080", which is only true with `NOSTUBE_ORIGIN`; without an origin the start aborts (`main.rs:230`, the message names `--origin`/`NOSTUBE_ORIGIN`). `local-ca` on Linux fails on `scutil` with an unhelpful error message.

**Measure:** make the Docker comment precise ("with `NOSTUBE_ORIGIN`"); on non-macOS, `local-ca` should say "local-ca is macOS-only; use `--tls proxy --origin …`" instead of the `scutil` error. No behaviour change.

**Test:** `cargo run -- --data /tmp/x --tls local-ca` on Linux → clear message.

## 6. Phases

| Phase | Findings                 | Result                                                      | Check                                   |
| ----- | ------------------------ | ----------------------------------------------------------- | --------------------------------------- |
| 0     | B13                      | Issue answer + LAN docs + compose file; no code             | Docs review                             |
| 1     | B6, B7, B8, B15          | IPv6 admin, onboarding, `.lan`, clear errors                | Unit tests + `curl`                     |
| 2     | B10 (decision), B12, B11 | Offline promise settled; Linux/Ygg/HTTP test; copy fallback | `--proxy-http`, `--offline --signed-in` |
| 3     | B1–B5                    | Web app only if decision 1 is "yes"                         | Web app offline test                    |
| 4     | B9, B14                  | Tailscale option, Blossom docs                              | Docs + unit test                        |

Phase 1 is independent of the web app and fixes the most likely causes of the issue. Phase 2 decides whether "offline" also holds for signed-in visitors. Phase 3 is the only one that touches the web app.

## 7. Test matrix

| Scenario                                 | Product | Expectation                                | Check                                        |
| ---------------------------------------- | ------- | ------------------------------------------ | -------------------------------------------- |
| macOS, `local-ca`, offline, signed out   | Server  | Site/video/embed without external requests | `check-local-profile.mjs --offline` (exists) |
| Linux/container, `proxy` + HTTP, offline | Server  | Same                                       | New: `--proxy-http` (B12)                    |
| Yggdrasil `http://[200::1]:8080`         | Server  | Index loads; NIP-98 login                  | Manual + B6 test                             |
| Tailscale `100.x`                        | Server  | `proxy`; not `local-ca`                    | Docs                                         |
| `.lan` + `proxy` + `reach=public`        | Server  | Rejected / `originIsPublic=false`          | B8 test                                      |
| Signed-in visitor, offline               | Server  | 3 indexers today; target: 0 (decision)     | `--offline --signed-in`                      |
| Fresh profile, offline                   | Web app | Error screen today; target: boots          | Browser/Playwright                           |
| Local relay + local Blossom (`http`)     | Web app | Image/VTT visible                          | Chrome console + B3/B4                       |
| `http://<lan-ip>`                        | Both    | Copy works; no PWA                         | Chrome + B11                                 |

## 8. Open decisions

1. **Is the web app a LAN product?** Recommendation: **no**. The server is the LAN product; the web app stays public. Then B1–B5 only matter for an explicit local build, and the docs say so clearly.
2. **Visitor lookup in private reach:** A (keep it, documented, ADR 0012) or B (opt-out, `reach` in the TS contract). Recommendation: A, until "zero internet" becomes a promise.
3. **Local media from separate hosts:** explicit allowlist (B4) or not at all. Recommendation: allowlist, empty by default.
4. **CSP for the web app:** only with a local build; the server needs none.
5. **`local-ca` on Linux / Tailscale `100.64/10`:** do not build it, and document `proxy` instead; add the Tailscale range only if needed.
6. **`reach` in the public config contract:** formalise it (the server already sends it; the TS parser ignores it) once B10B is built.

## 9. References

- Issue: <https://github.com/flox1an/nostube/issues/180>
- Server ADRs: `apps/server/docs/adr/0005-public-config-fail-closed-instance-build.md`, `0008-local-profile.md`, `0009-outbox-and-mirror.md`, `0012-reach.md`
- TLS/offline: `docs/server/tls.md` (including `--offline`, name constraints, Ygg/Linux)
- Choice of product: `docs/guide/self-hosting.md`
- Code: `apps/web/src/contexts/PresetContext.tsx`, `apps/web/src/constants/relays.ts`, `apps/web/index.html`, `packages/core/src/media-url-policy.ts`, `apps/server/src/tls.rs`, `apps/server/src/config.rs`, `apps/server/src/admin.rs`, `apps/server/scripts/check-local-profile.mjs`

## Appendix: short answer for the issue

> The static nostu.be client is not the LAN product — a fresh browser blocks on its remote preset. Run **nostube-server** in `proxy` mode with a plain-HTTP origin and no Caddy:
>
> ```bash
> docker run -d --name nostube -p 8080:8080 -v "$PWD/data:/data" \
>   -e NOSTUBE_ORIGIN=http://<LAN-or-Ygg-IP>:8080 \
>   ghcr.io/flox1an/nostube-server:main
> ```
>
> In the studio: leave reach on **private** (default), clear **profile/signer relays**, keep **mirror** empty. `local-ca` cannot work on Yggdrasil (it only covers RFC 1918, `fd00::/8` and `.local`, and is macOS-only).
>
> Known gaps: signing in still queries three public indexers; media on a _different_ private host is filtered; plain HTTP has no PWA/clipboard; IPv6 admin login with a bound key currently fails (fixed by B6). If the index still does not load, send `docker logs nostube` and `curl -v http://<ip>:8080/`.
