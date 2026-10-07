//! Instance config: `<data>/config.toml`, written by hand until the admin area exists.
//! Every field the public config (ADR 0005) exposes is required here too: no app defaults.

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

/// The fields the admin may edit (#17): origin and TLS mode are fixed in the first cut.
pub struct Edited {
    pub title: String,
    pub creators: Vec<String>,
    pub allowed_writers: Vec<String>,
    pub video_sources: Vec<String>,
    pub interaction_relays: Vec<String>,
    pub search: Search,
    pub storage: Storage,
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
        })
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
        assert_eq!(json.as_object().unwrap().len(), 9);
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
            })
            .is_err());
    }
}
