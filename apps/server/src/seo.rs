//! What crawlers and link previews read without running the site's JavaScript: the head of the
//! app shell for each route (title, description, canonical URL, Open Graph, Twitter player card),
//! `/sitemap.xml`, `/robots.txt` and the RSS and Atom feeds. The data comes from the public config and from the
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
    prelude::{Event, Filter, Kind, PublicKey, RelayUrl},
};
use serde::Deserialize;

use crate::{branding::THEME_COLOR, relay::Relay};

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
/// Most entries a feed holds.
const FEED_MAX: usize = 100;
/// Where the feeds are served (`feed` takes `atom` for the second).
const RSS_PATH: &str = "/feed.xml";
const ATOM_PATH: &str = "/atom.xml";

/// The part of the public config (`/api/config`) these pages need.
#[derive(Deserialize)]
struct Public {
    origin: String,
    #[serde(skip)]
    relay: Option<RelayUrl>,
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
    icon: Option<String>,
}

#[derive(Deserialize)]
struct Videos {
    hidden: Vec<String>,
}

impl Public {
    fn parse(bytes: &[u8]) -> Option<Public> {
        let mut p: Self = serde_json::from_slice(bytes).map_err(|e| tracing::warn!("seo: reading the public config: {e}")).ok()?;
        // Derive once per response from the canonical origin, not an access alias or video source.
        p.relay = Some(RelayUrl::parse(&format!("wss://{}", p.origin.strip_prefix("https://")?)).ok()?);
        Some(p)
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

/// Where the site reads the public config from instead of `/api/config` (`INLINE_CONFIG_ID` in
/// `apps/site/src/site-config.ts`).
const INLINE_CONFIG_ID: &str = "nostube-config";

/// The app shell with the head for `path` and the public config inlined, so the site starts
/// without another request.
pub async fn shell(relay: &Relay, public: &[u8], path: &str, shell: &str) -> String {
    let (Some(p), Ok(json)) = (Public::parse(public), std::str::from_utf8(public)) else { return shell.to_owned() };
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
    let mut head = head(&p, canonical.as_deref(), video.as_ref());
    let _ = write!(head, "<script type=\"application/json\" id=\"{INLINE_CONFIG_ID}\">{}</script>", script_json(json));
    inject(shell, &head)
}

/// `/sitemap.xml`: the start page, the pages that exist and every video of the creators in the
/// instance's relay, each with Google's video entry when it has a thumbnail.
pub async fn sitemap(relay: &Relay, public: &[u8]) -> Response {
    let Some(p) = Public::parse(public) else { return StatusCode::INTERNAL_SERVER_ERROR.into_response() };
    let videos = match creator_videos(relay, &p).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("seo: reading the videos for the sitemap: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:video=\"http://www.google.com/schemas/sitemap-video/1.1\">\n",
    );
    let _ = writeln!(xml, "<url><loc>{}/</loc></url>", Esc(&p.origin));
    for page in PAGES.into_iter().filter(|name| p.has_page(name)) {
        let _ = writeln!(xml, "<url><loc>{}/{page}</loc></url>", Esc(&p.origin));
    }
    for v in videos.iter().filter(|ev| p.shows(ev)).map(|ev| Video::from_event(ev, &p)) {
        if v.link.is_empty() {
            continue;
        }
        let _ = write!(xml, "<url><loc>{}/v/{}</loc>", Esc(&p.origin), v.link);
        let published = iso_datetime(v.created_at);
        if let Some(at) = &published {
            let _ = write!(xml, "<lastmod>{at}</lastmod>");
        }
        // Google's video entry needs a thumbnail, a title, a description and a file or player.
        if let Some(image) = v.image.as_deref().and_then(|i| p.absolute(i)) {
            let description = if v.description.is_empty() { &v.title } else { &v.description };
            let _ = write!(
                xml,
                "<video:video><video:thumbnail_loc>{}</video:thumbnail_loc><video:title>{}</video:title><video:description>{}</video:description>",
                Esc(&image),
                Esc(&v.title),
                Esc(description)
            );
            if let Some(url) = v.media.as_ref().and_then(|(u, _)| p.absolute(u)) {
                let _ = write!(xml, "<video:content_loc>{}</video:content_loc>", Esc(&url));
            }
            let _ = write!(xml, "<video:player_loc>{}</video:player_loc>", Esc(&embed_url(&p, &v.link)));
            if let Some(secs) = v.duration.filter(|s| (1..=28_800).contains(s)) {
                let _ = write!(xml, "<video:duration>{secs}</video:duration>");
            }
            if let Some(at) = &published {
                let _ = write!(xml, "<video:publication_date>{at}</video:publication_date>");
            }
            xml.push_str("</video:video>");
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

/// `/feed.xml` (RSS 2.0) and `/atom.xml` (Atom): the newest shown videos of the creators, newest
/// first, each with its playable file as enclosure.
pub async fn feed(relay: &Relay, public: &[u8], atom: bool) -> Response {
    let Some(p) = Public::parse(public) else { return StatusCode::INTERNAL_SERVER_ERROR.into_response() };
    let events = if p.creators.is_empty() { Ok(vec![]) } else { relay.stored(video_filter(&p).limit(FEED_MAX)).await };
    let events = match events {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("seo: reading the videos for the feed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let videos: Vec<Video> = events.iter().filter(|ev| p.shows(ev)).map(|ev| Video::from_event(ev, &p)).filter(|v| !v.link.is_empty()).collect();
    let (xml, mime) = if atom { (atom_feed(&p, &videos), "application/atom+xml") } else { (rss_feed(&p, &videos), "application/rss+xml") };
    ([(header::CONTENT_TYPE, format!("{mime}; charset=utf-8")), (header::CACHE_CONTROL, "no-cache".to_owned())], xml).into_response()
}

/// The file's absolute URL, MIME type and size in bytes (0 when unknown: RSS requires a length).
fn enclosure(p: &Public, v: &Video) -> Option<(String, String, u64)> {
    let (url, mime) = v.media.as_ref()?;
    Some((p.absolute(url)?, mime.clone().unwrap_or_else(|| "video/mp4".to_owned()), v.size.unwrap_or(0)))
}

fn rss_feed(p: &Public, videos: &[Video]) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\" xmlns:media=\"http://search.yahoo.com/mrss/\">\n<channel>\n",
    );
    let description = if p.site.tagline.trim().is_empty() { &p.title } else { &p.site.tagline };
    let _ = writeln!(xml, "<title>{}</title>\n<link>{}/</link>\n<description>{}</description>", Esc(&p.title), Esc(&p.origin), Esc(description));
    let _ = writeln!(xml, "<atom:link href=\"{}{RSS_PATH}\" rel=\"self\" type=\"application/rss+xml\" />", Esc(&p.origin));
    if let Some(at) = videos.first().and_then(|v| rfc2822(v.created_at)) {
        let _ = writeln!(xml, "<lastBuildDate>{at}</lastBuildDate>");
    }
    for v in videos {
        let url = format!("{}/v/{}", p.origin, v.link);
        let _ = write!(xml, "<item><title>{}</title><link>{}</link><guid isPermaLink=\"true\">{}</guid>", Esc(&v.title), Esc(&url), Esc(&url));
        if let Some(at) = rfc2822(v.created_at) {
            let _ = write!(xml, "<pubDate>{at}</pubDate>");
        }
        if !v.description.is_empty() {
            let _ = write!(xml, "<description>{}</description>", Esc(&v.description));
        }
        if let Some((file, mime, size)) = enclosure(p, v) {
            let _ = write!(xml, "<enclosure url=\"{}\" length=\"{size}\" type=\"{}\" /><media:content url=\"{}\" type=\"{}\" medium=\"video\" />", Esc(&file), Esc(&mime), Esc(&file), Esc(&mime));
        }
        xml.push_str("</item>\n");
    }
    xml.push_str("</channel>\n</rss>\n");
    xml
}

fn atom_feed(p: &Public, videos: &[Video]) -> String {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<feed xmlns=\"http://www.w3.org/2005/Atom\" xmlns:media=\"http://search.yahoo.com/mrss/\">\n");
    let updated = iso_datetime(videos.first().map_or_else(|| nostr::prelude::Timestamp::now().as_secs(), |v| v.created_at)).unwrap_or_default();
    let _ = writeln!(xml, "<id>{}/</id>\n<title>{}</title>\n<updated>{updated}</updated>", Esc(&p.origin), Esc(&p.title));
    if !p.site.tagline.trim().is_empty() {
        let _ = writeln!(xml, "<subtitle>{}</subtitle>", Esc(&p.site.tagline));
    }
    let _ = writeln!(xml, "<link rel=\"alternate\" href=\"{}/\" />\n<link rel=\"self\" type=\"application/atom+xml\" href=\"{}{ATOM_PATH}\" />", Esc(&p.origin), Esc(&p.origin));
    for v in videos {
        let url = format!("{}/v/{}", p.origin, v.link);
        let at = iso_datetime(v.created_at).unwrap_or_default();
        let _ = write!(xml, "<entry><id>{}</id><title>{}</title><link rel=\"alternate\" href=\"{}\" /><updated>{at}</updated><published>{at}</published>", Esc(&url), Esc(&v.title), Esc(&url));
        // Atom requires an author per entry or on the feed; every video here is the instance's.
        let _ = write!(xml, "<author><name>{}</name></author>", Esc(&p.title));
        if !v.description.is_empty() {
            let _ = write!(xml, "<summary>{}</summary>", Esc(&v.description));
        }
        if let Some((file, mime, size)) = enclosure(p, v) {
            let _ = write!(xml, "<link rel=\"enclosure\" href=\"{}\" type=\"{}\" length=\"{size}\" /><media:content url=\"{}\" type=\"{}\" medium=\"video\" />", Esc(&file), Esc(&mime), Esc(&file), Esc(&mime));
        }
        xml.push_str("</entry>\n");
    }
    xml.push_str("</feed>\n");
    xml
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
        Ok(events) => events.first().filter(|ev| p.shows(ev)).map(|ev| Video::from_event(ev, p)),
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

/// A video's NIP-19 address with the relays where it can be retrieved.
fn link(ev: &Event, relays: impl IntoIterator<Item = RelayUrl>) -> Option<String> {
    let d = d_tag(ev);
    if ev.kind.is_addressable() && !d.is_empty() {
        Nip19Coordinate::new(Coordinate::new(ev.kind, ev.pubkey).identifier(d), relays).to_bech32().ok()
    } else {
        Nip19Event::new(ev.id).author(ev.pubkey).kind(ev.kind).relays(relays).to_bech32().ok()
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
    created_at: u64,
    /// Whole seconds, from `imeta` or the `duration` tag.
    duration: Option<u64>,
    /// Bytes, from `imeta`.
    size: Option<u64>,
}

impl Video {
    fn from_event(ev: &Event, p: &Public) -> Video {
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
        let duration = imeta
            .iter()
            .find_map(|e| field(e, "duration"))
            .or_else(|| tag(ev, "duration"))
            .and_then(|d| d.parse::<f64>().ok())
            .filter(|d| d.is_finite() && *d >= 0.5)
            .map(|d| d.round() as u64);
        Video {
            link: link(ev, p.relay.iter().cloned()).unwrap_or_default(),
            title,
            description: clip(description),
            image: image.map(str::to_owned),
            media,
            created_at: ev.created_at.as_secs(),
            duration,
            size: imeta.iter().find_map(|e| field(e, "size")).and_then(|s| s.parse().ok()),
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

fn embed_url(p: &Public, link: &str) -> String {
    format!("{}/embed.html?v={link}", p.origin)
}

/// `2026-10-12T08:30:00Z` (W3C datetime, as sitemaps and schema.org take it).
fn iso_datetime(secs: u64) -> Option<String> {
    let at = time::OffsetDateTime::from_unix_timestamp(secs as i64).ok()?;
    Some(format!("{}T{:02}:{:02}:{:02}Z", at.date(), at.hour(), at.minute(), at.second()))
}

/// `Sun, 12 Oct 2026 08:30:00 GMT` (RFC 822 as RSS takes it).
fn rfc2822(secs: u64) -> Option<String> {
    let at = time::OffsetDateTime::from_unix_timestamp(secs as i64).ok()?;
    let (day, month) = (at.weekday().to_string(), at.month().to_string());
    Some(format!("{}, {:02} {} {} {:02}:{:02}:{:02} GMT", &day[..3], at.day(), &month[..3], at.year(), at.hour(), at.minute(), at.second()))
}

/// JSON for a `<script>` element: `<` as `\u003c`, so nothing in it can end the element early.
fn script_json(json: &str) -> String {
    json.replace('<', "\\u003c")
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
            let media = v.media.as_ref().and_then(|(u, m)| Some((p.absolute(u)?, m)));
            if let Some((url, mime)) = &media {
                meta("property", "og:video", url);
                if let Some(mime) = mime {
                    meta("property", "og:video:type", mime);
                }
            }
            let embed = embed_url(p, &v.link);
            meta("name", "twitter:card", "player");
            meta("name", "twitter:player", &embed);
            meta("name", "twitter:player:width", "640");
            meta("name", "twitter:player:height", "360");
            // schema.org VideoObject for Google's video results; it needs a thumbnail.
            if let Some(image) = &image {
                let mut ld = serde_json::json!({
                    "@context": "https://schema.org",
                    "@type": "VideoObject",
                    "name": v.title,
                    "thumbnailUrl": [image],
                    "uploadDate": iso_datetime(v.created_at),
                    "embedUrl": embed,
                });
                if !description.is_empty() {
                    ld["description"] = description.as_str().into();
                }
                if let Some(url) = canonical {
                    ld["url"] = url.into();
                }
                if let Some((url, _)) = &media {
                    ld["contentUrl"] = url.as_str().into();
                }
                if let Some(secs) = v.duration {
                    ld["duration"] = format!("PT{secs}S").into();
                }
                let _ = write!(h, "<script type=\"application/ld+json\">{}</script>", script_json(&ld.to_string()));
            }
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
    // Installable: the manifest, the home screen icon for iOS (which ignores the manifest's) and the
    // colours of the window an installed site opens in.
    let touch_icon = p.site.icon.as_deref().unwrap_or("/apple-touch-icon.png");
    let _ = write!(
        h,
        "<link rel=\"manifest\" href=\"/manifest.webmanifest\" /><link rel=\"apple-touch-icon\" href=\"{}\" />\
         <meta name=\"theme-color\" content=\"{THEME_COLOR}\" /><meta name=\"mobile-web-app-capable\" content=\"yes\" />\
         <meta name=\"apple-mobile-web-app-capable\" content=\"yes\" /><meta name=\"apple-mobile-web-app-title\" content=\"{}\" />",
        Esc(touch_icon),
        Esc(&p.title),
    );
    let _ = write!(h, "<link rel=\"alternate\" type=\"application/rss+xml\" title=\"{}\" href=\"{}{RSS_PATH}\" />", Esc(&p.title), Esc(&p.origin));
    let _ = write!(h, "<link rel=\"alternate\" type=\"application/atom+xml\" title=\"{}\" href=\"{}{ATOM_PATH}\" />", Esc(&p.title), Esc(&p.origin));
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
        let shown = video(&creator, 34235, "Tom & \"Jerry\"", &[&["d", "intro"], &["imeta", "url https://cdn.example/v.mp4", "m video/mp4", "image https://cdn.example/t.jpg", "duration 61.4"]]);
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
    async fn published_video_urls_locate_both_video_kinds_on_the_canonical_relay() {
        let (relay, public, addressable, regular, _) = fixture().await;
        let mut public: serde_json::Value = serde_json::from_slice(&public).unwrap();
        public["origin"] = "https://videos.example:8443".into();
        public["videoSources"] = serde_json::json!(["wss://elsewhere.example"]);
        public["site"]["videos"]["hidden"] = serde_json::json!([]);
        let public = serde_json::to_vec(&public).unwrap();
        let sitemap = axum::body::to_bytes(sitemap(&relay, &public).await.into_body(), usize::MAX).await.unwrap();
        let sitemap = std::str::from_utf8(&sitemap).unwrap();
        let rss = axum::body::to_bytes(feed(&relay, &public, false).await.into_body(), usize::MAX).await.unwrap();
        let atom = axum::body::to_bytes(feed(&relay, &public, true).await.into_body(), usize::MAX).await.unwrap();
        for ev in [&addressable, &regular] {
            // A previously shared identifier without hints must still resolve.
            let old_id = link(ev, []).unwrap();
            let page = shell(&relay, &public, &format!("/v/{old_id}"), SHELL).await;
            let canonical = page.split("<link rel=\"canonical\" href=\"").nth(1).unwrap().split('"').next().unwrap();
            let id = canonical.strip_prefix("https://videos.example:8443/v/").unwrap();
            let relays = match Nip19::from_bech32(id).unwrap() {
                Nip19::Coordinate(c) => {
                    assert_eq!(c.coordinate, Coordinate::new(ev.kind, ev.pubkey).identifier(d_tag(ev)));
                    c.relays
                }
                Nip19::Event(e) => {
                    assert_eq!(e.event_id, ev.id);
                    assert_eq!(e.author, Some(ev.pubkey));
                    assert_eq!(e.kind, Some(ev.kind));
                    e.relays
                }
                other => panic!("unexpected video identifier: {other:?}"),
            };
            assert_eq!(relays.iter().map(|r| r.as_str()).collect::<Vec<_>>(), ["wss://videos.example:8443"]);
            assert!(page.contains(&format!("property=\"og:url\" content=\"{canonical}\"")), "{page}");
            assert!(page.contains(&format!("/embed.html?v={id}")), "{page}");
            assert!(sitemap.contains(canonical), "{sitemap}");
            // Only the addressable fixture has the thumbnail required for a video sitemap entry.
            if ev.id == addressable.id {
                assert!(sitemap.contains(&format!("/embed.html?v={id}")), "{sitemap}");
                let ld = page.split("application/ld+json\">").nth(1).unwrap().split("</script>").next().unwrap();
                let ld: serde_json::Value = serde_json::from_str(ld).unwrap();
                assert_eq!(ld["url"], canonical);
            }
            assert!(std::str::from_utf8(&rss).unwrap().contains(canonical));
            assert!(std::str::from_utf8(&atom).unwrap().contains(canonical));
        }
    }

    #[tokio::test]
    async fn a_video_page_gets_the_videos_head_and_others_the_sites() {
        let (relay, public, shown, hidden, foreign) = fixture().await;
        let naddr = link(&shown, [RelayUrl::parse("wss://videos.example").unwrap()]).unwrap();
        let page = shell(&relay, &public, &format!("/v/{naddr}"), SHELL).await;
        assert!(!page.contains("Loading…"), "{page}");
        assert!(page.contains("<title>Tom &amp; &quot;Jerry&quot; – My &lt;Site&gt;</title>"), "{page}");
        assert!(page.contains("<meta name=\"description\" content=\"A &lt;b&gt;long&lt;/b&gt; description\" />"), "{page}");
        assert!(page.contains("<meta property=\"og:image\" content=\"https://cdn.example/t.jpg\" />"), "{page}");
        assert!(page.contains("<meta property=\"og:video\" content=\"https://cdn.example/v.mp4\" />"), "{page}");
        assert!(page.contains(&format!("<meta name=\"twitter:player\" content=\"https://videos.example/embed.html?v={naddr}\" />")), "{page}");
        assert!(page.contains(&format!("<link rel=\"canonical\" href=\"https://videos.example/v/{naddr}\" />")), "{page}");
        assert!(page.ends_with("<script src=\"/a.js\"></script></head><body></body></html>"), "{page}");

        // The public config goes along as it is, with nothing in it that could end the element.
        let inline = page.split("id=\"nostube-config\">").nth(1).unwrap().split("</script>").next().unwrap();
        assert!(!inline.contains('<'), "{inline}");
        assert_eq!(serde_json::from_str::<serde_json::Value>(inline).unwrap(), serde_json::from_slice::<serde_json::Value>(&public).unwrap());
        let ld = page.split("application/ld+json\">").nth(1).unwrap().split("</script>").next().unwrap();
        let ld: serde_json::Value = serde_json::from_str(ld).unwrap();
        assert_eq!(ld["@type"], "VideoObject");
        assert_eq!(ld["name"], "Tom & \"Jerry\"");
        assert_eq!(ld["thumbnailUrl"][0], "https://cdn.example/t.jpg");
        assert_eq!(ld["uploadDate"], "2025-10-09T08:53:20Z");
        assert_eq!(ld["contentUrl"], "https://cdn.example/v.mp4");
        assert_eq!(ld["duration"], "PT61S");

        // Hidden, someone else's, or not a video link: the site's head, no canonical URL.
        let hidden = link(&hidden, []).unwrap();
        for path in [format!("/v/{hidden}"), format!("/v/{}", link(&foreign, []).unwrap()), "/v/nope".into(), "/elsewhere".into()] {
            let page = shell(&relay, &public, &path, SHELL).await;
            assert!(page.contains("<title>My &lt;Site&gt;</title>"), "{path}: {page}");
            assert!(!page.contains("canonical") && !page.contains("ld+json"), "{path}: {page}");
            assert!(page.contains("id=\"nostube-config\""), "{path}: {page}");
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
        let video = format!("https://videos.example/v/{}", link(&shown, [RelayUrl::parse("wss://videos.example").unwrap()]).unwrap());
        assert_eq!(locs, ["https://videos.example/", "https://videos.example/about", video.as_str()], "{xml}");
        assert!(xml.contains("<lastmod>2025-10-09T08:53:20Z</lastmod>"), "{xml}");
        assert!(xml.contains("<video:video><video:thumbnail_loc>https://cdn.example/t.jpg</video:thumbnail_loc><video:title>Tom &amp; &quot;Jerry&quot;</video:title><video:description>A &lt;b&gt;long&lt;/b&gt; description</video:description><video:content_loc>https://cdn.example/v.mp4</video:content_loc>"), "{xml}");
        assert!(xml.contains("<video:duration>61</video:duration><video:publication_date>2025-10-09T08:53:20Z</video:publication_date></video:video>"), "{xml}");
    }

    #[tokio::test]
    async fn the_feeds_list_the_shown_videos_with_an_enclosure_and_every_page_links_them() {
        let (relay, public, shown, hidden, foreign) = fixture().await;
        let url = format!("https://videos.example/v/{}", link(&shown, [RelayUrl::parse("wss://videos.example").unwrap()]).unwrap());
        for atom in [false, true] {
            let res = feed(&relay, &public, atom).await;
            let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
            let xml = std::str::from_utf8(&body).unwrap();
            assert_eq!(xml.matches(if atom { "<entry>" } else { "<item>" }).count(), 1, "{xml}");
            assert!(xml.contains(&url) && xml.contains("<title>Tom &amp; &quot;Jerry&quot;</title>"), "{xml}");
            assert!(xml.contains("https://cdn.example/v.mp4"), "{xml}");
            for other in [&hidden, &foreign] {
                assert!(!xml.contains(&link(other, [RelayUrl::parse("wss://videos.example").unwrap()]).unwrap()), "{xml}");
            }
            if !atom {
                assert!(xml.contains("<pubDate>Thu, 09 Oct 2025 08:53:20 GMT</pubDate>"), "{xml}");
                assert!(xml.contains("<enclosure url=\"https://cdn.example/v.mp4\" length=\"0\" type=\"video/mp4\" />"), "{xml}");
            }
        }
        let home = shell(&relay, &public, "/", SHELL).await;
        assert!(home.contains("rel=\"alternate\" type=\"application/rss+xml\" title=\"My &lt;Site&gt;\" href=\"https://videos.example/feed.xml\""), "{home}");
        assert!(home.contains("type=\"application/atom+xml\" title=\"My &lt;Site&gt;\" href=\"https://videos.example/atom.xml\""), "{home}");
    }

    #[tokio::test]
    async fn every_page_is_installable_with_the_uploaded_icon_or_nostubes() {
        let (relay, public, ..) = fixture().await;
        let mut with_icon: serde_json::Value = serde_json::from_slice(&public).unwrap();
        with_icon["site"]["icon"] = "/branding/icon?v=abc".into();
        let with_icon = serde_json::to_vec(&with_icon).unwrap();
        for (public, icon) in [(public, "/apple-touch-icon.png"), (with_icon, "/branding/icon?v=abc")] {
            for path in ["/", "/about", "/v/nope", "/elsewhere"] {
                let page = shell(&relay, &public, path, SHELL).await;
                for tag in [
                    "<link rel=\"manifest\" href=\"/manifest.webmanifest\" />".to_owned(),
                    format!("<link rel=\"apple-touch-icon\" href=\"{icon}\" />"),
                    format!("<meta name=\"theme-color\" content=\"{THEME_COLOR}\" />"),
                    "<meta name=\"mobile-web-app-capable\" content=\"yes\" />".to_owned(),
                    "<meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />".to_owned(),
                    "<meta name=\"apple-mobile-web-app-title\" content=\"My &lt;Site&gt;\" />".to_owned(),
                ] {
                    assert!(page.contains(&tag), "{path}: {tag} missing in {page}");
                }
            }
        }
    }
}
