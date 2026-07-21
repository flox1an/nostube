# macOS Tauri media and Local Blossom Cache validation

This is the functional-proof record for #57. It is not a desktop product UX specification.

## Host contract

- `src-tauri` packages the existing Vite application in a Tauri 2 WebView.
- Almond is built from the adjacent `../almond` checkout, bundled as a macOS arm64 sidecar, and started only by the host.
- The host binds Almond to `127.0.0.1:24242`, persists Blob data under the app-local data directory (`blossom-cache`), then requires `HEAD /` to return 2xx within five seconds.
- Almond runs in Local Blossom Cache mode: uploads and mirrors are disabled; `?xs=` hints are enabled and cache misses proxy upstream responses.
- Closing the host through Tauri's normal exit path stops the managed child process.
- The WebView keeps web security enabled. The CSP permits HTTP(S) media because remote Blossom and optional FIPS origins are data sources; it does not expose shell access to the frontend.

## Reproduction

```bash
npm run desktop:build
open src-tauri/target/release/bundle/macos/NosTube.app
```

The build command compiles Almond from `../almond`, copies the arm64 binary to Tauri's sidecar location, builds the web application, and produces `NosTube.app`.

## Observed evidence — 2026-07-21 on macOS arm64

| Required path                                | Result                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct HTTPS MP4                             | transport verified                             | `https://almond.slidestr.net/0d1991b81fae8148cebdedbd4658c5d0873871620c248f1df60dda5b24e0999e.mp4` returned `206`, `content-type: video/mp4`, and `accept-ranges: bytes` for `Range: bytes=0-1023`.                                                                                                                                                                                                                                                                                                                            |
| FIPS-resolved HTTP MP4 without `crossOrigin` | transport verified; WKWebView playback pending | `http://npub1080hnas4cuhp7cwty4cayhfftvgtadueem9kwygu88mjy7ksgpgsswkgud.fips/77bb8bda6cc05efcbb8ee46840d7010df22f4379834ee817f22650ffa41c567e.mp3` returned `206`, `content-type: video/mp4`, `accept-ranges: bytes`, and `content-range: bytes 0-1023/174112817`. The URL suffix is `.mp3`; the origin declares the Blob as MP4 and names it `.mp4`. The packaged cache proxied it with the canonical host-only hint `xs=npub1080hnas4cuhp7cwty4cayhfftvgtadueem9kwygu88mjy7ksgpgsswkgud.fips`, trying HTTPS first then HTTP. |
| FIPS-resolved HTTP HLS                       | pending                                        | The supplied FIPS origin proves `.fips` HTTP resolution, but no HLS master/segment URL has been supplied. Exercise master playlist plus every segment URL in WKWebView; HLS loader fetches require the origin's CORS headers.                                                                                                                                                                                                                                                                                                  |
| Almond local Blob byte ranges                | verified in packaged app                       | `NosTube.app` started Almond, `HEAD /` returned `200`, and a cached MP4 request with `Range: bytes=1024-2047` returned `206`, `content-range: bytes 1024-2047/673829`, `content-type: video/mp4`, and `accept-ranges: bytes`. The packaged cache additionally proxied the supplied FIPS Blob with the host-only `xs` hint and returned `206` for `Range: bytes=0-1023`.                                                                                                                                                        |

The HTTPS local-cache proof first requested the MP4 via `http://127.0.0.1:24242/<sha256>.mp4?xs=almond.slidestr.net`; the following range request had no upstream hint and was served from the app-local cache. Almond now preserves BUD-10's host-only `xs` form: it tries HTTPS first, then HTTP when no scheme is supplied; an explicit scheme remains a single explicit transport choice.

## WKWebView validation procedure for remaining paths

1. Open a NosTube Video Event whose primary source is the supplied FIPS HTTP Blob. Leave the player without a `crossOrigin` attribute. Confirm playback, seek, and a `206` range request in Web Inspector.
2. Obtain an HLS master URL and every variant/segment URL from the FIPS origin. Confirm master, playlist, and segment responses include permissive CORS headers; confirm playback and seek in Web Inspector.
3. Capture the media codec, response status, CORS headers, and any WKWebView console error. Do not disable mixed-content protection or globally relax WebView security to make a failure pass.

## Decision impact for #56

The local-cache path is viable: a bundled, host-managed Almond can use app-specific storage, complete the required health check, proxy HTTPS and FIPS HTTP Blossom sources, cache them, and return byte ranges from `127.0.0.1:24242`. The direct FIPS origin is reachable from macOS, but the native `<video>`/WKWebView rendering verdict and the FIPS HLS verdict remain open.
