//! Instance branding (ADR 0005 addendum): a logo, a favicon and a banner, one image per slot in
//! `<data>/branding/<slot>.<ext>`, served at `/branding/<slot>` and announced in the public config
//! as `site.logo`, `site.favicon` and `site.banner`. The images are small, so they are held in
//! memory; an upload or a removal rebuilds the public config bytes, no restart needed.

use std::path::{Path, PathBuf};

use axum::{
    body::Bytes,
    http::{header, HeaderMap, StatusCode},
    response::{AppendHeaders, IntoResponse, Response},
};
use parking_lot::RwLock;
use sha2::{Digest, Sha256};

const KIB: usize = 1024;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Slot {
    Logo,
    Favicon,
    Banner,
}

impl Slot {
    const ALL: [Slot; 3] = [Slot::Logo, Slot::Favicon, Slot::Banner];

    pub fn parse(name: &str) -> Option<Slot> {
        Self::ALL.into_iter().find(|s| s.name() == name)
    }

    pub fn name(self) -> &'static str {
        match self {
            Slot::Logo => "logo",
            Slot::Favicon => "favicon",
            Slot::Banner => "banner",
        }
    }

    pub fn max_bytes(self) -> usize {
        match self {
            Slot::Banner => 2048 * KIB,
            Slot::Logo | Slot::Favicon => 512 * KIB,
        }
    }

    /// ICO is a favicon format only.
    pub fn accepts(self, kind: Kind) -> bool {
        kind != Kind::Ico || self == Slot::Favicon
    }

    pub fn types(self) -> &'static str {
        match self {
            Slot::Favicon => "PNG, JPEG, WebP, SVG or ICO",
            Slot::Logo | Slot::Banner => "PNG, JPEG, WebP or SVG",
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

    fn ext(self) -> &'static str {
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
    assets: [Option<Asset>; 3],
    public_config: Bytes,
}

pub struct Branding {
    dir: PathBuf,
    /// `Config::public_json` of this run; the branding URLs go into its `site`.
    base: serde_json::Value,
    state: RwLock<State>,
}

impl Branding {
    /// Loads what `<data>/branding/` holds. An unreadable or wrong file is left out with a warning:
    /// branding never keeps the instance from starting.
    pub fn open(data: &Path, public_json: serde_json::Value) -> Branding {
        let dir = data.join("branding");
        let assets = Slot::ALL.map(|slot| load(&dir, slot));
        let public_config = build(&public_json, &assets);
        Branding { dir, base: public_json, state: RwLock::new(State { assets, public_config }) }
    }

    /// The serialized public config (`/api/config`) with the current branding URLs.
    pub fn public_config(&self) -> Bytes {
        self.state.read().public_config.clone()
    }

    /// `{logo, favicon, banner}`: each the URL, or null when the slot is empty.
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
        state.public_config = build(&self.base, &state.assets);
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
        state.public_config = build(&self.base, &state.assets);
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

fn file_name(slot: Slot, kind: Kind) -> String {
    format!("{}.{}", slot.name(), kind.ext())
}

/// The slot's newest file, if it is what its name says and within the limit.
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
        Ok(bytes) if Kind::sniff(&bytes) == Some(kind) && bytes.len() <= slot.max_bytes() => {
            Some(Asset::new(kind, bytes.into()))
        }
        Ok(_) => {
            tracing::warn!("branding: ignoring {}: not a {} file within the limit", path.display(), kind.ext());
            None
        }
        Err(e) => {
            tracing::warn!("branding: cannot read {}: {e}", path.display());
            None
        }
    }
}

fn build(base: &serde_json::Value, assets: &[Option<Asset>; 3]) -> Bytes {
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
}
