//! Instance config: `<data>/config.toml`, created on first start and edited at `/admin`.
//! Existing config files still require every public field (ADR 0005).

use nostr::prelude::PublicKey;
use serde::{Deserialize, Serialize};

use crate::BoxError;

pub const GIB: u64 = 1 << 30;
/// Per-file maximum (#14): fixed, fits any MP4 the browser can produce.
pub const PER_FILE_MAX: u64 = 4 * GIB;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Raw {
    revision: u64,
    origin: String,
    title: String,
    creators: Vec<String>,
    allowed_writers: Vec<String>,
    video_sources: Vec<String>,
    interaction_relays: Vec<String>,
    search: Search,
    tls: Tls,
    #[serde(default)]
    storage: Storage,
    #[serde(default)]
    site: Site,
}

/// Same shape in TOML and in the public config JSON.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
pub enum Search {
    Off,
    Local,
    External { url: String },
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(deny_unknown_fields, tag = "mode", rename_all = "kebab-case")]
pub enum Tls {
    LocalCa {
        router_name: Option<String>,
        #[serde(default = "https_port")]
        https_port: u16,
        #[serde(default = "http_port")]
        http_port: u16,
    },
    /// TLS ends at a reverse proxy in front of the instance (Caddy, nginx, Coolify, Traefik).
    /// The server speaks plain HTTP on `port` and reads no forwarded headers: the canonical
    /// origin comes from the config, and the proxy has to pass `Host` on unchanged.
    Proxy {
        #[serde(default = "proxy_port")]
        port: u16,
    },
}

fn proxy_port() -> u16 {
    8080
}

fn https_port() -> u16 {
    443
}
fn http_port() -> u16 {
    80
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(deny_unknown_fields, default)]
pub struct Storage {
    /// Storage quota in GiB; 0 = unlimited (#14 default).
    pub quota_gib: u64,
    /// Free-space reserve in GiB (#14 default 5).
    pub free_space_reserve_gib: u64,
}

impl Default for Storage {
    fn default() -> Self {
        Storage { quota_gib: 0, free_space_reserve_gib: 5 }
    }
}

/// How the public site looks and which videos it shows.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct Site {
    /// Line under the site title; may be empty.
    pub tagline: String,
    /// Accent (primary) colour, `#rrggbb`.
    pub accent: String,
    pub font: Font,
    /// Videos the site does not show: `<kind>:<pubkey hex>:<d>` for addressable events,
    /// or the event id (64 hex) for the others. Everything else of the creators is shown.
    pub hidden_videos: Vec<String>,
    /// Where links to Nostr content outside the site go.
    pub links: Links,
}

/// URL templates with `{nip19}` where the npub, nprofile, naddr, nevent or note identifier goes.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct Links {
    pub profile: String,
    pub video: String,
    pub note: String,
}

impl Default for Links {
    fn default() -> Self {
        Links {
            profile: "https://njump.me/{nip19}".into(),
            video: "https://nostu.be/v/{nip19}".into(),
            note: "https://njump.me/{nip19}".into(),
        }
    }
}

fn check_link(name: &str, template: &str) -> Result<(), BoxError> {
    let ok = template.starts_with("https://")
        && template.len() > "https://".len()
        && template.contains("{nip19}")
        && !template.chars().any(char::is_whitespace);
    if ok {
        Ok(())
    } else {
        Err(format!("site.links.{name} must be an https URL containing {{nip19}}: {template}").into())
    }
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Font {
    Sans,
    Serif,
    Mono,
}

impl Default for Site {
    fn default() -> Self {
        Site {
            tagline: String::new(),
            accent: "#6d28d9".into(),
            font: Font::Sans,
            hidden_videos: vec![],
            links: Links::default(),
        }
    }
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn check_site(site: &Site) -> Result<(), BoxError> {
    let a = site.accent.as_bytes();
    if !(a.len() == 7 && a[0] == b'#' && a[1..].iter().all(u8::is_ascii_hexdigit)) {
        return Err(format!("site.accent must be #rrggbb: {}", site.accent).into());
    }
    check_link("profile", &site.links.profile)?;
    check_link("video", &site.links.video)?;
    check_link("note", &site.links.note)?;
    for v in &site.hidden_videos {
        let ok = is_hex64(v)
            || matches!(v.splitn(3, ':').collect::<Vec<_>>().as_slice(),
                [kind, pubkey, d] if !kind.is_empty()
                    && kind.bytes().all(|b| b.is_ascii_digit())
                    && is_hex64(pubkey)
                    && !d.is_empty()
                    && !d.chars().any(char::is_control));
        if !ok {
            return Err(format!("site.hidden_videos entry must be <kind>:<pubkey>:<d> or an event id: {v}").into());
        }
    }
    Ok(())
}

/// The fields the studio may edit (#17): origin and TLS mode are fixed in the first cut.
pub struct Edited {
    pub title: String,
    pub creators: Vec<String>,
    pub allowed_writers: Vec<String>,
    pub video_sources: Vec<String>,
    pub interaction_relays: Vec<String>,
    pub search: Search,
    pub storage: Storage,
    pub site: Site,
}

fn check_relays(video_sources: &[String], interaction_relays: &[String]) -> Result<(), BoxError> {
    for url in video_sources.iter().chain(interaction_relays) {
        if !(url.starts_with("wss://") || url.starts_with("ws://")) {
            return Err(format!("relay URL must start with ws:// or wss://: {url}").into());
        }
    }
    Ok(())
}

fn check_search(search: &Search) -> Result<(), BoxError> {
    if let Search::External { url } = search {
        if !url.starts_with("https://") {
            return Err(format!("search.url must start with https://: {url}").into());
        }
    }
    Ok(())
}

#[derive(Clone)]
pub struct Config {
    pub revision: u64,
    pub origin: String,
    /// Host part of `origin` (with port if any stripped).
    pub origin_host: String,
    pub title: String,
    pub creators: Vec<PublicKey>,
    pub allowed_writers: Vec<PublicKey>,
    pub video_sources: Vec<String>,
    pub interaction_relays: Vec<String>,
    pub search: Search,
    pub tls: Tls,
    pub storage: Storage,
    pub site: Site,
}

impl Config {
    pub fn load(path: &std::path::Path) -> Result<Config, BoxError> {
        let text = std::fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        Self::parse(&text).map_err(|e| format!("invalid {}: {e}", path.display()).into())
    }

    fn parse(text: &str) -> Result<Config, BoxError> {
        let raw: Raw = toml::from_str(text)?;
        if raw.revision == 0 {
            return Err("revision must be a positive integer".into());
        }
        let origin_host = origin_host(&raw.origin)?.to_owned();
        if raw.title.trim().is_empty() {
            return Err("title must not be empty".into());
        }
        check_relays(&raw.video_sources, &raw.interaction_relays)?;
        check_search(&raw.search)?;
        check_site(&raw.site)?;
        Ok(Config {
            revision: raw.revision,
            origin: raw.origin,
            origin_host,
            title: raw.title,
            creators: keys("creators", &raw.creators)?,
            allowed_writers: keys("allowed_writers", &raw.allowed_writers)?,
            video_sources: raw.video_sources,
            interaction_relays: raw.interaction_relays,
            search: raw.search,
            tls: raw.tls,
            storage: raw.storage,
            site: raw.site,
        })
    }

    /// Admin edit: everything except origin, TLS mode and revision (which auto-bumps,
    /// so instance builds reload on apply).
    pub fn with_edits(&self, e: &Edited) -> Result<Config, BoxError> {
        if e.title.trim().is_empty() {
            return Err("title must not be empty".into());
        }
        check_relays(&e.video_sources, &e.interaction_relays)?;
        check_search(&e.search)?;
        check_site(&e.site)?;
        Ok(Config {
            revision: self.revision + 1,
            origin: self.origin.clone(),
            origin_host: self.origin_host.clone(),
            title: e.title.trim().to_owned(),
            creators: keys("creators", &e.creators)?,
            allowed_writers: keys("allowed_writers", &e.allowed_writers)?,
            video_sources: e.video_sources.clone(),
            interaction_relays: e.interaction_relays.clone(),
            search: e.search.clone(),
            tls: self.tls.clone(),
            storage: e.storage.clone(),
            site: e.site.clone(),
        })
    }

    /// First start (no `config.toml` yet): a working fully-local default the admin
    /// can refine at `/admin` after setup — own relay as the only source, no
    /// creators yet (startPage stays null), storage limits per #14.
    pub fn default_for(origin_host: &str, https_port: u16, http_port: u16) -> Config {
        let authority = if https_port == 443 {
            origin_host.to_owned()
        } else {
            format!("{origin_host}:{https_port}")
        };
        Config {
            revision: 1,
            origin: format!("https://{authority}"),
            origin_host: origin_host.to_owned(),
            title: "My Nostube".into(),
            creators: vec![],
            allowed_writers: vec![],
            video_sources: vec![format!("wss://{authority}")],
            interaction_relays: vec![format!("wss://{authority}")],
            search: Search::Off,
            tls: Tls::LocalCa { router_name: None, https_port, http_port },
            storage: Storage::default(),
            site: Site::default(),
        }
    }

    /// First start behind a TLS-terminating proxy: the origin is given (`https://host`), the own
    /// relay is `wss://host`, and the server listens on plain HTTP on `port`.
    pub fn default_for_proxy(origin: &str, port: u16) -> Result<Config, BoxError> {
        let origin = origin.trim_end_matches('/');
        let origin_host = origin_host(origin)?.to_owned();
        let authority = origin.trim_start_matches("https://").to_owned();
        let mut cfg = Config::default_for(&origin_host, 443, 0);
        cfg.origin = origin.to_owned();
        cfg.video_sources = vec![format!("wss://{authority}")];
        cfg.interaction_relays = vec![format!("wss://{authority}")];
        cfg.tls = Tls::Proxy { port };
        Ok(cfg)
    }

    /// Back to the `<data>/config.toml` file format (same schema as `load` reads).
    pub fn to_toml(&self) -> Result<String, BoxError> {
        let raw = Raw {
            revision: self.revision,
            origin: self.origin.clone(),
            title: self.title.clone(),
            creators: self.creators.iter().map(PublicKey::to_hex).collect(),
            allowed_writers: self.allowed_writers.iter().map(PublicKey::to_hex).collect(),
            video_sources: self.video_sources.clone(),
            interaction_relays: self.interaction_relays.clone(),
            search: self.search.clone(),
            tls: self.tls.clone(),
            storage: self.storage.clone(),
            site: self.site.clone(),
        };
        Ok(toml::to_string_pretty(&raw)?)
    }

    /// Public config contract v1 (ADR 0005). Start page: the first displayed creator.
    pub fn public_json(&self) -> serde_json::Value {
        let creators: Vec<String> = self.creators.iter().map(PublicKey::to_hex).collect();
        let start_page = creators
            .first()
            .map(|c| serde_json::json!({ "kind": "creator-profile", "creator": c }));
        serde_json::json!({
            "version": 1,
            "revision": self.revision,
            "origin": self.origin,
            "title": self.title,
            "creators": creators,
            "startPage": start_page,
            "videoSources": self.video_sources,
            "interactionRelays": self.interaction_relays,
            "search": self.search,
            "site": {
                "tagline": self.site.tagline,
                "theme": { "accent": self.site.accent, "font": self.site.font },
                "videos": { "hidden": self.site.hidden_videos },
                "links": {
                    "profile": self.site.links.profile,
                    "video": self.site.links.video,
                    "note": self.site.links.note,
                },
            },
        })
    }
}

/// `https://host[:port]` with no path, query or fragment (ADR 0003 canonical origin).
fn origin_host(origin: &str) -> Result<&str, BoxError> {
    let bad = || -> BoxError { format!("origin must be https://host with no path: {origin}").into() };
    let rest = origin.strip_prefix("https://").ok_or_else(bad)?;
    if rest.is_empty() || rest.contains(['/', '?', '#', '@']) {
        return Err(bad());
    }
    let (host, port) = match rest.strip_prefix('[') {
        Some(v6) => {
            let (host, after) = v6.split_once(']').ok_or_else(bad)?;
            (host, if after.is_empty() { None } else { Some(after.strip_prefix(':').ok_or_else(bad)?) })
        }
        None => rest.split_once(':').map_or((rest, None), |(h, p)| (h, Some(p))),
    };
    if host.is_empty() || port.is_some_and(|p| p.parse::<u16>().is_err()) {
        return Err(bad());
    }
    Ok(host)
}

fn keys(field: &str, values: &[String]) -> Result<Vec<PublicKey>, BoxError> {
    values
        .iter()
        .map(|v| PublicKey::parse(v).map_err(|e| format!("{field}: invalid pubkey {v}: {e}").into()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PK: &str = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
    fn sample(extra: &str) -> String {
        format!(
            r#"revision = 3
origin = "https://flox-mac.local"
title = "Flox"
creators = ["{PK}"]
allowed_writers = ["{PK}"]
video_sources = ["wss://flox-mac.local"]
interaction_relays = []
search = {{ mode = "off" }}
tls = {{ mode = "local-ca" }}
{extra}"#
        )
    }

    #[test]
    fn valid_config_maps_to_public_contract() {
        let cfg = Config::parse(&sample("")).unwrap();
        assert_eq!(cfg.origin_host, "flox-mac.local");
        assert_eq!((cfg.storage.quota_gib, cfg.storage.free_space_reserve_gib), (0, 5));
        let json = cfg.public_json();
        assert_eq!(json["startPage"]["creator"], PK);
        assert_eq!(json["search"], serde_json::json!({ "mode": "off" }));
        assert_eq!(json["interactionRelays"], serde_json::json!([]));
        assert_eq!(json.as_object().unwrap().len(), 10);
        assert_eq!(json["site"]["theme"], serde_json::json!({ "accent": "#6d28d9", "font": "sans" }));
        assert_eq!(json["site"]["videos"], serde_json::json!({ "hidden": [] }));
    }

    #[test]
    fn no_creators_gives_null_start_page() {
        let cfg = Config::parse(&sample("").replace(&format!("creators = [\"{PK}\"]"), "creators = []")).unwrap();
        assert!(cfg.public_json()["startPage"].is_null());
    }

    #[test]
    fn rejects_missing_field_and_bad_values() {
        assert!(Config::parse(&sample("").replace("interaction_relays = []\n", "")).is_err());
        for (from, to) in [
            ("https://flox-mac.local\"", "https://flox-mac.local/x\""),
            ("https://flox-mac.local\"", "http://flox-mac.local\""),
            ("revision = 3", "revision = 0"),
            ("wss://flox-mac.local\"", "https://flox-mac.local\""),
            (PK, "nope"),
        ] {
            assert!(Config::parse(&sample("").replacen(from, to, 1)).is_err(), "{from} -> {to}");
        }
    }

    #[test]
    fn origin_host_handles_ports_and_ips() {
        assert_eq!(origin_host("https://192.168.1.5:8443").unwrap(), "192.168.1.5");
        assert_eq!(origin_host("https://[fd00::1]:8443").unwrap(), "fd00::1");
        assert!(origin_host("https://host:x").is_err());
    }

    #[test]
    fn default_config_is_loadable_and_local() {
        let cfg = Config::default_for("macbook-2.local", 9376, 0);
        assert_eq!(cfg.public_json()["origin"], "https://macbook-2.local:9376");
        assert_eq!(cfg.video_sources, vec!["wss://macbook-2.local:9376".to_owned()]);
        assert!(cfg.creators.is_empty());
        let re = Config::parse(&cfg.to_toml().unwrap()).unwrap();
        assert_eq!(re.origin_host, "macbook-2.local");
        assert_eq!(re.storage.free_space_reserve_gib, 5);
        assert!(re.public_json()["startPage"].is_null());
    }

    #[test]
    fn to_toml_roundtrips_and_apply_bumps_revision() {
        let cfg = Config::parse(&sample("")).unwrap();
        let again = Config::parse(&cfg.to_toml().unwrap()).unwrap();
        assert_eq!(again.revision, 3);
        assert_eq!(again.creators, cfg.creators);
        assert_eq!(again.search, cfg.search);
        assert_eq!(again.storage.quota_gib, 0);
        let next = cfg
            .with_edits(&Edited {
                title: "Renamed".into(),
                creators: vec![PK.into()],
                allowed_writers: vec![PK.into()],
                video_sources: vec!["wss://flox-mac.local".into()],
                interaction_relays: vec![],
                search: Search::External { url: "https://search.example".into() },
                storage: Storage { quota_gib: 100, free_space_reserve_gib: 5 },
                site: Site::default(),
            })
            .unwrap();
        assert_eq!(next.revision, 4);
        assert_eq!(next.title, "Renamed");
        assert_eq!(next.origin, cfg.origin);
        let re = Config::parse(&next.to_toml().unwrap()).unwrap();
        assert_eq!(re.search, Search::External { url: "https://search.example".into() });
        assert!(cfg
            .with_edits(&Edited {
                title: "x".into(),
                creators: vec![PK.into()],
                allowed_writers: vec![PK.into()],
                video_sources: vec!["https://nope".into()],
                interaction_relays: vec![],
                search: Search::Off,
                storage: Storage::default(),
                site: Site::default(),
            })
            .is_err());
    }

    #[test]
    fn site_settings_reach_the_public_contract() {
        let hidden = format!("34235:{PK}:intro");
        let cfg = Config::parse(&sample(&format!(
            "[site]\ntagline = \"Hello\"\naccent = \"#ff8800\"\nfont = \"serif\"\nhidden_videos = [\"{hidden}\", \"{}\"]\n",
            "a".repeat(64)
        )))
        .unwrap();
        let json = cfg.public_json();
        assert_eq!(json["site"]["tagline"], "Hello");
        assert_eq!(json["site"]["theme"], serde_json::json!({ "accent": "#ff8800", "font": "serif" }));
        assert_eq!(json["site"]["videos"]["hidden"][0], hidden.as_str());
    }

    #[test]
    fn rejects_bad_site_values() {
        for extra in [
            "[site]\naccent = \"red\"\n",
            "[site]\naccent = \"#12345\"\n",
            "[site]\nfont = \"comic\"\n",
            "[site]\nhidden_videos = [\"not-a-video\"]\n",
            "[site]\nhidden_videos = [\"34235:abc:d\"]\n",
            &format!("[site]\nhidden_videos = [\"+34235:{PK}:d\"]\n"),
            &format!("[site]\nhidden_videos = [\"34235:{PK}:a\\nb\"]\n"),
            "[site]\nunknown = 1\n",
        ] {
            assert!(Config::parse(&sample(extra)).is_err(), "{extra}");
        }
    }

    #[test]
    fn site_edits_round_trip_through_toml() {
        let cfg = Config::parse(&sample("[site]\ntagline = \"Keep me\"\naccent = \"#00aa55\"\nfont = \"mono\"\n")).unwrap();
        let edited = Edited {
            title: "Renamed".into(),
            creators: vec![PK.into()],
            allowed_writers: vec![PK.into()],
            video_sources: vec!["wss://flox-mac.local".into()],
            interaction_relays: vec![],
            search: Search::Off,
            storage: Storage::default(),
            site: Site { tagline: "New".into(), accent: "#112233".into(), font: Font::Serif, ..Site::default() },
        };
        let next = cfg.with_edits(&edited).unwrap();
        assert_eq!(next.site.tagline, "New");
        let reloaded = Config::parse(&next.to_toml().unwrap()).unwrap();
        assert_eq!(reloaded.site, next.site);
        assert_eq!(reloaded.revision, cfg.revision + 1);
        let bad = Edited { site: Site { accent: "red".into(), ..Site::default() }, ..edited };
        assert!(cfg.with_edits(&bad).is_err());
    }

    #[test]
    fn site_links_have_defaults_and_must_be_https_templates() {
        let cfg = Config::parse(&sample("")).unwrap();
        assert_eq!(cfg.public_json()["site"]["links"]["video"], "https://nostu.be/v/{nip19}");
        let custom = Config::parse(&sample(
            "[site.links]\nprofile = \"https://example.org/p/{nip19}\"\nvideo = \"https://example.org/v/{nip19}\"\nnote = \"https://example.org/n/{nip19}\"\n",
        ))
        .unwrap();
        assert_eq!(custom.site.links.profile, "https://example.org/p/{nip19}");
        for bad in [
            "profile = \"http://example.org/{nip19}\"",
            "profile = \"https://example.org/\"",
            "profile = \"https://exa mple.org/{nip19}\"",
            "profile = \"\"",
            "other = \"https://example.org/{nip19}\"",
        ] {
            assert!(Config::parse(&sample(&format!("[site.links]\n{bad}\n"))).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_proxy_config_parses_and_the_default_has_no_port_in_its_relay_urls() {
        let cfg = Config::parse(&sample("").replace("tls = { mode = \"local-ca\" }", "tls = { mode = \"proxy\" }")).unwrap();
        assert!(matches!(cfg.tls, Tls::Proxy { port: 8080 }));
        let again = Config::parse(&cfg.to_toml().unwrap()).unwrap();
        assert!(matches!(again.tls, Tls::Proxy { port: 8080 }));

        let first = Config::default_for_proxy("https://videos.example.org/", 9000).unwrap();
        assert_eq!(first.origin, "https://videos.example.org");
        assert_eq!(first.origin_host, "videos.example.org");
        assert_eq!(first.video_sources, vec!["wss://videos.example.org"]);
        assert_eq!(first.interaction_relays, vec!["wss://videos.example.org"]);
        assert!(matches!(first.tls, Tls::Proxy { port: 9000 }));
        assert!(Config::parse(&first.to_toml().unwrap()).is_ok());
        // An origin on a port keeps it in the relay URL.
        assert_eq!(
            Config::default_for_proxy("https://videos.example.org:8443", 8080).unwrap().video_sources,
            vec!["wss://videos.example.org:8443"]
        );
    }

    #[test]
    fn a_proxy_origin_must_be_https_without_a_path() {
        for bad in ["http://videos.example.org", "videos.example.org", "https://videos.example.org/app", "https://"] {
            assert!(Config::default_for_proxy(bad, 8080).is_err(), "{bad}");
        }
    }
}
