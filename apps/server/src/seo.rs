//! What crawlers and link previews read without running the site's JavaScript: the head of the
//! app shell for each route (title, description, canonical URL, Open Graph, Twitter player card),
//! `/sitemap.xml` and `/robots.txt`. The data comes from the public config and from the
//! instance's own relay; a video that is only on other relays gets the head of the site.

use std::{collections::BTreeMap, fmt, fmt::Write as _};

use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use nostr::{
    nips::{
        nip01::Coordinate,
        nip19::{FromBech32, Nip19, Nip19Coordinate, Nip19Event, ToBech32},
    },
    prelude::{Event, Filter, Kind, PublicKey},
};
use serde::Deserialize;

use crate::relay::Relay;

/// NIP-71 video kinds: normal and short, regular and addressable.
const VIDEO_KINDS: [u16; 4] = [21, 22, 34235, 34236];
/// The site's pages (`SITE_PAGES` in `packages/core/src/instance-config.ts`).
const PAGES: [&str; 3] = ["about", "imprint", "privacy"];
/// Longest description in a meta tag, in characters.
const DESCRIPTION_MAX: usize = 200;
/// Most URLs one sitemap file may hold (sitemaps.org).
const SITEMAP_MAX: usize = 50_000;
/// `deriveTitleFromContent` in `packages/core/src/video-event.ts`.
const UNTITLED: &str = "Untitled video";

/// The part of the public config (`/api/config`) these pages need.
#[derive(Deserialize)]
struct Public {
    origin: String,
    title: String,
    creators: Vec<PublicKey>,
    site: PublicSite,
}

#[derive(Deserialize)]
struct PublicSite {
    tagline: String,
    videos: Videos,
    pages: BTreeMap<String, BTreeMap<String, String>>,
    logo: Option<String>,
    banner: Option<String>,
    favicon: Option<String>,
}

#[derive(Deserialize)]
struct Videos {
    hidden: Vec<String>,
}

impl Public {
    fn parse(bytes: &[u8]) -> Option<Public> {
        serde_json::from_slice(bytes).map_err(|e| tracing::warn!("seo: reading the public config: {e}")).ok()
    }

    /// A page without any text does not exist on the site.
    fn has_page(&self, name: &str) -> bool {
        PAGES.contains(&name) && self.site.pages.get(name).is_some_and(|texts| !texts.is_empty())
    }

    fn absolute(&self, url: &str) -> Option<String> {
        if url.starts_with('/') {
            Some(format!("{}{url}", self.origin))
        } else {
            (url.starts_with("https://") || url.starts_with("http://")).then(|| url.to_owned())
        }
    }

    /// The creators' videos the creator did not hide (`isHiddenVideo` in core).
    fn shows(&self, ev: &Event) -> bool {
        let hidden = &self.site.videos.hidden;
        if !self.creators.contains(&ev.pubkey) || !VIDEO_KINDS.contains(&ev.kind.as_u16()) {
            return false;
        }
        if hidden.is_empty() {
            return true;
        }
        let address = ev.kind.is_addressable().then(|| format!("{}:{}:{}", ev.kind.as_u16(), ev.pubkey.to_hex(), d_tag(ev)));
        !hidden.iter().any(|h| *h == ev.id.to_hex() || address.as_ref() == Some(h))
    }
}

/// The app shell with the head for `path`.
pub async fn shell(relay: &Relay, public: &[u8], path: &str, shell: &str) -> String {
    let Some(p) = Public::parse(public) else { return shell.to_owned() };
    let video = match path.strip_prefix("/v/") {
        Some(id) => find_video(relay, &p, id).await,
        None => None,
    };
    let canonical = match &video {
        Some(v) => Some(format!("{}/v/{}", p.origin, v.link)),
        None if path == "/" || path.strip_prefix('/').is_some_and(|name| p.has_page(name)) => {
            Some(format!("{}{path}", p.origin))
        }
        None => None,
    };
    inject(shell, &head(&p, canonical.as_deref(), video.as_ref()))
}

/// `/sitemap.xml`: the start page, the pages that exist and every video of the creators in the
/// instance's relay.
pub async fn sitemap(relay: &Relay, public: &[u8]) -> Response {
    let Some(p) = Public::parse(public) else { return StatusCode::INTERNAL_SERVER_ERROR.into_response() };
    let videos = match creator_videos(relay, &p).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("seo: reading the videos for the sitemap: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    let _ = writeln!(xml, "<url><loc>{}/</loc></url>", Esc(&p.origin));
    for page in PAGES.into_iter().filter(|name| p.has_page(name)) {
        let _ = writeln!(xml, "<url><loc>{}/{page}</loc></url>", Esc(&p.origin));
    }
    for ev in videos.iter().filter(|ev| p.shows(ev)) {
        let Some(link) = link(ev) else { continue };
        let _ = write!(xml, "<url><loc>{}/v/{link}</loc>", Esc(&p.origin));
        if let Ok(at) = time::OffsetDateTime::from_unix_timestamp(ev.created_at.as_secs() as i64) {
            let _ = write!(xml, "<lastmod>{}</lastmod>", at.date());
        }
        xml.push_str("</url>\n");
    }
    xml.push_str("</urlset>\n");
    ([(header::CONTENT_TYPE, "application/xml; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], xml).into_response()
}

/// `/robots.txt`: everything may be crawled; points to the sitemap.
pub fn robots(public: &[u8]) -> Response {
    let Some(p) = Public::parse(public) else { return StatusCode::INTERNAL_SERVER_ERROR.into_response() };
    let text = format!("User-agent: *\nDisallow:\n\nSitemap: {}/sitemap.xml\n", p.origin);
    ([(header::CONTENT_TYPE, "text/plain; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], text).into_response()
}

fn video_filter(p: &Public) -> Filter {
    Filter::new().kinds(VIDEO_KINDS.map(Kind::from)).authors(p.creators.iter().copied())
}

// ponytail: one sitemap file, so at most 50 000 videos; a sitemap index when an instance has more.
async fn creator_videos(relay: &Relay, p: &Public) -> Result<Vec<Event>, crate::BoxError> {
    if p.creators.is_empty() {
        return Ok(vec![]);
    }
    relay.stored(video_filter(p).limit(SITEMAP_MAX)).await
}

/// The video a `/v/<naddr|nevent|note>` link names, like `useVideoById` on the site: only the
/// creators' videos, none the creator hid.
async fn find_video(relay: &Relay, p: &Public, id: &str) -> Option<Video> {
    if p.creators.is_empty() {
        return None;
    }
    let filter = match Nip19::from_bech32(id).ok()? {
        Nip19::Coordinate(c) => video_filter(p).author(c.coordinate.public_key).kind(c.coordinate.kind).identifier(c.coordinate.identifier),
        Nip19::Event(e) => video_filter(p).id(e.event_id),
        Nip19::EventId(id) => video_filter(p).id(id),
        _ => return None,
    };
    match relay.stored(filter.limit(1)).await {
        Ok(events) => events.first().filter(|ev| p.shows(ev)).map(Video::from_event),
        Err(e) => {
            tracing::warn!("seo: looking up video {id}: {e}");
            None
        }
    }
}

fn d_tag(ev: &Event) -> &str {
    tag(ev, "d").unwrap_or("")
}

fn tag<'a>(ev: &'a Event, name: &str) -> Option<&'a str> {
    ev.tags.iter().map(|t| t.as_slice()).find(|t| t.first().is_some_and(|n| n == name)).and_then(|t| t.get(1)).map(String::as_str)
}

/// The link the site builds for a video (`generateEventLink` in core), without relay hints:
/// naddr for an addressable video with a `d`, nevent otherwise.
fn link(ev: &Event) -> Option<String> {
    let d = d_tag(ev);
    if ev.kind.is_addressable() && !d.is_empty() {
        Nip19Coordinate::new(Coordinate::new(ev.kind, ev.pubkey).identifier(d), []).to_bech32().ok()
    } else {
        Nip19Event::new(ev.id).author(ev.pubkey).kind(ev.kind).to_bech32().ok()
    }
}

/// What the head shows of a video, read as `parseVideoEvent` in core reads it.
struct Video {
    link: String,
    title: String,
    description: String,
    image: Option<String>,
    /// The first video file and its MIME type.
    media: Option<(String, Option<String>)>,
}

impl Video {
    fn from_event(ev: &Event) -> Video {
        fn field<'a>(entries: &[(&str, &'a str)], key: &str) -> Option<&'a str> {
            entries.iter().find(|(k, _)| *k == key).map(|(_, v)| v.trim())
        }
        // `imeta` entries are "<key> <value>" strings after the tag name.
        let imeta: Vec<Vec<(&str, &str)>> = ev
            .tags
            .iter()
            .map(|t| t.as_slice())
            .filter(|t| t.first().is_some_and(|n| n == "imeta"))
            .map(|t| t[1..].iter().filter_map(|e| e.split_once(' ')).collect())
            .collect();
        let image = imeta.iter().find_map(|e| field(e, "image")).or_else(|| tag(ev, "thumb")).or_else(|| tag(ev, "image"));
        let media = imeta.iter().find_map(|e| {
            let mime = field(e, "m");
            let url = field(e, "url").filter(|_| mime.is_none_or(|m| m.starts_with("video/")))?;
            Some((url.to_owned(), mime.map(str::to_owned)))
        });
        let content = ev.content.trim();
        let alt = imeta.iter().find_map(|e| field(e, "alt")).filter(|a| !a.is_empty()).unwrap_or(content);
        let title = tag(ev, "title").filter(|t| !t.trim().is_empty()).map(str::to_owned).unwrap_or_else(|| {
            let words: Vec<&str> = alt.split_whitespace().filter(|w| !w.starts_with("https://") && !w.starts_with("http://")).collect();
            if words.is_empty() { UNTITLED.to_owned() } else { words.join(" ") }
        });
        let description = if content.is_empty() { tag(ev, "description").unwrap_or("") } else { content };
        Video {
            link: link(ev).unwrap_or_default(),
            title,
            description: clip(description),
            image: image.map(str::to_owned),
            media,
        }
    }
}

/// One line of at most `DESCRIPTION_MAX` characters.
fn clip(text: &str) -> String {
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    match line.char_indices().nth(DESCRIPTION_MAX) {
        Some((end, _)) => format!("{}…", line[..end].trim_end()),
        None => line,
    }
}

fn head(p: &Public, canonical: Option<&str>, video: Option<&Video>) -> String {
    let site_image = || p.site.banner.as_deref().or(p.site.logo.as_deref());
    let (title, og_title, description, image) = match video {
        Some(v) => (format!("{} – {}", v.title, p.title), v.title.as_str(), v.description.clone(), v.image.as_deref()),
        None => (p.title.clone(), p.title.as_str(), clip(&p.site.tagline), site_image()),
    };
    let image = image.and_then(|i| p.absolute(i));
    let mut h = String::new();
    let mut meta = |attr: &str, name: &str, content: &str| {
        let _ = write!(h, "<meta {attr}=\"{name}\" content=\"{}\" />", Esc(content));
    };
    if !description.is_empty() {
        meta("name", "description", &description);
        meta("property", "og:description", &description);
    }
    meta("property", "og:site_name", &p.title);
    meta("property", "og:title", og_title);
    meta("property", "og:type", if video.is_some() { "video.other" } else { "website" });
    if let Some(url) = canonical {
        meta("property", "og:url", url);
    }
    if let Some(image) = &image {
        meta("property", "og:image", image);
    }
    match video {
        Some(v) => {
            if let Some((url, mime)) = v.media.as_ref().and_then(|(u, m)| Some((p.absolute(u)?, m))) {
                meta("property", "og:video", &url);
                if let Some(mime) = mime {
                    meta("property", "og:video:type", mime);
                }
            }
            meta("name", "twitter:card", "player");
            meta("name", "twitter:player", &format!("{}/embed.html?v={}", p.origin, v.link));
            meta("name", "twitter:player:width", "640");
            meta("name", "twitter:player:height", "360");
        }
        None => meta("name", "twitter:card", if image.is_some() { "summary_large_image" } else { "summary" }),
    }
    let _ = write!(h, "<title>{}</title>", Esc(&title));
    if let Some(url) = canonical {
        let _ = write!(h, "<link rel=\"canonical\" href=\"{}\" />", Esc(url));
    }
    if let Some(icon) = p.site.favicon.as_deref() {
        let _ = write!(h, "<link rel=\"icon\" href=\"{}\" />", Esc(icon));
    }
    h
}

/// Replaces the shell's `<title>` (the build's placeholder) with `head`.
fn inject(shell: &str, head: &str) -> String {
    match (shell.find("<title>"), shell.find("</title>")) {
        (Some(start), Some(end)) if start < end => format!("{}{head}{}", &shell[..start], &shell[end + "</title>".len()..]),
        _ => shell.replacen("</head>", &format!("{head}</head>"), 1),
    }
}

/// Text escaped for HTML and XML text and quoted attributes.
struct Esc<'a>(&'a str);

impl fmt::Display for Esc<'_> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let mut rest = 0;
        for (i, c) in self.0.char_indices() {
            let entity = match c {
                '&' => "&amp;",
                '<' => "&lt;",
                '>' => "&gt;",
                '"' => "&quot;",
                '\'' => "&#39;",
                _ => continue,
            };
            f.write_str(&self.0[rest..i])?;
            f.write_str(entity)?;
            rest = i + 1;
        }
        f.write_str(&self.0[rest..])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relay::RelayConfig;
    use nostr::prelude::{EventBuilder, FinalizeEvent, Keys, Tag, Timestamp};

    const SHELL: &str = "<html><head><meta charset=\"UTF-8\" /><title>Loading…</title><script src=\"/a.js\"></script></head><body></body></html>";

    fn video(keys: &Keys, kind: u16, title: &str, tags: &[&[&str]]) -> Event {
        EventBuilder::new(Kind::from(kind), "A <b>long</b>\n  description")
            .tags([Tag::parse(["title", title]).unwrap()])
            .tags(tags.iter().map(|t| Tag::parse(t.iter().copied()).unwrap()))
            .custom_created_at(Timestamp::from(1_760_000_000))
            .finalize(keys)
            .unwrap()
    }

    async fn fixture() -> (Relay, Vec<u8>, Event, Event, Event) {
        let (creator, other) = (Keys::generate(), Keys::generate());
        let path = std::env::temp_dir().join(format!("nostube-seo-test-{}.sqlite", creator.public_key().to_hex()));
        let writers = vec![creator.public_key(), other.public_key()];
        let relay = Relay::open(&path, RelayConfig { writers, name: "t".into(), description: "t".into(), mirror_relays: vec![] }).unwrap();
        let shown = video(&creator, 34235, "Tom & \"Jerry\"", &[&["d", "intro"], &["imeta", "url https://cdn.example/v.mp4", "m video/mp4", "image https://cdn.example/t.jpg"]]);
        let hidden = video(&creator, 21, "Secret", &[]);
        let foreign = video(&other, 34235, "Not ours", &[&["d", "x"]]);
        for e in [&shown, &hidden, &foreign] {
            relay.ingest(e.clone()).await;
        }
        let public = serde_json::json!({
            "origin": "https://videos.example",
            "title": "My <Site>",
            "creators": [creator.public_key().to_hex()],
            "site": {
                "tagline": "Hello",
                "videos": { "hidden": [hidden.id.to_hex()] },
                "pages": { "about": { "en": "About" }, "imprint": {}, "privacy": {} },
                "banner": "/branding/banner?v=1",
            },
        });
        (relay, serde_json::to_vec(&public).unwrap(), shown, hidden, foreign)
    }

    #[tokio::test]
    async fn a_video_page_gets_the_videos_head_and_others_the_sites() {
        let (relay, public, shown, hidden, foreign) = fixture().await;
        let naddr = link(&shown).unwrap();
        let page = shell(&relay, &public, &format!("/v/{naddr}"), SHELL).await;
        assert!(!page.contains("Loading…"), "{page}");
        assert!(page.contains("<title>Tom &amp; &quot;Jerry&quot; – My &lt;Site&gt;</title>"), "{page}");
        assert!(page.contains("<meta name=\"description\" content=\"A &lt;b&gt;long&lt;/b&gt; description\" />"), "{page}");
        assert!(page.contains("<meta property=\"og:image\" content=\"https://cdn.example/t.jpg\" />"), "{page}");
        assert!(page.contains("<meta property=\"og:video\" content=\"https://cdn.example/v.mp4\" />"), "{page}");
        assert!(page.contains(&format!("<meta name=\"twitter:player\" content=\"https://videos.example/embed.html?v={naddr}\" />")), "{page}");
        assert!(page.contains(&format!("<link rel=\"canonical\" href=\"https://videos.example/v/{naddr}\" />")), "{page}");
        assert!(page.ends_with("<script src=\"/a.js\"></script></head><body></body></html>"), "{page}");

        // Hidden, someone else's, or not a video link: the site's head, no canonical URL.
        let hidden = link(&hidden).unwrap();
        for path in [format!("/v/{hidden}"), format!("/v/{}", link(&foreign).unwrap()), "/v/nope".into(), "/elsewhere".into()] {
            let page = shell(&relay, &public, &path, SHELL).await;
            assert!(page.contains("<title>My &lt;Site&gt;</title>"), "{path}: {page}");
            assert!(!page.contains("canonical"), "{path}: {page}");
        }

        let home = shell(&relay, &public, "/", SHELL).await;
        assert!(home.contains("<meta property=\"og:image\" content=\"https://videos.example/branding/banner?v=1\" />"), "{home}");
        assert!(home.contains("<link rel=\"canonical\" href=\"https://videos.example/\" />"), "{home}");
        assert!(shell(&relay, &public, "/about", SHELL).await.contains("href=\"https://videos.example/about\""));
        assert!(!shell(&relay, &public, "/imprint", SHELL).await.contains("canonical"));
    }

    #[tokio::test]
    async fn the_sitemap_lists_the_pages_that_exist_and_the_shown_videos() {
        let (relay, public, shown, ..) = fixture().await;
        let res = sitemap(&relay, &public).await;
        let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
        let xml = std::str::from_utf8(&body).unwrap();
        let locs: Vec<&str> = xml.split("<loc>").skip(1).map(|s| s.split("</loc>").next().unwrap()).collect();
        let video = format!("https://videos.example/v/{}", link(&shown).unwrap());
        assert_eq!(locs, ["https://videos.example/", "https://videos.example/about", video.as_str()], "{xml}");
        assert!(xml.contains("<lastmod>2025-10-09</lastmod>"), "{xml}");
    }
}
