//! Instance branding (ADR 0005 addendum): a logo, a favicon, a banner and an app icon, one image per
//! slot in `<data>/branding/<slot>.<ext>`, served at `/branding/<slot>` and announced in the public
//! config as `site.logo`, `site.favicon`, `site.banner` and `site.icon`. The images are small, so they
//! are held in memory; an upload, a removal or a config change rebuilds the public config bytes and
//! the web app manifest (`/manifest.webmanifest`), no restart needed.

use std::path::{Path, PathBuf};

use axum::{
    body::Bytes,
    http::{header, HeaderMap, StatusCode},
    response::{AppendHeaders, IntoResponse, Response},
};
use parking_lot::RwLock;
use sha2::{Digest, Sha256};

const KIB: usize = 1024;
/// The smallest side of the app icon: Android and the manifest want 512×512.
const ICON_MIN: u32 = 512;
/// `theme_color` and `background_color` of the manifest and the head's `theme-color`; the public
/// config has no background colour, so the dark background of the Nostube web app.
pub const THEME_COLOR: &str = "#141111";

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Slot {
    Logo,
    Favicon,
    Banner,
    /// What an installed site shows on the home screen: a square PNG (iOS takes no other type).
    Icon,
}

impl Slot {
    const ALL: [Slot; 4] = [Slot::Logo, Slot::Favicon, Slot::Banner, Slot::Icon];

    pub fn parse(name: &str) -> Option<Slot> {
        Self::ALL.into_iter().find(|s| s.name() == name)
    }

    pub fn name(self) -> &'static str {
        match self {
            Slot::Logo => "logo",
            Slot::Favicon => "favicon",
            Slot::Banner => "banner",
            Slot::Icon => "icon",
        }
    }

    pub fn max_bytes(self) -> usize {
        match self {
            // A 512×512 PNG from the studio's crop can exceed 512 KiB when it is photographic.
            Slot::Banner | Slot::Icon => 2048 * KIB,
            Slot::Logo | Slot::Favicon => 512 * KIB,
        }
    }

    /// ICO is a favicon format only; the icon is PNG only.
    pub fn accepts(self, kind: Kind) -> bool {
        match self {
            Slot::Icon => kind == Kind::Png,
            Slot::Favicon => true,
            Slot::Logo | Slot::Banner => kind != Kind::Ico,
        }
    }

    pub fn types(self) -> &'static str {
        match self {
            Slot::Favicon => "PNG, JPEG, WebP, SVG or ICO",
            Slot::Logo | Slot::Banner => "PNG, JPEG, WebP or SVG",
            Slot::Icon => "PNG",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    Png,
    Jpeg,
    Webp,
    Svg,
    Ico,
}

impl Kind {
    const ALL: [Kind; 5] = [Kind::Png, Kind::Jpeg, Kind::Webp, Kind::Svg, Kind::Ico];

    pub(crate) fn ext(self) -> &'static str {
        match self {
            Kind::Png => "png",
            Kind::Jpeg => "jpg",
            Kind::Webp => "webp",
            Kind::Svg => "svg",
            Kind::Ico => "ico",
        }
    }

    fn mime(self) -> &'static str {
        match self {
            Kind::Png => "image/png",
            Kind::Jpeg => "image/jpeg",
            Kind::Webp => "image/webp",
            Kind::Svg => "image/svg+xml",
            Kind::Ico => "image/x-icon",
        }
    }

    /// What the bytes are by their magic numbers; the client's Content-Type is never trusted.
    pub fn sniff(b: &[u8]) -> Option<Kind> {
        if b.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some(Kind::Png)
        } else if b.starts_with(&[0xff, 0xd8, 0xff]) {
            Some(Kind::Jpeg)
        } else if b.len() >= 12 && b.starts_with(b"RIFF") && &b[8..12] == b"WEBP" {
            Some(Kind::Webp)
        } else if b.len() >= 6 && b.starts_with(&[0, 0, 1, 0]) {
            Some(Kind::Ico)
        } else if is_svg(b) {
            Some(Kind::Svg)
        } else {
            None
        }
    }
}

/// UTF-8 that opens like an SVG document and has an `<svg` element. Whatever else it holds, it is
/// only ever served as `image/svg+xml` in a sandbox (see `serve`).
fn is_svg(b: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(b) else { return false };
    let text = text.trim_start_matches('\u{feff}').trim_start();
    ["<?xml", "<svg", "<!--", "<!DOCTYPE svg"].iter().any(|p| text.starts_with(p)) && text.contains("<svg")
}

/// Width and height from a PNG's IHDR chunk, which always comes first.
fn png_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.get(12..16) != Some(b"IHDR") {
        return None;
    }
    let be = |at: usize| u32::from_be_bytes(b[at..at + 4].try_into().expect("four bytes"));
    (b.len() >= 24).then(|| (be(16), be(20)))
}

/// The side of a usable app icon: a square PNG of at least `ICON_MIN` pixels, else `None`.
pub fn icon_size(b: &[u8]) -> Option<u32> {
    png_size(b).and_then(|(w, h)| (w == h && w >= ICON_MIN).then_some(w))
}

/// What the admin is told when `icon_size` refuses an upload.
pub const ICON_REFUSAL: &str = "the icon must be a square PNG of at least 512×512 pixels";

struct Asset {
    kind: Kind,
    bytes: Bytes,
    /// The start of the SHA-256: the `?v=` of the URL, and the ETag.
    version: String,
}

impl Asset {
    fn new(kind: Kind, bytes: Bytes) -> Asset {
        let version = format!("{:x}", Sha256::digest(&bytes))[..16].to_owned();
        Asset { kind, bytes, version }
    }

    fn url(&self, slot: Slot) -> String {
        format!("/branding/{}?v={}", slot.name(), self.version)
    }
}

struct State {
    /// `Config::public_json` of the applied config; the branding URLs go into its `site`.
    base: serde_json::Value,
    assets: [Option<Asset>; Slot::ALL.len()],
    public_config: Bytes,
    manifest: Bytes,
}

impl State {
    /// The bytes served from `base` and `assets`: rebuilt on every change of either.
    fn rebuild(&mut self) {
        self.public_config = build(&self.base, &self.assets);
        self.manifest = manifest(&self.base, self.assets[Slot::Icon as usize].as_ref());
    }
}

pub struct Branding {
    dir: PathBuf,
    state: RwLock<State>,
}

impl Branding {
    /// Loads what `<data>/branding/` holds. An unreadable or wrong file is left out with a warning:
    /// branding never keeps the instance from starting.
    pub fn open(data: &Path, public_json: serde_json::Value) -> Branding {
        let dir = data.join("branding");
        let assets = Slot::ALL.map(|slot| load(&dir, slot));
        let mut state = State { base: public_json, assets, public_config: Bytes::new(), manifest: Bytes::new() };
        state.rebuild();
        Branding { dir, state: RwLock::new(state) }
    }

    /// The serialized public config (`/api/config`) with the current branding URLs.
    pub fn public_config(&self) -> Bytes {
        self.state.read().public_config.clone()
    }

    /// The web app manifest (`/manifest.webmanifest`) of the current title, tagline and icon.
    pub fn manifest(&self) -> Bytes {
        self.state.read().manifest.clone()
    }

    /// A cheap snapshot of the nsite's branding paths, MIME types and shared image bytes.
    pub fn files(&self) -> Vec<(&'static str, &'static str, Bytes)> {
        let state = self.state.read();
        Slot::ALL.into_iter().filter_map(|slot| {
            let asset = state.assets[slot as usize].as_ref()?;
            let path = match slot {
                Slot::Logo => "/branding/logo",
                Slot::Favicon => "/branding/favicon",
                Slot::Banner => "/branding/banner",
                Slot::Icon => "/branding/icon",
            };
            Some((path, asset.kind.mime(), asset.bytes.clone()))
        }).collect()
    }

    /// Takes the public config of a config applied while running (no restart).
    pub fn set_base(&self, public_json: serde_json::Value) {
        let mut state = self.state.write();
        state.base = public_json;
        state.rebuild();
    }

    /// `{logo, favicon, banner, icon}`: each the URL, or null when the slot is empty.
    pub fn urls(&self) -> serde_json::Value {
        let state = self.state.read();
        Slot::ALL
            .into_iter()
            .map(|s| (s.name().to_owned(), state.assets[s as usize].as_ref().map(|a| a.url(s)).into()))
            .collect::<serde_json::Map<_, _>>()
            .into()
    }

    /// Replaces the slot's image (written next to it, then renamed over it) and answers its URL.
    /// `kind` comes from `Kind::sniff`.
    pub fn store(&self, slot: Slot, kind: Kind, bytes: Bytes) -> std::io::Result<String> {
        let mut state = self.state.write();
        std::fs::create_dir_all(&self.dir)?;
        let tmp = self.dir.join(format!(".{}.{}.tmp", slot.name(), kind.ext()));
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, self.dir.join(file_name(slot, kind)))?;
        self.remove_files(slot, Some(kind));
        let asset = Asset::new(kind, bytes);
        let url = asset.url(slot);
        state.assets[slot as usize] = Some(asset);
        state.rebuild();
        Ok(url)
    }

    /// Empties the slot; its URL leaves the public config.
    pub fn remove(&self, slot: Slot) -> std::io::Result<()> {
        let mut state = self.state.write();
        for kind in Kind::ALL {
            match std::fs::remove_file(self.dir.join(file_name(slot, kind))) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
                _ => {}
            }
        }
        state.assets[slot as usize] = None;
        state.rebuild();
        Ok(())
    }

    /// Files of other types left from earlier uploads. `open` takes the newest file anyway, so a
    /// leftover only costs disk space: warn, do not fail the upload.
    fn remove_files(&self, slot: Slot, keep: Option<Kind>) {
        for kind in Kind::ALL.into_iter().filter(|k| Some(*k) != keep) {
            match std::fs::remove_file(self.dir.join(file_name(slot, kind))) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                    tracing::warn!("branding: cannot remove the old {} file: {e}", slot.name())
                }
                _ => {}
            }
        }
    }

    /// `GET /branding/<slot>`. The `?v=` URL of the public config is cached for good; any other
    /// request revalidates against the ETag. An SVG gets a CSP that keeps its scripts from running
    /// when it is opened directly (same origin as the admin session).
    pub fn serve(&self, name: &str, query: Option<&str>, request: &HeaderMap) -> Response {
        let state = self.state.read();
        let Some(asset) = Slot::parse(name).and_then(|s| state.assets[s as usize].as_ref()) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        let etag = format!("\"{}\"", asset.version);
        let pinned = query.is_some_and(|q| q.split('&').any(|p| p.strip_prefix("v=") == Some(asset.version.as_str())));
        let mut headers = vec![
            (header::ETAG, etag.clone()),
            (
                header::CACHE_CONTROL,
                if pinned { "public, max-age=31536000, immutable" } else { "no-cache" }.to_owned(),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
        ];
        if asset.kind == Kind::Svg {
            headers.push((
                header::CONTENT_SECURITY_POLICY,
                "default-src 'none'; style-src 'unsafe-inline'; sandbox".to_owned(),
            ));
        }
        let fresh = request
            .get(header::IF_NONE_MATCH)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.split(',').any(|t| t.trim() == etag));
        if fresh {
            return (StatusCode::NOT_MODIFIED, AppendHeaders(headers)).into_response();
        }
        headers.push((header::CONTENT_TYPE, asset.kind.mime().to_owned()));
        // A `Body`, not `Bytes`: those would add their own `application/octet-stream`.
        (AppendHeaders(headers), axum::body::Body::from(asset.bytes.clone())).into_response()
    }
}

/// Publishes generated site/branding bytes through Blossom's normal content-addressed storage.
/// Reusing the incumbent blob makes profile and nsite paths share the same hash and upload.
pub async fn store_blob(
    state: &almond::models::AppState,
    bytes: &[u8],
    mime: &str,
    ext: Option<&str>,
) -> Result<String, String> {
    use almond::{models::BlobOrigin, services::file_storage::{self, BlobPublication, TempBlob}};
    let hash = format!("{:x}", Sha256::digest(bytes));
    file_storage::ensure_not_quarantined(state, &hash).await.map_err(|e| e.to_string())?;
    if let Some(metadata) = file_storage::get_file_metadata(state, &hash).await {
        if metadata.size == bytes.len() as u64 && metadata.origin == BlobOrigin::Upload {
            return Ok(hash);
        }
    }
    file_storage::ensure_storage_capacity(state, bytes.len() as u64).await.map_err(|e| e.to_string())?;
    file_storage::ensure_temp_dir(state).await.map_err(|e| e.to_string())?;
    let temp = TempBlob::reserve(state, "nostube-generated", ext);
    tokio::fs::write(temp.path(), bytes).await.map_err(|e| e.to_string())?;
    let stored = file_storage::publish_blob(state, temp, BlobPublication {
        sha256: hash.clone(),
        origin: BlobOrigin::Upload,
        extension: ext.map(str::to_owned),
        mime_type: Some(mime.to_owned()),
        size: bytes.len() as u64,
        expiration: None,
    }).await.map_err(|e| e.to_string())?;
    if stored.metadata.size != bytes.len() as u64 {
        return Err(format!("stored blob {hash} size {} differs from {}", stored.metadata.size, bytes.len()));
    }
    Ok(hash)
}

fn file_name(slot: Slot, kind: Kind) -> String {
    format!("{}.{}", slot.name(), kind.ext())
}

/// The slot's newest file, if it is what its name says, within the limit and (the icon) square.
fn load(dir: &Path, slot: Slot) -> Option<Asset> {
    let (_, kind, path) = Kind::ALL
        .into_iter()
        .filter(|k| slot.accepts(*k))
        .filter_map(|kind| {
            let path = dir.join(file_name(slot, kind));
            let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok()?;
            Some((modified, kind, path))
        })
        .max_by_key(|(modified, ..)| *modified)?;
    match std::fs::read(&path) {
        Ok(bytes)
            if Kind::sniff(&bytes) == Some(kind)
                && bytes.len() <= slot.max_bytes()
                && (slot != Slot::Icon || icon_size(&bytes).is_some()) =>
        {
            Some(Asset::new(kind, bytes.into()))
        }
        Ok(_) => {
            tracing::warn!("branding: ignoring {}: not a usable {} file within the limit", path.display(), kind.ext());
            None
        }
        Err(e) => {
            tracing::warn!("branding: cannot read {}: {e}", path.display());
            None
        }
    }
}

fn build(base: &serde_json::Value, assets: &[Option<Asset>]) -> Bytes {
    let mut json = base.clone();
    if let Some(site) = json.get_mut("site").and_then(serde_json::Value::as_object_mut) {
        for slot in Slot::ALL {
            if let Some(asset) = &assets[slot as usize] {
                site.insert(slot.name().to_owned(), asset.url(slot).into());
            }
        }
    }
    serde_json::to_vec(&json).expect("a JSON value serializes").into()
}

/// Longest `short_name` (what fits under a home screen icon), in characters.
const SHORT_NAME_MAX: usize = 12;

/// The title, cut after the last whole word within `SHORT_NAME_MAX` characters; mid-word when
/// that word would leave less than half.
fn short_name(title: &str) -> &str {
    let Some((cut, _)) = title.char_indices().nth(SHORT_NAME_MAX) else { return title };
    let head = &title[..cut];
    let whole = if title[cut..].starts_with(' ') { Some(head) } else { head.rfind(' ').map(|space| &head[..space]) };
    whole.map(str::trim_end).filter(|w| w.chars().count() >= SHORT_NAME_MAX / 2).unwrap_or(head.trim_end())
}

/// `/manifest.webmanifest`: makes the site installable under the instance's title, with its icon
/// or Nostube's (the site build's `public/` files). `fullscreen` hides Android's status and
/// navigation bars (the shell's safe-area padding keeps content clear of the cutout); iOS falls
/// back to `standalone`, where `viewport-fit=cover` already runs edge to edge.
fn manifest(base: &serde_json::Value, icon: Option<&Asset>) -> Bytes {
    let title = base["title"].as_str().unwrap_or("Nostube");
    let icons = match icon.and_then(|a| Some((a, icon_size(&a.bytes)?))) {
        Some((a, side)) => serde_json::json!([
            { "src": a.url(Slot::Icon), "type": "image/png", "sizes": format!("{side}x{side}"), "purpose": "any" },
        ]),
        None => serde_json::json!([
            { "src": "/nostube-192.png", "type": "image/png", "sizes": "192x192", "purpose": "any" },
            { "src": "/nostube.png", "type": "image/png", "sizes": "512x512", "purpose": "any" },
            { "src": "/nostube.svg", "type": "image/svg+xml", "sizes": "any", "purpose": "any" },
            { "src": "/nostube-maskable.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" },
        ]),
    };
    let mut json = serde_json::json!({
        "id": "/",
        "name": title,
        "short_name": short_name(title),
        "start_url": "/",
        "scope": "/",
        "display": "fullscreen",
        "lang": "en",
        "categories": ["entertainment", "social", "video"],
        "theme_color": THEME_COLOR,
        "background_color": THEME_COLOR,
        "icons": icons,
    });
    if let Some(tagline) = base["site"]["tagline"].as_str().filter(|t| !t.is_empty()) {
        json["description"] = tagline.into();
    }
    serde_json::to_vec(&json).expect("a JSON value serializes").into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn types_are_told_by_their_bytes() {
        assert_eq!(Kind::sniff(b"\x89PNG\r\n\x1a\n...."), Some(Kind::Png));
        assert_eq!(Kind::sniff(&[0xff, 0xd8, 0xff, 0xe0]), Some(Kind::Jpeg));
        assert_eq!(Kind::sniff(b"RIFF\0\0\0\0WEBPVP8 "), Some(Kind::Webp));
        assert_eq!(Kind::sniff(&[0, 0, 1, 0, 1, 0]), Some(Kind::Ico));
        assert_eq!(Kind::sniff(b"\xef\xbb\xbf <?xml version=\"1.0\"?><svg/>"), Some(Kind::Svg));
        assert_eq!(Kind::sniff(b"<!doctype html><html><svg></svg></html>"), None);
        assert_eq!(Kind::sniff(b""), None);
        assert!(!Slot::Logo.accepts(Kind::Ico) && Slot::Favicon.accepts(Kind::Ico));
        assert!(Slot::Icon.accepts(Kind::Png) && !Slot::Icon.accepts(Kind::Svg) && !Slot::Icon.accepts(Kind::Ico));
    }

    fn png_of(w: u32, h: u32) -> Vec<u8> {
        [&b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR"[..], &w.to_be_bytes(), &h.to_be_bytes()].concat()
    }

    #[test]
    fn the_icon_is_a_square_png_of_at_least_512() {
        assert_eq!(icon_size(&png_of(512, 512)), Some(512));
        assert_eq!(icon_size(&png_of(1024, 1024)), Some(1024));
        assert_eq!(icon_size(&png_of(512, 513)), None);
        assert_eq!(icon_size(&png_of(511, 511)), None);
        assert_eq!(icon_size(&png_of(512, 512)[..20]), None);
        assert_eq!(icon_size(b"\x89PNG\r\n\x1a\n"), None);
    }

    #[test]
    fn the_short_name_keeps_whole_words_where_it_can() {
        assert_eq!(short_name("My videos"), "My videos");
        assert_eq!(short_name("Twelve chars"), "Twelve chars");
        assert_eq!(short_name("Twelve chars and more"), "Twelve chars");
        assert_eq!(short_name("My Great Video Channel"), "My Great");
        assert_eq!(short_name("A Supercalifragilistic"), "A Supercalif");
        assert_eq!(short_name("Überlängenvideos"), "Überlängenvi");
    }

    #[test]
    fn the_manifest_follows_the_title_tagline_and_icon() {
        let dir = std::env::temp_dir().join(format!("nss-manifest-test-{}", crate::admin::random_boot_id()));
        let branding = Branding::open(&dir, serde_json::json!({ "title": "My Great Video Channel", "site": { "tagline": "" } }));
        let read = || serde_json::from_slice::<serde_json::Value>(&branding.manifest()).unwrap();
        let m = read();
        assert_eq!((m["id"].as_str(), m["start_url"].as_str(), m["scope"].as_str()), (Some("/"), Some("/"), Some("/")));
        assert_eq!(m["display"], "fullscreen");
        assert_eq!(m["name"], "My Great Video Channel");
        assert_eq!(m["short_name"], "My Great");
        assert!(m.get("description").is_none(), "{m}");
        assert_eq!(m["lang"], "en");
        assert_eq!(m["categories"], serde_json::json!(["entertainment", "social", "video"]));
        assert_eq!((m["theme_color"].as_str(), m["background_color"].as_str()), (Some(THEME_COLOR), Some(THEME_COLOR)));
        let srcs: Vec<_> = m["icons"].as_array().unwrap().iter().map(|i| i["src"].as_str().unwrap()).collect();
        assert_eq!(srcs, ["/nostube-192.png", "/nostube.png", "/nostube.svg", "/nostube-maskable.png"]);
        assert_eq!(m["icons"][3]["purpose"], "maskable");

        // A config applied while running and an uploaded icon show at once.
        branding.set_base(serde_json::json!({ "title": "Tubes", "site": { "tagline": "Hello" } }));
        let url = branding.store(Slot::Icon, Kind::Png, png_of(1024, 1024).into()).unwrap();
        let m = read();
        assert_eq!((m["name"].as_str(), m["short_name"].as_str(), m["description"].as_str()), (Some("Tubes"), Some("Tubes"), Some("Hello")));
        assert_eq!(m["icons"], serde_json::json!([{ "src": url, "type": "image/png", "sizes": "1024x1024", "purpose": "any" }]));
        let public: serde_json::Value = serde_json::from_slice(&branding.public_config()).unwrap();
        assert_eq!(public["site"]["icon"], url.as_str());
        assert_eq!(branding.urls()["icon"], url.as_str());

        // A restart keeps the icon; a removal brings back Nostube's.
        let reopened = Branding::open(&dir, serde_json::json!({ "title": "Tubes", "site": { "tagline": "Hello" } }));
        assert_eq!(reopened.manifest(), branding.manifest());
        branding.remove(Slot::Icon).unwrap();
        assert_eq!(read()["icons"].as_array().unwrap().len(), 4);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_svg_is_served_sandboxed_and_the_pinned_url_is_cached_for_good() {
        let dir = std::env::temp_dir().join(format!("nss-branding-test-{}", crate::admin::random_boot_id()));
        let branding = Branding::open(&dir, serde_json::json!({ "site": {} }));
        let svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>";
        let url = branding.store(Slot::Logo, Kind::Svg, Bytes::from_static(svg)).unwrap();
        let version = url.split_once("?v=").unwrap().1;

        let res = branding.serve("logo", Some(&format!("v={version}")), &HeaderMap::new());
        assert_eq!(res.status(), StatusCode::OK);
        let h = res.headers();
        assert_eq!(h[header::CONTENT_TYPE], "image/svg+xml");
        assert_eq!(h[header::CONTENT_SECURITY_POLICY], "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        assert_eq!(h[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert_eq!(h[header::CACHE_CONTROL], "public, max-age=31536000, immutable");

        let mut conditional = HeaderMap::new();
        conditional.insert(header::IF_NONE_MATCH, format!("\"{version}\"").parse().unwrap());
        let res = branding.serve("logo", None, &conditional);
        assert_eq!(res.status(), StatusCode::NOT_MODIFIED);
        assert_eq!(res.headers()[header::CACHE_CONTROL], "no-cache");
        assert_eq!(branding.serve("banner", None, &HeaderMap::new()).status(), StatusCode::NOT_FOUND);
        assert_eq!(branding.serve("other", None, &HeaderMap::new()).status(), StatusCode::NOT_FOUND);

        // A replacement of another type leaves one file, and a restart serves the new one.
        branding.store(Slot::Logo, Kind::Png, Bytes::from_static(b"\x89PNG\r\n\x1a\nxx")).unwrap();
        let files: Vec<_> = std::fs::read_dir(dir.join("branding")).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(files, ["logo.png"]);
        let reopened = Branding::open(&dir, serde_json::json!({ "site": {} }));
        let res = reopened.serve("logo", None, &HeaderMap::new());
        assert_eq!(res.headers()[header::CONTENT_TYPE], "image/png");
        assert!(res.headers().get(header::CONTENT_SECURITY_POLICY).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn nsite_branding_files_reuse_the_same_content_addressed_blossom_blob() {
        let dir = std::env::temp_dir().join(format!("nss-branding-blob-test-{}", crate::admin::random_boot_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let branding = Branding::open(&dir, serde_json::json!({ "site": {} }));
        let bytes = Bytes::from_static(b"\x89PNG\r\n\x1a\nbranding");
        branding.store(Slot::Logo, Kind::Png, bytes.clone()).unwrap();
        branding.store(Slot::Banner, Kind::Png, bytes.clone()).unwrap();
        let files = branding.files();
        assert_eq!(files.iter().map(|(path, mime, _)| (*path, *mime)).collect::<Vec<_>>(),
            [("/branding/logo", "image/png"), ("/branding/banner", "image/png")]);
        assert_eq!(files[0].2.as_ptr(), bytes.as_ptr(), "snapshot shares bytes rather than copying images");
        let mut cfg = almond::Config::defaults();
        cfg.storage_path = dir.join("blossom");
        cfg.public_url = Some("https://tube.example".into());
        cfg.storage_min_free = 0;
        let state = almond::build_state(&cfg.validate().unwrap()).await.unwrap();
        let hash = store_blob(&state, &files[0].2, files[0].1, Some("png")).await.unwrap();
        let first = almond::services::file_storage::get_file_metadata(&state, &hash).await.unwrap();
        assert_eq!(hash, format!("{:x}", Sha256::digest(&bytes)));
        assert_eq!(first.extension.as_deref(), Some("png"));
        assert_eq!(first.mime_type.as_deref(), Some("image/png"));
        assert_eq!(first.size, bytes.len() as u64);
        let same = store_blob(&state, &files[1].2, files[1].1, Some("png")).await.unwrap();
        assert_eq!(same, hash);
        let second = almond::services::file_storage::get_file_metadata(&state, &same).await.unwrap();
        assert!(std::sync::Arc::ptr_eq(&first, &second), "the incumbent indexed blob is reused");
        branding.remove(Slot::Logo).unwrap();
        assert_eq!(branding.files().len(), 1);
        assert_eq!(files.len(), 2, "a snapshot survives later branding edits");
        let _ = std::fs::remove_dir_all(dir);
    }
}
