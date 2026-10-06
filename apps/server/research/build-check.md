# Build check: main binary + almond lib + ported relay (ticket #12)

Part of map #1. Spike code: this branch (`research/build-check`), crate at the repo root. Almond side: branch `spike/lib-for-nostube`, commit `aa44b87` in `~/dev/nostr/almond` (local worktree `~/dev/nostr/almond-lib-spike`, not pushed). Host: Mac, arm64, rustc 1.98.0.

## Result

**It builds and boots.** One axum app on one TLS listener serves the almond library (Blossom), a relay stub on axum ws + rusqlite, and the embedded Nostube build, in ADR 0004 dispatch order. A throwaway end-to-end smoke (Node, `nostr-tools`) passed 25/25 against both the debug and release binary:

| Area | Checked |
|---|---|
| Relay | NIP-11 on `/` (`Accept: application/nostr+json`); WS on `/`; EVENT from allowed writer → `OK true`; EVENT from stranger → `OK false "restricted: …"`; REQ → stored event + EOSE; ephemeral 22236 broadcast live and not stored |
| Blossom (almond lib) | BUD-06 `HEAD /upload` without auth → 401; `PUT /upload` by stranger → 401 (allowlist); by allowed writer → 201 with descriptor URL on the configured origin; `GET /<sha256>` returns the bytes; unknown hash → Blossom 404, not the app shell |
| App | `GET /`, `/upload`, `/settings/relays` → app shell; all entry `/assets/*.js` → 200 `text/javascript`; browser worker `/assets/browserTranscode.worker-*.js` and the Mediabunny chunk it imports (`/assets/src-*.js`, 725 KB) → 200 `text/javascript`; missing asset → 404; root files `/favicon.ico`, `/sw.js` → 200 |
| Other | `/api/health` → 200; `POST` to an unknown path → 405 |

Numbers: release build 4m09s cold (no LTO), binary 46 MB including 13 MB of embedded `dist/`. Debug rebuild of the spike crate ~3 s.

## Findings

### Almond as a library (#3 design holds)

- The #3 change set (steps 1–4) went in as one commit: `lib.rs` + thin `main.rs`, `Config::defaults()`/`validate()`, `build_state`, sync `create_app` (Blossom routes only), `standalone_extras` (pages and extras for the binary, ADR 0004), `spawn_background_tasks` → `JoinSet`, default-on `cashu` feature.
- Standalone unchanged: `cargo test` 203/203 (default) and 201/201 (`--no-default-features`); clippy `-D warnings` clean for both feature sets; a response diff of 10 requests against a 42c2760 build matched; exit codes for startup failures unchanged (101, Cashu init 1).
- Only API addition beyond #3: `standalone_extras(AppState) -> Router`; `serve_files::start_refresh_job` now takes the `JoinSet`.
- Embedder field types: `storage_path: PathBuf`, `public_url: Option<String>`, `allowed_npubs: Vec<PublicKey>` (nostr 0.45, same type as the relay's), `homepage_enabled: bool`.
- `HEAD /upload` needs the BUD-06 `X-SHA-256`/`X-Content-*` headers; without them almond answers 400 before checking auth (same as standalone).

### SQLite `links`

- With `almond = { …, default-features = false }`, `libsqlite3-sys` comes only from the relay: `rusqlite 0.40.2` → `libsqlite3-sys 0.38.2`. **The relay can use current rusqlite**; the 0.31 pin from #4 is not needed.
- With almond default features (`cashu` on), `rusqlite 0.40` fails to resolve (cdk-sqlite pins rusqlite 0.31 / libsqlite3-sys 0.28, and `links = "sqlite3"` allows one). `rusqlite 0.31` resolves. So the only constraint is: never build the instance with almond's `cashu` feature.
- `bundled` SQLite compiles C: the Linux Docker build stage needs a C toolchain [INFERENCE: standard for libsqlite3-sys bundled].

### rustls crypto provider

- Both `ring` 0.17 and `aws-lc-rs` 1.18 are in the graph; `rustls` gets both features (ring via rcgen/aws-smithy/hyper-rustls, aws-lc-rs via almond). rustls then cannot pick a default, so **the binary must call `aws_lc_rs::default_provider().install_default()` once, first thing in `main`**. The spike does; almond's library never installs one.
- TLS served by `axum-server 0.8` (`bind_rustls`) with an rcgen certificate; WebSocket upgrades work through it.

### Relay on axum

- `axum` needs `features = ["ws"]` (tokio-tungstenite 0.29). nostr-sdk (via almond) brings tungstenite 0.28 too: a duplicate, no conflict. 49 duplicated crate versions overall, none of axum/hyper/tokio/rustls/nostr.
- nostr 0.45 types work as the port plan assumed: `ClientMessage::from_json`, `RelayMessage::{ok,event,eose,closed,notice}`, `Filter::match_event`, `Event::verify`, `Kind::is_ephemeral`, `nip11::RelayInformationDocument`. Types live under `nostr::prelude` (not the crate root); `Timestamp::as_secs`.
- The stub scans the table and filters with `match_event`; filter→SQL, replaceable/addressable, deletion and expiry are the port itself (#4, #11), not proven here.

### Dispatch and the embedded build

- Routing is one fallback handler that applies ADR 0004 in order and forwards Blossom requests to almond's `Router` via `oneshot`. This avoids axum route-merging corner cases (almond's root `/{filename}` route, `GET /upload` vs Blossom's `PUT /upload`).
- **ADR 0004 needs one refinement:** the Vite build emits files at the root, not only under `/assets/`: `favicon*`, `manifest.webmanifest`, `sw.js`, `registerSW.js`, `robots.txt`, `embed.html`, and for the embed player a root copy of the worker and the Mediabunny chunk. Step 5 must serve an embedded root file if one exists, else the app shell. None of those names can collide with a 64-hex Blossom path.
- The worker imports the Mediabunny chunk by relative URL (`./src-*.js`), so it resolves under `/assets/` without rewriting; no `.wasm` files are emitted.
- `rust-embed` with `debug-embed` embeds `dist/` in debug builds too. `dist/` also carries test/demo pages (`embed-test*.html`, `stats.html`, …) that the package build should drop.

## Blockers

None for the first cut.

## Follow-ups for implementation (not decisions)

- Land the almond change upstream (flox1an/almond) and pin the instance to that rev instead of the local `file://` URL.
- Port the relay per #4/#11 on rusqlite 0.40.
