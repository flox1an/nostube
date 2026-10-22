//! Instance config: `<data>/config.toml`, created on first start and edited at `/admin`.
//! Existing config files still require every public field (ADR 0005).

use std::collections::BTreeMap;

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
    /// Newer than ADR 0005; absent = private (ADR 0012).
    #[serde(default)]
    reach: Reach,
    /// Newer than ADR 0005; absent = the instance serves the site (#157).
    #[serde(default)]
    site_hosting: SiteHosting,
    creators: Vec<String>,
    allowed_writers: Vec<String>,
    video_sources: Vec<String>,
    interaction_relays: Vec<String>,
    /// Newer than ADR 0005, so a config file without it keeps the public defaults (ADR 0008).
    #[serde(default = "default_profile_relays")]
    profile_relays: Vec<String>,
    #[serde(deserialize_with = "stored_search")]
    search: Search,
    tls: Tls,
    #[serde(default)]
    storage: Storage,
    #[serde(default)]
    site: Site,
    /// Opt-in (ADR 0009); absent = no outbox work at all.
    #[serde(default, skip_serializing_if = "Mirror::is_off")]
    mirror: Mirror,
    #[serde(default)]
    nsite: NsiteSettings,
}

/// What the instance publishes and where the site reads (ADR 0012). `private`: nothing goes out
/// but to the owner's `[mirror]` targets, and the site reads videos and interactions from the
/// instance relay only; `public`: the channel identity is announced on the Nostr network and the
/// configured relay lists are served. A signed-in visitor's own profile is looked up at public
/// indexers in both (ADR 0008).
#[derive(Deserialize, Serialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Reach {
    #[default]
    Private,
    Public,
}

/// Public DNS names only; local names and bare addresses cannot be announced.
fn is_public_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host.contains('.')
        && !host.ends_with(".local")
        && !host.ends_with(".localhost")
        && host.parse::<std::net::IpAddr>().is_err()
}

/// The origin is publicly reachable (S1): not a local-CA instance, and its host is public.
fn origin_is_public(tls: &Tls, origin_host: &str) -> bool {
    !matches!(tls, Tls::LocalCa { .. }) && is_public_host(origin_host)
}

/// A URL the public can reach: neither a local name (`.local`, `.localhost`, single label)
/// nor an IP address. LAN mirrors stay outbox targets but are announced nowhere. The scheme does
/// not count: `ws://`/`http://` on a public name is reachable, as the origin rule is about names.
pub fn is_public_url(url: &str) -> bool {
    nostr::prelude::Url::parse(url).is_ok_and(|u| {
        matches!(u.scheme(), "http" | "https" | "ws" | "wss")
            && u.username().is_empty()
            && u.password().is_none()
            && u.host_str().is_some_and(|h| is_public_host(h.trim_start_matches('[').trim_end_matches(']')))
    })
}

/// Public-only URLs, preserving owner order and treating a trailing slash as the same endpoint.
pub fn public_urls<'a>(urls: impl IntoIterator<Item = &'a String>) -> Vec<String> {
    let mut result = Vec::new();
    for url in urls {
        if is_public_url(url) {
            let url = url.trim_end_matches('/').to_owned();
            if !result.contains(&url) {
                result.push(url);
            }
        }
    }
    result
}

/// Where the creator site is served (#157): by the instance, or as an nsite (NIP-5A) under the
/// managed key, which needs public reach.
#[derive(Deserialize, Serialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SiteHosting {
    #[default]
    Instance,
    Nsite,
}

/// The nsite URL (#157): `https://<npub>.<gateway>`, or `https://<domain>` when a CNAME points
/// the owner's domain at that gateway host. Both bare host names; `domain` empty = none.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct NsiteSettings {
    pub gateway: String,
    pub domain: String,
}

impl Default for NsiteSettings {
    fn default() -> Self {
        NsiteSettings { gateway: "nsite.lol".into(), domain: String::new() }
    }
}

/// A lowercase DNS name of at least two labels: no scheme, port, path or IP address.
fn is_dns_host(host: &str) -> bool {
    let labels: Vec<&str> = host.split('.').collect();
    host.len() <= 253
        && is_public_host(host)
        && labels.len() >= 2
        && labels.iter().all(|l| {
            (1..=63).contains(&l.len())
                && !l.starts_with('-')
                && !l.ends_with('-')
                && l.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
        && !labels[labels.len() - 1].bytes().all(|b| b.is_ascii_digit())
}

fn check_nsite(nsite: &NsiteSettings) -> Result<(), BoxError> {
    if !is_dns_host(&nsite.gateway) {
        return Err(format!("nsite.gateway must be a host name like nsite.lol (no scheme, port or path): {}", nsite.gateway).into());
    }
    if !nsite.domain.is_empty() && !is_dns_host(&nsite.domain) {
        return Err(format!("nsite.domain must be a host name like videos.example.org (no scheme, port or path): {}", nsite.domain).into());
    }
    Ok(())
}

/// Same shape in TOML and in the public config JSON. `local`: the site searches the creators'
/// videos in the browser.
#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
pub enum Search {
    Off,
    Local,
}

/// `config.toml` may still hold the removed `external` mode (a URL without a specified search
/// contract); it reads as `off`, so an old file keeps starting.
fn stored_search<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Search, D::Error> {
    #[derive(Deserialize)]
    #[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
    enum Stored {
        Off,
        Local,
        External {
            #[serde(rename = "url")]
            _url: serde::de::IgnoredAny,
        },
    }
    Ok(match Stored::deserialize(d)? {
        Stored::Local => Search::Local,
        Stored::Off | Stored::External { .. } => Search::Off,
    })
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

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct Storage {
    /// Storage quota in GiB over local and S3 blobs together; 0 = unlimited (#14 default).
    pub quota_gib: u64,
    /// Free-space reserve in GiB of the local disk, which stages every upload (#14 default 5).
    pub free_space_reserve_gib: u64,
    /// S3-compatible storage for new uploads (#170); absent = this machine only. Its secret
    /// access key lives in `secrets.toml`, never here.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub s3: Option<S3Config>,
}

impl Default for Storage {
    fn default() -> Self {
        Storage { quota_gib: 0, free_space_reserve_gib: 5, s3: None }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct S3Config {
    pub endpoint: String,
    pub bucket: String,
    /// SigV4 region; `auto` suits Cloudflare R2.
    #[serde(default = "s3_region")]
    pub region: String,
    /// `<endpoint>/<bucket>` addressing (MinIO, Garage) instead of `<bucket>.<endpoint>`.
    #[serde(default)]
    pub force_path_style: bool,
    pub access_key_id: String,
}

pub fn s3_region() -> String {
    "auto".into()
}

fn check_storage(storage: &Storage) -> Result<(), BoxError> {
    storage.s3.as_ref().map_or(Ok(()), S3Config::check)
}

impl S3Config {
    /// The shape only; whether the bucket answers is the job of Almond's probe.
    pub fn check(&self) -> Result<(), BoxError> {
        let url = nostr::prelude::Url::parse(&self.endpoint).ok();
        if !url.is_some_and(|u| matches!(u.scheme(), "http" | "https") && u.host().is_some()) {
            return Err(format!("storage.s3.endpoint must be an http(s) URL: {}", self.endpoint).into());
        }
        if self.bucket.trim().is_empty() {
            return Err("storage.s3.bucket must not be empty".into());
        }
        if self.access_key_id.trim().is_empty() {
            return Err("storage.s3.access_key_id must not be empty".into());
        }
        // Almond's rule for its region option.
        if self.region.is_empty() || !self.region.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return Err(format!("storage.s3.region must be a region name such as auto or us-east-1: {}", self.region).into());
        }
        Ok(())
    }

    /// Almond's settings; the secret comes from the secrets store.
    pub fn settings(&self, secret_access_key: String) -> almond::services::native_storage::S3Settings {
        almond::services::native_storage::S3Settings {
            endpoint: self.endpoint.clone(),
            bucket: self.bucket.clone(),
            access_key_id: self.access_key_id.clone(),
            secret_access_key,
            region: self.region.clone(),
            force_path_style: self.force_path_style,
        }
    }
}

/// Where the outbox copies this instance's own content (ADR 0009): its writers' events to
/// `relays`, its blobs to `blossom`. Only targets the owner lists here; empty = off.
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct Mirror {
    pub relays: Vec<String>,
    pub blossom: Vec<String>,
}

impl Mirror {
    pub fn is_off(&self) -> bool {
        self.relays.is_empty() && self.blossom.is_empty()
    }
}

/// Relays like the other relay lists; Blossom servers over HTTPS, or HTTP for a server on the
/// LAN (as `ws://` is allowed for relays).
fn check_mirror(mirror: &Mirror) -> Result<(), BoxError> {
    check_relays(&[&mirror.relays])?;
    for url in &mirror.blossom {
        if !(url.starts_with("https://") || url.starts_with("http://")) {
            return Err(format!("mirror Blossom URL must start with https:// or http://: {url}").into());
        }
    }
    Ok(())
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
    /// The about, imprint and privacy texts; may all be empty.
    pub pages: Pages,
    /// Lightning address (`name@domain.tld`) for zaps to the managed channel identity; it goes
    /// into the derived profile as `lud16`. Empty: none.
    pub lightning: String,
    /// The curated start page; empty: no curation.
    pub homepage: SiteHomepage,
    /// Opt-in play counting: anonymous per-day counters of how often the instance's Blossom
    /// starts serving a video file; no visitor data, one year retention (roadmap phase 6).
    /// Public JSON `site.countPlays`; the standard privacy texts mention it when on.
    pub count_plays: bool,
}

/// What the start page features (public JSON `site.homepage`, camelCase there). Videos are
/// referenced like `hidden_videos`, restricted to kinds 34235/34236; empty `featured`: none.
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct SiteHomepage {
    pub intro: String,
    pub featured: String,
    pub featured_text: String,
    pub selected: Vec<String>,
    pub links: Vec<HomepageLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<HomepageLink>,
}

/// A named HTTPS link; all fields required in TOML and JSON alike.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct HomepageLink {
    pub label: String,
    pub url: String,
}

fn check_homepage(h: &SiteHomepage) -> Result<(), BoxError> {
    let is_ref = |r: &str| {
        is_hex64(r)
            || (r.chars().count() <= 1024
                && matches!(r.splitn(3, ':').collect::<Vec<_>>().as_slice(),
                    [kind, pubkey, d] if matches!(*kind, "34235" | "34236")
                        && is_hex64(pubkey)
                        && !d.is_empty()
                        && !d.chars().any(char::is_control)))
    };
    if h.intro.chars().count() > 2000 {
        return Err("site.homepage.intro must be at most 2000 characters".into());
    }
    if h.featured_text.chars().count() > 500 {
        return Err("site.homepage.featuredText must be at most 500 characters".into());
    }
    if !h.featured.is_empty() && !is_ref(&h.featured) {
        return Err(format!("site.homepage.featured must be an event id or 34235/34236:<pubkey>:<d>: {}", h.featured).into());
    }
    if h.selected.len() > 12 {
        return Err("site.homepage.selected holds at most 12 videos".into());
    }
    for (i, r) in h.selected.iter().enumerate() {
        if !is_ref(r) || h.selected[..i].contains(r) {
            return Err(format!("site.homepage.selected entries must be distinct event ids or 34235/34236:<pubkey>:<d>: {r}").into());
        }
    }
    if h.links.len() > 5 {
        return Err("site.homepage.links holds at most 5 links".into());
    }
    for link in h.links.iter().chain(&h.action) {
        let label = link.label.trim();
        let url = &link.url;
        if label.is_empty() || link.label.chars().count() > 80 {
            return Err(format!("site.homepage link label must be 1 to 80 characters: {label}").into());
        }
        let ok = url.chars().count() <= 2048
            && url.starts_with("https://")
            && !url.chars().any(|c| c.is_whitespace() || c.is_control())
            && nostr::prelude::Url::parse(url).is_ok_and(|u| {
                u.scheme() == "https"
                    && u.host_str().is_some_and(|host| !host.is_empty())
                    && u.username().is_empty()
                    && u.password().is_none()
            });
        if !ok {
            return Err(format!("site.homepage link URL must be an https URL without credentials: {url}").into());
        }
    }
    Ok(())
}

/// Longest text of one page in one language, in characters.
pub const PAGE_MAX_CHARS: usize = 20_000;

/// The texts of the optional pages (about, imprint, privacy), one per language (a two-letter
/// lowercase code such as `de`). A page without any text does not exist on the site.
#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields, default)]
pub struct Pages {
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub about: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub imprint: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub privacy: BTreeMap<String, String>,
}

fn check_pages(pages: &Pages) -> Result<(), BoxError> {
    for (page, texts) in [("about", &pages.about), ("imprint", &pages.imprint), ("privacy", &pages.privacy)] {
        for (lang, text) in texts {
            if !(lang.len() == 2 && lang.bytes().all(|b| b.is_ascii_lowercase())) {
                return Err(format!("site.pages.{page}: language must be two lowercase letters: {lang}").into());
            }
            if text.trim().is_empty() || text.chars().count() > PAGE_MAX_CHARS {
                return Err(format!(
                    "site.pages.{page}.{lang} must be a non-empty text of at most {PAGE_MAX_CHARS} characters"
                )
                .into());
            }
        }
    }
    Ok(())
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
            accent: "#8b5cf6".into(),
            font: Font::Sans,
            hidden_videos: vec![],
            links: Links::default(),
            pages: Pages::default(),
            lightning: String::new(),
            homepage: SiteHomepage::default(),
            count_plays: false,
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
    let l = &site.lightning;
    let valid = l.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty() && domain.contains('.') && !domain.contains('@')
    });
    if !l.is_empty() && (!valid || l.len() > 254 || l.chars().any(char::is_whitespace)) {
        return Err(format!("site.lightning must be a lightning address like name@domain.tld: {l}").into());
    }
    check_link("profile", &site.links.profile)?;
    check_link("video", &site.links.video)?;
    check_link("note", &site.links.note)?;
    check_pages(&site.pages)?;
    check_homepage(&site.homepage)?;
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
    pub reach: Reach,
    pub creators: Vec<String>,
    pub allowed_writers: Vec<String>,
    pub video_sources: Vec<String>,
    pub interaction_relays: Vec<String>,
    pub profile_relays: Vec<String>,
    pub search: Search,
    pub storage: Storage,
    pub site: Site,
    pub mirror: Mirror,
    /// Forced to `instance` when `reach` is private.
    pub site_hosting: SiteHosting,
    pub nsite: NsiteSettings,
}

/// Where the site looks up a signed-in visitor's profile besides the mandatory defaults, in both
/// reaches, and where the channel's kinds 0 and 10002 go in public reach (ADR 0008, 0012); the
/// same list as `DEFAULT_PROFILE_RELAYS` in `packages/core/src/instance-config.ts`.
fn default_profile_relays() -> Vec<String> {
    ["wss://purplepag.es", "wss://nos.lol", "wss://relay.damus.io"].map(String::from).to_vec()
}

fn check_relays(lists: &[&[String]]) -> Result<(), BoxError> {
    for url in lists.iter().copied().flatten() {
        if !(url.starts_with("wss://") || url.starts_with("ws://")) {
            return Err(format!("relay URL must start with ws:// or wss://: {url}").into());
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
    pub reach: Reach,
    pub creators: Vec<PublicKey>,
    pub allowed_writers: Vec<PublicKey>,
    pub video_sources: Vec<String>,
    pub interaction_relays: Vec<String>,
    /// Where the site looks up a signed-in visitor's profile besides the instance relays and the
    /// mandatory defaults (both reaches), and, in public reach, where the channel's kinds 0 and
    /// 10002 go.
    pub profile_relays: Vec<String>,
    pub search: Search,
    pub tls: Tls,
    pub storage: Storage,
    pub site: Site,
    pub mirror: Mirror,
    /// `nsite` only in public reach (#157).
    pub site_hosting: SiteHosting,
    pub nsite: NsiteSettings,
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
        check_relays(&[&raw.video_sources, &raw.interaction_relays, &raw.profile_relays])?;
        check_site(&raw.site)?;
        check_mirror(&raw.mirror)?;
        check_nsite(&raw.nsite)?;
        check_storage(&raw.storage)?;
        let cfg = Config {
            revision: raw.revision,
            origin: raw.origin,
            origin_host,
            title: raw.title,
            reach: raw.reach,
            creators: keys("creators", &raw.creators)?,
            allowed_writers: keys("allowed_writers", &raw.allowed_writers)?,
            video_sources: raw.video_sources,
            interaction_relays: raw.interaction_relays,
            profile_relays: raw.profile_relays,
            search: raw.search,
            tls: raw.tls,
            storage: raw.storage,
            site: raw.site,
            mirror: raw.mirror,
            site_hosting: raw.site_hosting,
            nsite: raw.nsite,
        };
        cfg.check_reach()?;
        Ok(cfg)
    }

    /// Admin edit: everything except origin, TLS mode and revision (which auto-bumps,
    /// so instance builds reload on apply).
    pub fn with_edits(&self, e: &Edited) -> Result<Config, BoxError> {
        if e.title.trim().is_empty() {
            return Err("title must not be empty".into());
        }
        check_relays(&[&e.video_sources, &e.interaction_relays, &e.profile_relays])?;
        check_site(&e.site)?;
        check_mirror(&e.mirror)?;
        check_nsite(&e.nsite)?;
        check_storage(&e.storage)?;
        // Blobs already in the bucket would become unreachable (#170, out of scope).
        if self.storage.s3.is_some() && e.storage.s3.is_none() {
            return Err("S3 storage cannot be turned off once enabled".into());
        }
        let cfg = Config {
            revision: self.revision + 1,
            origin: self.origin.clone(),
            origin_host: self.origin_host.clone(),
            title: e.title.trim().to_owned(),
            reach: e.reach,
            creators: keys("creators", &e.creators)?,
            allowed_writers: keys("allowed_writers", &e.allowed_writers)?,
            video_sources: e.video_sources.clone(),
            interaction_relays: e.interaction_relays.clone(),
            profile_relays: e.profile_relays.clone(),
            search: e.search,
            tls: self.tls.clone(),
            storage: e.storage.clone(),
            site: e.site.clone(),
            mirror: e.mirror.clone(),
            // Switching to private turns the nsite off (#163).
            site_hosting: if e.reach == Reach::Private { SiteHosting::Instance } else { e.site_hosting },
            nsite: e.nsite.clone(),
        };
        cfg.check_reach()?;
        Ok(cfg)
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
            title: "My videos".into(),
            reach: Reach::Private,
            creators: vec![],
            allowed_writers: vec![],
            video_sources: vec![format!("wss://{authority}")],
            interaction_relays: vec![format!("wss://{authority}")],
            profile_relays: default_profile_relays(),
            search: Search::Off,
            tls: Tls::LocalCa { router_name: None, https_port, http_port },
            storage: Storage::default(),
            site: Site::default(),
            mirror: Mirror::default(),
            site_hosting: SiteHosting::Instance,
            nsite: NsiteSettings::default(),
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
            reach: self.reach,
            site_hosting: self.site_hosting,
            creators: self.creators.iter().map(PublicKey::to_hex).collect(),
            allowed_writers: self.allowed_writers.iter().map(PublicKey::to_hex).collect(),
            video_sources: self.video_sources.clone(),
            interaction_relays: self.interaction_relays.clone(),
            profile_relays: self.profile_relays.clone(),
            search: self.search,
            tls: self.tls.clone(),
            storage: self.storage.clone(),
            site: self.site.clone(),
            mirror: self.mirror.clone(),
            nsite: self.nsite.clone(),
        };
        Ok(toml::to_string_pretty(&raw)?)
    }

    /// `wss://` on the origin's authority: this instance's own relay.
    pub fn instance_relay(&self) -> String {
        self.origin.replacen("https://", "wss://", 1)
    }

    /// The origin is publicly reachable (S1); else the instance is on the home network (S2) and
    /// only the mirrors can carry anything public.
    pub fn origin_is_public(&self) -> bool {
        origin_is_public(&self.tls, &self.origin_host)
    }

    /// The `[mirror]` relays and Blossom servers the public can reach, in config order.
    pub fn public_mirror(&self) -> Mirror {
        let relay = self.instance_relay();
        let public_origin = self.origin_is_public();
        Mirror {
            relays: public_urls(self.mirror.relays.iter().filter(|u| public_origin || u.trim_end_matches('/') != relay)),
            blossom: public_urls(self.mirror.blossom.iter().filter(|u| public_origin || u.trim_end_matches('/') != self.origin)),
        }
    }

    /// Public reach is allowed with a public origin (S1), or else with at least one publicly
    /// reachable mirror relay and Blossom server that carry everything public (S2, #161).
    pub fn can_be_public(&self) -> bool {
        let m = self.public_mirror();
        self.origin_is_public() || (!m.relays.is_empty() && !m.blossom.is_empty())
    }

    fn check_reach(&self) -> Result<(), BoxError> {
        if self.reach == Reach::Public && !self.can_be_public() {
            let m = self.public_mirror();
            let missing: Vec<&str> = [(m.relays.is_empty(), "a mirror relay"), (m.blossom.is_empty(), "a mirror Blossom server")]
                .into_iter()
                .filter_map(|(missing, what)| missing.then_some(what))
                .collect();
            return Err(format!(
                "reach public needs a public origin (not local-ca, localhost, a local name or an IP address) or publicly \
                 reachable mirrors; missing {} on a public host name",
                missing.join(" and ")
            )
            .into());
        }
        if self.site_hosting == SiteHosting::Nsite && self.reach != Reach::Public {
            return Err("site_hosting nsite needs reach public".into());
        }
        Ok(())
    }

    /// Public config contract v1 (ADR 0005). Start page: the first displayed creator. Private
    /// reach (ADR 0012) enforces the catalog and interaction relays here: the instance relay
    /// only; the stored lists stay as configured, so switching back loses nothing. Public reach
    /// without a public origin (S2, #161) serves the publicly reachable configured relays and the
    /// mirror relays, never the instance relay. Profile relays serve the visitor lookup in both
    /// reaches, excluding LAN targets. `originIsPublic` and `mirror` (the publicly reachable mirror
    /// targets) tell the server's own publishers which URLs they may announce.
    pub fn public_json(&self) -> serde_json::Value {
        let creators: Vec<String> = self.creators.iter().map(PublicKey::to_hex).collect();
        let mirror = self.public_mirror();
        let instance = self.instance_relay();
        let reachable = |configured: &[String]| {
            let own = self.origin_is_public().then_some(&instance);
            public_urls(own.into_iter().chain(configured.iter().filter(|u| u.trim_end_matches('/') != instance)).chain(&mirror.relays))
        };
        let (video_sources, interaction_relays) = match self.reach {
            Reach::Public => (reachable(&self.video_sources), reachable(&self.interaction_relays)),
            Reach::Private => (vec![instance.clone()], vec![instance.clone()]),
        };
        let start_page = creators
            .first()
            .map(|c| serde_json::json!({ "kind": "creator-profile", "creator": c }));
        serde_json::json!({
            "version": 1,
            "revision": self.revision,
            "origin": self.origin,
            "title": self.title,
            "reach": self.reach,
            "creators": creators,
            "startPage": start_page,
            "videoSources": video_sources,
            "interactionRelays": interaction_relays,
            "profileRelays": match self.reach {
                Reach::Private => self.profile_relays.clone(),
                Reach::Public => public_urls(self.profile_relays.iter().filter(|u| self.origin_is_public() || u.trim_end_matches('/') != instance)),
            },
            "search": self.search,
            "siteHosting": self.site_hosting,
            "nsite": { "gateway": self.nsite.gateway, "domain": self.nsite.domain },
            "originIsPublic": self.origin_is_public(),
            "mirror": mirror,
            "site": {
                "tagline": self.site.tagline,
                // Public anyway: the derived channel profile carries it as `lud16`.
                "lightning": self.site.lightning,
                "countPlays": self.site.count_plays,
                "theme": { "accent": self.site.accent, "font": self.site.font },
                "videos": { "hidden": self.site.hidden_videos },
                "links": {
                    "profile": self.site.links.profile,
                    "video": self.site.links.video,
                    "note": self.site.links.note,
                },
                "pages": {
                    "about": self.site.pages.about,
                    "imprint": self.site.pages.imprint,
                    "privacy": self.site.pages.privacy,
                },
                "homepage": {
                    "intro": self.site.homepage.intro,
                    "featured": self.site.homepage.featured,
                    "featuredText": self.site.homepage.featured_text,
                    "selected": self.site.homepage.selected,
                    "links": self.site.homepage.links,
                    "action": self.site.homepage.action,
                },
            },
        })
    }

    /// True when `next` changes what the process wired up at start: the writers (relay and
    /// Blossom), the storage limits and S3 settings (Blossom) or the mirror targets (relay and outbox). Everything
    /// else the studio edits is the public config and the relay's name, which apply while running.
    pub fn needs_restart(&self, next: &Config) -> bool {
        self.allowed_writers != next.allowed_writers || self.storage != next.storage || self.mirror != next.mirror
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
        assert_eq!(json["interactionRelays"], serde_json::json!(["wss://flox-mac.local"]), "private: the instance relay only");
        assert_eq!(json.as_object().unwrap().len(), 16);
        assert_eq!(json["reach"], "private");
        // A config file from before the field keeps the public profile lookup list (ADR 0008),
        // served in private reach too: the visitor lookup does not depend on reach (ADR 0012).
        assert_eq!(cfg.profile_relays, default_profile_relays());
        assert_eq!(json["profileRelays"], serde_json::json!(default_profile_relays()));
        assert_eq!(json["site"]["theme"], serde_json::json!({ "accent": "#8b5cf6", "font": "sans" }));
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
    fn an_empty_profile_relay_list_stays_local_only() {
        let cfg = Config::parse(&sample("profile_relays = []\n")).unwrap();
        assert_eq!(cfg.public_json()["profileRelays"], serde_json::json!([]));
        let again = Config::parse(&cfg.to_toml().unwrap()).unwrap();
        assert!(again.profile_relays.is_empty());
        assert!(Config::parse(&sample("profile_relays = [\"https://purplepag.es\"]\n")).is_err());
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
        // Off by default, and visible as `countPlays` in the public config when on.
        assert!(!again.site.count_plays);
        assert_eq!(cfg.public_json()["site"]["countPlays"], serde_json::json!(false));
        let counted = Config::parse(&sample("[site]\ncount_plays = true\n")).unwrap();
        assert!(counted.site.count_plays);
        assert_eq!(counted.public_json()["site"]["countPlays"], serde_json::json!(true));
        let next = cfg
            .with_edits(&Edited {
                title: "Renamed".into(),
                reach: Reach::Private,
                creators: vec![PK.into()],
                allowed_writers: vec![PK.into()],
                video_sources: vec!["wss://flox-mac.local".into()],
                interaction_relays: vec![],
                profile_relays: vec![],
                search: Search::Local,
                storage: Storage { quota_gib: 100, free_space_reserve_gib: 5, s3: None },
                site: Site::default(),
                mirror: Mirror { relays: vec!["wss://m.example".into()], blossom: vec!["https://b.example".into()] },
                site_hosting: SiteHosting::Instance,
                nsite: NsiteSettings::default(),
            })
            .unwrap();
        // Off stays out of the file; set, it survives the round trip.
        assert!(!cfg.to_toml().unwrap().contains("[mirror]"));
        assert_eq!(Config::parse(&next.to_toml().unwrap()).unwrap().mirror, next.mirror);
        assert_eq!(next.revision, 4);
        assert_eq!(next.title, "Renamed");
        assert_eq!(next.origin, cfg.origin);
        let re = Config::parse(&next.to_toml().unwrap()).unwrap();
        assert_eq!(re.search, Search::Local);
        // The removed external mode still starts, as off.
        let old = sample("").replace("search = { mode = \"off\" }", "search = { mode = \"external\", url = \"https://search.example\" }");
        assert_eq!(Config::parse(&old).unwrap().search, Search::Off);
        assert!(cfg
            .with_edits(&Edited {
                title: "x".into(),
                reach: Reach::Private,
                creators: vec![PK.into()],
                allowed_writers: vec![PK.into()],
                video_sources: vec!["https://nope".into()],
                interaction_relays: vec![],
                profile_relays: vec![],
                search: Search::Off,
                storage: Storage::default(),
                site: Site::default(),
                mirror: Mirror::default(),
                site_hosting: SiteHosting::Instance,
                nsite: NsiteSettings::default(),
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
            "[site]\nlightning = \"nobody\"\n",
            "[site]\nlightning = \"name@localhost\"\n",
            "[site]\nlightning = \"na me@domain.tld\"\n",
            "[site]\nunknown = 1\n",
            "[mirror]\nrelays = [\"https://relay.example\"]\n",
            "[mirror]\nblossom = [\"ftp://blossom.example\"]\n",
            "[mirror]\nunknown = 1\n",
        ] {
            assert!(Config::parse(&sample(extra)).is_err(), "{extra}");
        }
    }

    #[test]
    fn site_edits_round_trip_through_toml() {
        let cfg = Config::parse(&sample("[site]\ntagline = \"Keep me\"\naccent = \"#00aa55\"\nfont = \"mono\"\n")).unwrap();
        let edited = Edited {
            title: "Renamed".into(),
            reach: Reach::Private,
            creators: vec![PK.into()],
            allowed_writers: vec![PK.into()],
            video_sources: vec!["wss://flox-mac.local".into()],
            interaction_relays: vec![],
            profile_relays: vec![],
            search: Search::Off,
            storage: Storage::default(),
            site: Site { tagline: "New".into(), accent: "#112233".into(), font: Font::Serif, ..Site::default() },
            mirror: Mirror::default(),
            site_hosting: SiteHosting::Instance,
            nsite: NsiteSettings::default(),
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
    fn s3_settings_round_trip_restart_and_cannot_be_turned_off() {
        let cfg = Config::parse(&sample("[storage]\nquota_gib = 7\n")).unwrap();
        assert_eq!(cfg.storage.s3, None, "an old file starts without S3");
        let edit = |s3: Option<S3Config>| Edited {
            title: "Flox".into(),
            reach: Reach::Private,
            creators: vec![PK.into()],
            allowed_writers: vec![PK.into()],
            video_sources: vec!["wss://flox-mac.local".into()],
            interaction_relays: vec![],
            profile_relays: vec![],
            search: Search::Off,
            storage: Storage { quota_gib: 7, free_space_reserve_gib: 5, s3 },
            site: Site::default(),
            mirror: Mirror::default(),
            site_hosting: SiteHosting::Instance,
            nsite: NsiteSettings::default(),
        };
        let s3 = S3Config {
            endpoint: "https://s3.example".into(),
            bucket: "videos".into(),
            region: "auto".into(),
            force_path_style: true,
            access_key_id: "AKID".into(),
        };
        let next = cfg.with_edits(&edit(Some(s3.clone()))).unwrap();
        assert!(cfg.needs_restart(&next));
        let text = next.to_toml().unwrap();
        assert!(text.contains("[storage.s3]"), "{text}");
        assert_eq!(Config::parse(&text).unwrap().storage.s3, Some(s3.clone()));
        // Region defaults to auto, path style to off.
        let minimal = Config::parse(&sample(
            "[storage.s3]\nendpoint = \"https://r2.example\"\nbucket = \"b\"\naccess_key_id = \"k\"\n",
        ))
        .unwrap();
        let minimal = minimal.storage.s3.unwrap();
        assert_eq!((minimal.region.as_str(), minimal.force_path_style), ("auto", false));
        // The secret has no place in the file; bad values are refused.
        assert!(Config::parse(&text.replace("[storage.s3]\n", "[storage.s3]\nsecret_access_key = \"x\"\n")).is_err());
        for bad in [
            S3Config { endpoint: "s3.example".into(), ..s3.clone() },
            S3Config { bucket: " ".into(), ..s3.clone() },
            S3Config { access_key_id: String::new(), ..s3.clone() },
            S3Config { region: "us east".into(), ..s3.clone() },
        ] {
            assert!(cfg.with_edits(&edit(Some(bad.clone()))).is_err(), "{bad:?}");
        }
        // A changed bucket restarts; turning S3 off is refused.
        let moved = next.with_edits(&edit(Some(S3Config { bucket: "other".into(), ..s3 }))).unwrap();
        assert!(next.needs_restart(&moved));
        let off = next.with_edits(&edit(None)).err().unwrap().to_string();
        assert!(off.contains("cannot be turned off"), "{off}");
    }

    #[test]
    fn site_homepage_survives_save_and_reload_and_rejects_unsafe_values() {
        let cfg = Config::parse(&sample("")).unwrap();
        assert_eq!(cfg.site.homepage, SiteHomepage::default(), "an old file starts without curation");
        assert_eq!(
            cfg.public_json()["site"]["homepage"],
            serde_json::json!({ "intro": "", "featured": "", "featuredText": "", "selected": [], "links": [], "action": null })
        );
        let edit = |homepage: SiteHomepage| Edited {
            title: "Flox".into(),
            reach: Reach::Private,
            creators: vec![PK.into()],
            allowed_writers: vec![PK.into()],
            video_sources: vec!["wss://flox-mac.local".into()],
            interaction_relays: vec![],
            profile_relays: vec![],
            search: Search::Off,
            storage: Storage::default(),
            site: Site { homepage, ..Site::default() },
            mirror: Mirror::default(),
            site_hosting: SiteHosting::Instance,
            nsite: NsiteSettings::default(),
        };
        let link = |label: &str, url: &str| HomepageLink { label: label.into(), url: url.into() };
        let valid = SiteHomepage {
            intro: "Hallo — ".repeat(250),
            featured: format!("34235:{PK}:a:b"),
            featured_text: "Start here".into(),
            selected: vec!["a".repeat(64), format!("34236:{PK}:short")],
            links: vec![link("Shop", "https://shop.example/x?y=1")],
            action: Some(link("Contact", "https://example.org/contact")),
        };
        let next = cfg.with_edits(&edit(valid.clone())).unwrap();
        let reloaded = Config::parse(&next.to_toml().unwrap()).unwrap();
        assert_eq!(reloaded.site.homepage, valid);
        let json = reloaded.public_json();
        assert_eq!(json["site"]["homepage"]["featuredText"], "Start here");
        assert_eq!(json["site"]["homepage"]["featured"], format!("34235:{PK}:a:b"), "colons in d stay");
        assert_eq!(json["site"]["homepage"]["action"], serde_json::json!({ "label": "Contact", "url": "https://example.org/contact" }));

        let bad: Vec<SiteHomepage> = vec![
            SiteHomepage { intro: "x".repeat(2001), ..valid.clone() },
            SiteHomepage { featured_text: "x".repeat(501), ..valid.clone() },
            SiteHomepage { featured: format!("1:{PK}:d"), ..valid.clone() },
            SiteHomepage { featured: format!("34235:{PK}:"), ..valid.clone() },
            SiteHomepage { featured: format!("34235:{PK}:a\nb"), ..valid.clone() },
            SiteHomepage { featured: format!("34235:{PK}:{}", "d".repeat(1024)), ..valid.clone() },
            SiteHomepage { featured: "A".repeat(64), ..valid.clone() },
            SiteHomepage { selected: vec!["a".repeat(64), "a".repeat(64)], ..valid.clone() },
            SiteHomepage { selected: (0..13).map(|i| format!("34235:{PK}:{i}")).collect(), ..valid.clone() },
            SiteHomepage { links: vec![link("x", "https://a.example"); 6], ..valid.clone() },
            SiteHomepage { links: vec![link("  ", "https://a.example")], ..valid.clone() },
            SiteHomepage { links: vec![link(&"x".repeat(81), "https://a.example")], ..valid.clone() },
            SiteHomepage { links: vec![link("x", "javascript:alert(1)")], ..valid.clone() },
            SiteHomepage { links: vec![link("x", "http://a.example")], ..valid.clone() },
            SiteHomepage { links: vec![link("x", "/relative")], ..valid.clone() },
            SiteHomepage { links: vec![link("x", "https://user:pw@a.example")], ..valid.clone() },
            SiteHomepage { links: vec![link("x", "https://a.example/a b")], ..valid.clone() },
            SiteHomepage { links: vec![link("x", &format!("https://a.example/{}", "p".repeat(2048)))], ..valid.clone() },
            SiteHomepage { action: Some(link("x", "mailto:me@a.example")), ..valid.clone() },
        ];
        for homepage in bad {
            assert!(cfg.with_edits(&edit(homepage.clone())).is_err(), "{homepage:?}");
        }
        assert!(Config::parse(&sample("[site.homepage]\nfeatured = \"nope\"\n")).is_err());
        assert!(Config::parse(&sample("[site.homepage]\nunknown = 1\n")).is_err());
    }

    #[test]
    fn site_pages_are_per_language_empty_by_default_and_round_trip_through_toml() {
        let cfg = Config::parse(&sample("")).unwrap();
        assert_eq!(cfg.public_json()["site"]["pages"], serde_json::json!({ "about": {}, "imprint": {}, "privacy": {} }));
        assert!(!cfg.to_toml().unwrap().contains("pages.about"), "empty pages add no tables to the file");

        let cfg = Config::parse(&sample(
            "[site.pages.imprint]\nde = \"Zeile 1\\n\\nZeile 2\"\nen = \"Line 1\"\n[site.pages.about]\nfr = \"À propos\"\n",
        ))
        .unwrap();
        let json = cfg.public_json();
        assert_eq!(json["site"]["pages"]["imprint"]["de"], "Zeile 1\n\nZeile 2");
        assert_eq!(json["site"]["pages"]["about"]["fr"], "À propos");
        assert_eq!(Config::parse(&cfg.to_toml().unwrap()).unwrap().site.pages, cfg.site.pages);

        for bad in [
            "[site.pages.about]\ndeu = \"x\"\n",
            "[site.pages.about]\nDE = \"x\"\n",
            "[site.pages.about]\nde = \"  \"\n",
            "[site.pages.legal]\nde = \"x\"\n",
        ] {
            assert!(Config::parse(&sample(bad)).is_err(), "{bad}");
        }
        let too_long = format!("[site.pages.about]\nde = \"{}\"\n", "x".repeat(PAGE_MAX_CHARS + 1));
        assert!(Config::parse(&sample(&too_long)).is_err());
        let at_limit = format!("[site.pages.about]\nde = \"{}\"\n", "ä".repeat(PAGE_MAX_CHARS));
        assert!(Config::parse(&sample(&at_limit)).is_ok(), "the limit counts characters, not bytes");
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

    fn public_sample(extra: &str) -> String {
        sample(extra)
            .replace("https://flox-mac.local\"", "https://videos.example.org\"")
            .replace("tls = { mode = \"local-ca\" }", "tls = { mode = \"proxy\" }")
    }

    #[test]
    fn reach_defaults_to_private_and_round_trips() {
        let cfg = Config::parse(&sample("")).unwrap();
        assert_eq!(cfg.reach, Reach::Private);
        assert!(cfg.to_toml().unwrap().contains("reach = \"private\""));
        let public = Config::parse(&public_sample("reach = \"public\"\n")).unwrap();
        assert_eq!(public.reach, Reach::Public);
        assert_eq!(Config::parse(&public.to_toml().unwrap()).unwrap().reach, Reach::Public);
        assert!(Config::parse(&sample("reach = \"open\"\n")).is_err());
    }

    #[test]
    fn private_reach_narrows_catalog_and_interactions_to_the_instance_relay() {
        let text = public_sample("profile_relays = [\"wss://indexer.example\"]\n")
            .replace("interaction_relays = []", "interaction_relays = [\"wss://comments.example\"]");
        let private = Config::parse(&text).unwrap();
        let json = private.public_json();
        assert_eq!(json["reach"], "private");
        assert_eq!(json["videoSources"], serde_json::json!(["wss://videos.example.org"]));
        assert_eq!(json["interactionRelays"], serde_json::json!(["wss://videos.example.org"]));
        assert_eq!(json["profileRelays"], serde_json::json!(["wss://indexer.example"]), "visitor lookup in both reaches");
        // Enforced, not rewritten: the stored lists survive for a switch to public.
        assert_eq!(private.interaction_relays, vec!["wss://comments.example"]);
        assert_eq!(Config::parse(&private.to_toml().unwrap()).unwrap().profile_relays, vec!["wss://indexer.example"]);

        let public = Config::parse(&format!("{text}reach = \"public\"\n")).unwrap();
        let json = public.public_json();
        assert_eq!(json["reach"], "public");
        assert_eq!(json["videoSources"], serde_json::json!(["wss://videos.example.org"]));
        assert_eq!(json["interactionRelays"], serde_json::json!(["wss://videos.example.org", "wss://comments.example"]));
        assert_eq!(json["profileRelays"], serde_json::json!(["wss://indexer.example"]));
    }

    #[test]
    fn public_reach_needs_a_publicly_reachable_origin() {
        let proxy = Tls::Proxy { port: 8080 };
        assert!(origin_is_public(&proxy, "videos.example.org"));
        assert!(!origin_is_public(&Tls::LocalCa { router_name: None, https_port: 443, http_port: 80 }, "videos.example.org"));
        for host in ["flox-mac.local", "Flox-Mac.LOCAL", "192.168.1.5", "fd00::1", "localhost", "studio", "studio.localhost"] {
            assert!(!origin_is_public(&proxy, host), "{host}");
        }
        assert!(Config::parse(&sample("reach = \"public\"\n")).is_err(), "local-ca cannot be public");
        let local = Config::parse(&sample("")).unwrap();
        assert!(!local.can_be_public());
        assert!(Config::parse(&public_sample("")).unwrap().can_be_public());
        let edits = |reach| Edited {
            title: "Flox".into(),
            reach,
            creators: vec![PK.into()],
            allowed_writers: vec![PK.into()],
            video_sources: vec![],
            interaction_relays: vec![],
            profile_relays: vec![],
            search: Search::Off,
            storage: Storage::default(),
            site: Site::default(),
            mirror: Mirror::default(),
            site_hosting: SiteHosting::Instance,
            nsite: NsiteSettings::default(),
        };
        assert!(local.with_edits(&edits(Reach::Public)).is_err());
        assert!(local.with_edits(&edits(Reach::Private)).is_ok());
    }

    #[test]
    fn mirror_only_public_reach_requires_both_public_mirrors_and_filters_every_list() {
        let mut cfg = Config::default_for("tube.local", 443, 80);
        cfg.reach = Reach::Public;
        cfg.mirror.relays = vec!["ws://localhost:9000".into(), "wss://relay.example".into(), "wss://relay.example/".into()];
        assert!(cfg.check_reach().unwrap_err().to_string().contains("mirror Blossom"));
        cfg.mirror.blossom = vec!["https://blob.local".into()];
        assert!(!cfg.can_be_public());
        cfg.mirror.blossom.push("http://blobs.example".into());
        assert!(cfg.check_reach().is_ok());
        assert!(!cfg.origin_is_public());
        cfg.video_sources.extend(["ws://single-label".into(), "wss://videos.example".into()]);
        cfg.interaction_relays.push("wss://comments.localhost".into());
        cfg.profile_relays.push("wss://indexer.local".into());
        let public = cfg.public_json();
        assert_eq!(public["videoSources"], serde_json::json!(["wss://videos.example", "wss://relay.example"]));
        assert_eq!(public["interactionRelays"], serde_json::json!(["wss://relay.example"]));
        assert_eq!(public["mirror"]["blossom"], serde_json::json!(["http://blobs.example"]));
        assert!(!public["profileRelays"].as_array().unwrap().iter().any(|v| v == "wss://indexer.local"));
        assert!(Config::parse(&cfg.to_toml().unwrap()).unwrap().can_be_public());

        cfg.origin = "https://tube.example".into();
        cfg.origin_host = "tube.example".into();
        cfg.tls = Tls::Proxy { port: 8080 };
        let public = cfg.public_json();
        assert_eq!(public["videoSources"], serde_json::json!(["wss://tube.example", "wss://videos.example", "wss://relay.example"]));
        assert_eq!(public["interactionRelays"], serde_json::json!(["wss://tube.example", "wss://relay.example"]));
    }

    #[test]
    fn public_url_names_and_nsite_hosts_reject_local_names() {
        for host in ["localhost", "localhost.", "studio", "studio.localhost", "studio.LOCALHOST.", "studio.local", "127.0.0.1", "[::1]"] {
            assert!(!is_public_url(&format!("https://{host}")), "{host}");
        }
        assert!(is_public_url("http://blobs.127.0.0.1.nip.io:9000"));
        assert!(!is_public_url("ftp://blobs.example"));
        assert!(!is_public_url("https://user:secret@blobs.example"));
        for host in ["nsite.local", "nsite.localhost", "localhost", "https://nsite.lol", "nsite.lol/path", "nsite.lol:443"] {
            assert!(check_nsite(&NsiteSettings { gateway: host.into(), domain: String::new() }).is_err(), "{host}");
        }
    }

    #[test]
    fn a_local_ca_origin_cannot_count_its_own_endpoints_as_public_mirrors() {
        let mut cfg = Config::default_for("tube.example", 443, 80);
        cfg.reach = Reach::Public;
        cfg.mirror = Mirror { relays: vec!["wss://tube.example/".into()], blossom: vec!["https://tube.example/".into()] };
        assert!(!cfg.can_be_public());
        assert!(cfg.public_mirror().is_off());
    }
}
