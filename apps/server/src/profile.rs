//! The channel identity's profile (#129): while the server holds the managed key (ADR 0007), the
//! channel's kind 0 is derived from the site settings (title, tagline, logo, banner) and stored in
//! the instance relay, from where the outbox mirrors it like any other event (ADR 0009). In public
//! reach (ADR 0012) the channel's relay list (kind 10002) joins it; its Blossom server list
//! (kind 10063) is derived in both reaches. The outbox delivers all three to indexers only in
//! public reach. In own identity nothing is signed. Both identities answer NIP-05 lookups.

use nostr::prelude::*;
use serde_json::{Map, Value};

use crate::{branding::Branding, config::{is_public_url, public_urls}, outbox::Outbox, relay::Relay};

/// One sync at a time, so the newest settings always end in the newest profile.
static SYNC: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn is_public(public: &Value) -> bool {
    public["reach"] == "public"
}

fn public_origin(public: &Value) -> bool {
    public["originIsPublic"].as_bool().unwrap_or(false)
}

fn blossom_servers(public: &Value) -> Vec<String> {
    let origin = public["origin"].as_str().unwrap_or_default().to_owned();
    let mirrors: Vec<String> = serde_json::from_value(public["mirror"]["blossom"].clone()).unwrap_or_default();
    public_urls(public_origin(public).then_some(&origin).into_iter().chain(&mirrors))
}

/// The profile from the public config: `name` is the title, `about` the tagline, `picture` and
/// `banner` the branding images as absolute URLs, `lud16` the lightning address, `nip05` the
/// instance's NIP-05 name `_@<origin host>`. An empty or missing value leaves the field out.
fn derive(public: &Value) -> Value {
    let origin = public["origin"].as_str().unwrap_or_default();
    let site = &public["site"];
    let image = |slot: &str| site[slot].as_str().and_then(|url| {
        let url = if url.starts_with('/') { format!("{origin}{url}") } else { url.to_owned() };
        (is_public_url(&url) && (public_origin(public) || !url.starts_with(origin))).then_some(url)
    });
    let host = public_origin(public).then(|| Url::parse(origin).ok().and_then(|url| url.host_str().map(str::to_owned))).flatten();
    [
        ("name", public["title"].as_str().map(str::to_owned)),
        ("about", site["tagline"].as_str().map(str::to_owned)),
        ("picture", image("logo")),
        ("banner", image("banner")),
        ("lud16", site["lightning"].as_str().map(str::to_owned)),
        ("nip05", host.map(|host| format!("_@{host}"))),
    ]
    .into_iter()
    .filter_map(|(field, value)| Some((field.to_owned(), Value::from(value.filter(|v| !v.is_empty())?))))
    .collect::<Map<_, _>>()
    .into()
}

/// The announced relay list: public instance first in S1, public mirrors only in S2.
/// Private NIP-05 lookups keep the local instance relay, without announcing it to indexers.
fn relays(public: &Value, mirror: &[String]) -> Vec<String> {
    let instance = public["origin"].as_str().unwrap_or_default().replacen("https://", "wss://", 1);
    if !is_public(public) {
        return vec![instance];
    }
    let configured: Vec<String> = serde_json::from_value(public["mirror"]["relays"].clone()).unwrap_or_else(|_| mirror.to_vec());
    public_urls(public_origin(public).then_some(&instance).into_iter().chain(&configured))
}

/// NIP-65: the instance relay for reading and writing (no marker), the others for writing.
fn relay_list(relays: &[String]) -> Vec<Tag> {
    relays
        .iter()
        .enumerate()
        .map(|(i, url)| if i == 0 { Tag::custom("r", [url.as_str()]) } else { Tag::custom("r", [url.as_str(), "write"]) })
        .collect()
}

/// `/.well-known/nostr.json` (NIP-05): `_` is the managed key, else the first creator (own
/// identity); its relays are the announced ones. Any other name, or no identity, is unknown.
pub fn nostr_json(public: &Value, managed: Option<PublicKey>, mirror: &[String], name: Option<&str>) -> Value {
    let pubkey = managed.map(|k| k.to_hex()).or_else(|| public["creators"][0].as_str().map(str::to_owned));
    match pubkey {
        Some(pubkey) if matches!(name, None | Some("_")) => serde_json::json!({
            "names": { "_": pubkey },
            "relays": { (pubkey): relays(public, mirror) },
        }),
        _ => serde_json::json!({ "names": {} }),
    }
}

/// Rebuilds the derived events at startup, config/branding changes and periodically.
/// S2 image jobs are durable: no profile with unreachable or unconfirmed images is signed;
/// a later sync completes after the outbox confirms a copy, without holding a config save open.
pub async fn sync(relay: &Relay, branding: &Branding, outbox: &Outbox, keys: &crate::signer::Shared) {
    let _one = SYNC.lock().await;
    let snapshot = branding.public_config();
    let public: Value = match serde_json::from_slice(&snapshot) {
        Ok(public) => public,
        Err(e) => return tracing::warn!("profile: reading the public config: {e}"),
    };
    // `None` is own identity; an unlock error was logged at startup.
    let managed = keys.lock().clone();
    let mut ids = Vec::new();
    if let Some(Ok(keys)) = managed {
        let ready = profile_images(branding, outbox, &keys, &public).await;
        if branding.public_config() != snapshot {
            return; // A newer config/branding sync must win after asynchronous storage work.
        }
        match ready {
            Ok(Some(ready)) => ids.extend(replace(relay, &keys, Kind::Metadata, derive(&ready).to_string(), vec![]).await),
            Ok(None) => {}
            Err(e) => tracing::warn!("profile: preparing branding mirrors: {e}"),
        }
        if is_public(&public) {
            let tags = relay_list(&relays(&public, relay.mirror_relays()));
            ids.extend(replace(relay, &keys, Kind::RelayList, String::new(), tags).await);
        }
        let tags = blossom_servers(&public).iter().map(|url| Tag::custom("server", [url.as_str()])).collect();
        ids.extend(replace(relay, &keys, Kind::Custom(10063), String::new(), tags).await);
    }
    let (indexers, ids) = if is_public(&public) {
        let targets: Vec<String> = serde_json::from_value(public["profileRelays"].clone()).unwrap_or_default();
        (public_urls(&targets), ids)
    } else {
        (vec![], vec![])
    };
    if let Err(e) = outbox.announce(indexers, ids).await {
        tracing::warn!("profile: queueing for the indexers: {e}");
    }
}

async fn profile_images(branding: &Branding, outbox: &Outbox, keys: &Keys, public: &Value) -> Result<Option<Value>, String> {
    let mut ready = public.clone();
    let images: Vec<_> = branding.files().into_iter()
        .filter(|(path, _, _)| matches!(*path, "/branding/logo" | "/branding/banner")).collect();
    // Pin desired bytes before publication: a superseded nsite may share these very blobs.
    use sha2::{Digest, Sha256};
    outbox.retain("profile", images.iter().map(|(_, _, bytes)| format!("{:x}", Sha256::digest(bytes))).collect()).await?;
    if public_origin(public) || public["reach"] != "public" {
        return Ok(Some(ready));
    }
    let origin = public["origin"].as_str().unwrap_or_default();
    let servers = blossom_servers(public);
    let mut pending = false;
    for (path, mime, bytes) in images {
        let ext = crate::branding::Kind::sniff(&bytes).ok_or("unknown branding image format")?.ext();
        let (hash, size) = outbox.store_local(&bytes, mime, ext, &keys.public_key().to_hex()).await?;
        outbox.queue_blob(hash.clone(), size, format!("{origin}/{hash}.{ext}")).await?;
        let copies = outbox.blob_copies(hash.clone()).await?;
        // A removed or LAN-only target must not become the public profile URL.
        let target = servers.iter().find(|server| copies.iter().any(|copy| copy.trim_end_matches('/') == server.as_str()));
        if let Some(target) = target {
            let slot = path.rsplit('/').next().unwrap();
            ready["site"][slot] = format!("{target}/{hash}.{ext}").into();
        } else {
            pending = true;
        }
    }
    Ok((!pending).then_some(ready))
}

/// Makes `content` and `tags` the managed key's current `kind` (a replaceable kind) unless the
/// stored one says the same already. Answers the id of the current event.
async fn replace(relay: &Relay, keys: &Keys, kind: Kind, content: String, tags: Vec<Tag>) -> Option<EventId> {
    let what = match kind { Kind::Metadata => "profile", Kind::RelayList => "relay list", _ => "Blossom server list" };
    let filter = Filter::new().author(keys.public_key()).kind(kind).limit(1);
    let current = match relay.stored(filter).await {
        Ok(events) => events.into_iter().next(),
        Err(e) => {
            tracing::warn!("profile: reading the stored {what}: {e}");
            return None;
        }
    };
    let json = |s: &str| serde_json::from_str::<Value>(s).ok();
    if let Some(e) = current.as_ref().filter(|e| {
        e.tags.iter().eq(tags.iter())
            && (kind == Kind::Custom(10063) || e.content == content || json(&e.content).is_some_and(|v| json(&content) == Some(v)))
    }) {
        return Some(e.id);
    }
    // Strictly newer than the stored one, also for two changes within a second.
    let created_at = current.map_or(0, |e| e.created_at.as_secs() + 1).max(Timestamp::now().as_secs());
    let event = match EventBuilder::new(kind, content).tags(tags).custom_created_at(Timestamp::from(created_at)).finalize(keys) {
        Ok(event) => event,
        Err(e) => {
            tracing::warn!("profile: cannot sign the {what}: {e}");
            return None;
        }
    };
    let id = event.id;
    match relay.ingest(event).await {
        RelayMessage::Ok { status: true, .. } => {
            tracing::info!("profile: channel {what} updated");
            Some(id)
        }
        RelayMessage::Ok { message, .. } => {
            tracing::warn!("profile: the relay refused the channel {what}: {message}");
            None
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::branding::{Kind as Image, Slot};
    use axum::body::Bytes;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nxx";
    const MIRROR: &str = "wss://mirror.example";
    const INDEXER: &str = "wss://indexer.example";

    fn public(title: &str, tagline: &str) -> Value {
        serde_json::json!({ "origin": "https://tube.example", "originIsPublic": true, "title": title, "site": { "tagline": tagline } })
    }

    fn public_reach(title: &str) -> Value {
        let mut p = public(title, "Videos about things");
        p["reach"] = "public".into();
        p["profileRelays"] = serde_json::json!([INDEXER]);
        p
    }

    struct Fixture {
        dir: std::path::PathBuf,
        relay: Relay,
        branding: Branding,
        outbox: Outbox,
    }

    impl Fixture {
        fn new(writer: PublicKey) -> Fixture {
            Self::with_blossom(writer, vec![])
        }

        fn with_blossom(writer: PublicKey, blossom: Vec<String>) -> Fixture {
            let dir = std::env::temp_dir().join(format!("nss-profile-test-{}", crate::admin::random_boot_id()));
            std::fs::create_dir_all(&dir).unwrap();
            let relay = Relay::open(&dir.join("relay.sqlite"), crate::relay::RelayConfig {
                writers: vec![writer], name: "t".into(), description: "t".into(),
                mirror_relays: vec![MIRROR.into()],
            }).unwrap();
            let outbox = Outbox::open(&dir.join("relay.sqlite"), crate::config::Mirror {
                relays: vec![MIRROR.into()], blossom,
            }).unwrap();
            let branding = Branding::open(&dir, public("Channel", "Videos about things"));
            Fixture { dir, relay, branding, outbox }
        }

        async fn sync(&self, keys: &crate::signer::Shared) {
            sync(&self.relay, &self.branding, &self.outbox, keys).await;
        }

        async fn stored(&self, author: PublicKey, kind: Kind) -> Vec<Event> {
            self.relay.stored(Filter::new().author(author).kind(kind)).await.unwrap()
        }

        /// Event ids queued for `target`.
        fn jobs(&self, target: &str) -> Vec<String> {
            let conn = rusqlite::Connection::open(self.dir.join("relay.sqlite")).unwrap();
            let mut stmt = conn.prepare("SELECT ref_id FROM outbox WHERE kind = 'event' AND target = ? ORDER BY id").unwrap();
            stmt.query_map([target], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn content(event: &Event) -> Value {
        serde_json::from_str(&event.content).unwrap()
    }

    fn managed(keys: &Keys) -> crate::signer::Shared {
        std::sync::Arc::new(parking_lot::Mutex::new(Some(Ok(keys.clone()))))
    }

    #[test]
    fn the_profile_comes_from_title_tagline_logo_and_banner() {
        let mut p = public("Channel", "Videos");
        p["site"]["logo"] = "/branding/logo?v=1".into();
        p["site"]["banner"] = "/branding/banner?v=2".into();
        p["site"]["favicon"] = "/branding/favicon?v=3".into();
        p["site"]["lightning"] = "channel@wallet.example".into();
        assert_eq!(derive(&p), serde_json::json!({
            "name": "Channel",
            "about": "Videos",
            "picture": "https://tube.example/branding/logo?v=1",
            "banner": "https://tube.example/branding/banner?v=2",
            "lud16": "channel@wallet.example",
            "nip05": "_@tube.example",
        }));
        let mut empty = public("Channel", "");
        empty["site"]["lightning"] = "".into();
        empty["origin"] = "https://tube.example:8443".into();
        assert_eq!(derive(&empty), serde_json::json!({ "name": "Channel", "nip05": "_@tube.example" }));
    }

    #[test]
    fn the_relay_list_is_the_instance_relay_then_the_mirror_relays_in_public_reach() {
        let mirror = ["wss://tube.example".to_owned(), MIRROR.into(), MIRROR.into()];
        assert_eq!(relays(&public("C", ""), &mirror), ["wss://tube.example"], "private: the instance relay only");
        let announced = relays(&public_reach("C"), &mirror);
        assert_eq!(announced, ["wss://tube.example", MIRROR]);
        let tags: Vec<Vec<String>> = relay_list(&announced).into_iter().map(Tag::to_vec).collect();
        assert_eq!(tags, [vec!["r", "wss://tube.example"], vec!["r", MIRROR, "write"]]);
    }

    #[test]
    fn nostr_json_names_the_managed_key_else_the_first_creator() {
        let (key, creator) = (Keys::generate().public_key(), Keys::generate().public_key());
        let mut p = public_reach("C");
        p["creators"] = serde_json::json!([creator.to_hex()]);
        let mirror = [MIRROR.to_owned()];
        assert_eq!(nostr_json(&p, Some(key), &mirror, None), serde_json::json!({
            "names": { "_": key.to_hex() },
            "relays": { key.to_hex(): ["wss://tube.example", MIRROR] },
        }));
        assert_eq!(nostr_json(&p, Some(key), &mirror, Some("_"))["names"]["_"], key.to_hex());
        assert_eq!(nostr_json(&p, Some(key), &mirror, Some("bob")), serde_json::json!({ "names": {} }));
        let mut private = public("C", "");
        private["creators"] = serde_json::json!([creator.to_hex()]);
        assert_eq!(nostr_json(&private, None, &mirror, None), serde_json::json!({
            "names": { "_": creator.to_hex() },
            "relays": { creator.to_hex(): ["wss://tube.example"] },
        }));
        assert_eq!(nostr_json(&public("C", ""), None, &mirror, None), serde_json::json!({ "names": {} }));
    }

    #[tokio::test]
    async fn private_lan_branding_and_profile_edits_need_no_public_mirror() {
        let keys = Keys::generate();
        let shared = managed(&keys);
        let f = Fixture::new(keys.public_key());
        let mut p = public("Local channel", "Offline videos");
        p["origin"] = "https://tube.local".into();
        p["originIsPublic"] = false.into();
        p["reach"] = "private".into();
        f.branding.set_base(p.clone());
        let logo = f.branding.store(Slot::Logo, Image::Png, Bytes::from_static(PNG)).unwrap();
        f.sync(&shared).await;
        let first = f.stored(keys.public_key(), Kind::Metadata).await;
        assert!(content(&first[0]).get("picture").is_none(), "derive omits the unreachable LAN image URL ({logo})");
        p["title"] = "Renamed offline".into();
        p["site"]["lightning"] = "local@wallet.example".into();
        f.branding.set_base(p);
        f.sync(&shared).await;
        let changed = f.stored(keys.public_key(), Kind::Metadata).await;
        assert_eq!(content(&changed[0])["name"], "Renamed offline");
        assert_eq!(content(&changed[0])["lud16"], "local@wallet.example");
        assert!(changed[0].created_at > first[0].created_at);
    }

    #[tokio::test]
    async fn the_channel_profile_follows_the_site_settings_and_is_mirrored() {
        let keys = Keys::generate();
        let shared = managed(&keys);
        let f = Fixture::new(keys.public_key());

        f.sync(&shared).await;
        let first = f.stored(keys.public_key(), Kind::Metadata).await;
        assert_eq!(first.len(), 1);
        assert_eq!(content(&first[0]), serde_json::json!({ "name": "Channel", "about": "Videos about things", "nip05": "_@tube.example" }));
        let blossom = f.stored(keys.public_key(), Kind::Custom(10063)).await;
        assert_eq!(f.jobs(MIRROR), [first[0].id.to_hex(), blossom[0].id.to_hex()]);

        // Unchanged settings (an unrelated save, a restart): nothing new is signed or queued.
        f.sync(&shared).await;
        assert_eq!(f.stored(keys.public_key(), Kind::Metadata).await, first);
        assert_eq!(f.jobs(MIRROR).len(), 2);

        // A new title replaces the profile with a newer one, within the same second too.
        f.branding.set_base(public("Renamed", "Videos about things"));
        f.sync(&shared).await;
        let renamed = f.stored(keys.public_key(), Kind::Metadata).await;
        assert_eq!(content(&renamed[0])["name"], "Renamed");
        assert!(renamed[0].created_at > first[0].created_at);

        let url = f.branding.store(Slot::Logo, Image::Png, Bytes::from_static(PNG)).unwrap();
        f.branding.store(Slot::Banner, Image::Png, Bytes::from_static(PNG)).unwrap();
        f.sync(&shared).await;
        let branded = content(&f.stored(keys.public_key(), Kind::Metadata).await[0]);
        assert_eq!(branded["picture"], format!("https://tube.example{url}"));
        assert!(branded["banner"].as_str().unwrap().starts_with("https://tube.example/branding/banner?v="));

        f.branding.remove(Slot::Logo).unwrap();
        f.sync(&shared).await;
        let stored = f.stored(keys.public_key(), Kind::Metadata).await;
        assert_eq!(stored.len(), 1, "a replaceable event keeps only its newest version");
        assert!(content(&stored[0]).get("picture").is_none());
        assert!(content(&stored[0]).get("banner").is_some());
        assert_eq!(f.jobs(MIRROR).len(), 5, "each new profile and the initial Blossom list go to the mirror relay");
        // Private reach: no relay list, nothing for any indexer.
        assert!(f.stored(keys.public_key(), Kind::RelayList).await.is_empty());
        assert_eq!(f.jobs(MIRROR).len() as i64, count_event_jobs(&f));
    }

    fn count_event_jobs(f: &Fixture) -> i64 {
        let conn = rusqlite::Connection::open(f.dir.join("relay.sqlite")).unwrap();
        conn.query_row("SELECT COUNT(*) FROM outbox WHERE kind = 'event'", [], |r| r.get(0)).unwrap()
    }

    #[tokio::test]
    async fn public_reach_announces_profile_and_relay_list_to_the_indexers() {
        let keys = Keys::generate();
        let shared = managed(&keys);
        let f = Fixture::new(keys.public_key());
        f.branding.set_base(public_reach("Channel"));

        f.sync(&shared).await;
        let profile = f.stored(keys.public_key(), Kind::Metadata).await;
        let list = f.stored(keys.public_key(), Kind::RelayList).await;
        assert_eq!(list.len(), 1);
        let tags: Vec<Vec<String>> = list[0].tags.clone().to_vec().into_iter().map(Tag::to_vec).collect();
        assert_eq!(tags, [vec!["r", "wss://tube.example"], vec!["r", MIRROR, "write"]]);
        let blossom = f.stored(keys.public_key(), Kind::Custom(10063)).await;
        assert_eq!(f.jobs(INDEXER), [profile[0].id.to_hex(), list[0].id.to_hex(), blossom[0].id.to_hex()]);
        assert_eq!(f.jobs(MIRROR), [profile[0].id.to_hex(), list[0].id.to_hex(), blossom[0].id.to_hex()]);

        // Identical content is not signed again.
        f.sync(&shared).await;
        assert_eq!(f.stored(keys.public_key(), Kind::RelayList).await, list);
        assert_eq!(f.jobs(INDEXER).len(), 3);

        // Back to private: the relay list stays as it is, and a new profile goes nowhere public,
        // though the public config still carries `profileRelays` for the visitor lookup.
        let mut private = public_reach("Renamed");
        private["reach"] = "private".into();
        f.branding.set_base(private);
        f.sync(&shared).await;
        assert_eq!(f.stored(keys.public_key(), Kind::RelayList).await, list);
        assert_eq!(content(&f.stored(keys.public_key(), Kind::Metadata).await[0])["name"], "Renamed");
        assert_eq!(f.jobs(INDEXER).len(), 3);
    }

    #[tokio::test]
    async fn own_identity_never_signs_a_profile() {
        let owner = Keys::generate();
        let f = Fixture::new(owner.public_key());
        f.sync(&Default::default()).await;
        f.branding.set_base(public_reach("Renamed"));
        f.sync(&Default::default()).await;
        assert!(f.relay.stored(Filter::new().kinds([Kind::Metadata, Kind::RelayList, Kind::Custom(10063)])).await.unwrap().is_empty());
        assert_eq!(count_event_jobs(&f), 0);
    }

    #[test]
    fn mirror_only_announcements_omit_local_origin_and_deduplicate_public_targets() {
        let mut p = public_reach("Home");
        p["origin"] = "https://tube.local".into();
        p["originIsPublic"] = false.into();
        p["mirror"] = serde_json::json!({
            "relays": ["wss://tube.local", MIRROR, format!("{MIRROR}/"), "ws://localhost:9000"],
            "blossom": ["https://blobs.example", "https://blobs.example/", "http://blobs.localhost"]
        });
        p["site"]["logo"] = "/branding/logo?v=1".into();
        p["site"]["banner"] = "https://blobs.example/hash.png".into();
        let profile = derive(&p);
        assert!(profile.get("picture").is_none());
        assert!(profile.get("nip05").is_none());
        assert_eq!(profile["banner"], "https://blobs.example/hash.png");
        assert_eq!(relays(&p, &[]), [MIRROR]);
        assert_eq!(blossom_servers(&p), ["https://blobs.example"]);
        let key = Keys::generate().public_key();
        assert_eq!(nostr_json(&p, Some(key), &[], None)["relays"][key.to_hex()], serde_json::json!([MIRROR]));
        p["origin"] = "https://tube.example".into();
        p["originIsPublic"] = true.into();
        p["mirror"]["blossom"] = serde_json::json!(["https://tube.example/", "https://blobs.example", "https://blobs.example/"]);
        assert_eq!(blossom_servers(&p), ["https://tube.example", "https://blobs.example"]);
    }

    #[tokio::test]
    async fn blossom_list_republishes_only_changed_tags_and_advances_past_future_stored_timestamp() {
        let keys = Keys::generate();
        let f = Fixture::new(keys.public_key());
        let mut p = public_reach("Channel");
        p["mirror"] = serde_json::json!({ "blossom": ["https://tube.example/", "https://blobs.example", "https://blobs.example/"] });
        f.branding.set_base(p.clone());
        f.sync(&managed(&keys)).await;
        let first = f.stored(keys.public_key(), Kind::Custom(10063)).await;
        let tags: Vec<_> = first[0].tags.clone().to_vec().into_iter().map(Tag::to_vec).collect();
        assert_eq!(tags, [vec!["server", "https://tube.example"], vec!["server", "https://blobs.example"]]);
        f.sync(&managed(&keys)).await;
        assert_eq!(f.stored(keys.public_key(), Kind::Custom(10063)).await, first);

        let future = EventBuilder::new(Kind::Custom(10063), "unused list content").tags(first[0].tags.clone().to_vec())
            .custom_created_at(Timestamp::from(Timestamp::now().as_secs() + 60)).finalize(&keys).unwrap();
        assert!(matches!(f.relay.ingest(future.clone()).await, RelayMessage::Ok { status: true, .. }));
        p["origin"] = "https://tube.local".into();
        p["originIsPublic"] = false.into();
        f.branding.set_base(p.clone());
        f.sync(&managed(&keys)).await;
        let second = f.stored(keys.public_key(), Kind::Custom(10063)).await;
        assert_eq!(second, [future.clone()], "Blossom lists depend on tags, not unused content");
        let tags: Vec<_> = second[0].tags.clone().to_vec().into_iter().map(Tag::to_vec).collect();
        assert_eq!(tags, [vec!["server", "https://tube.example"], vec!["server", "https://blobs.example"]], "explicit public mirror remains even when origin moves");
        // Remove the former origin from mirrors: this actually changes the announced tags.
        p["mirror"]["blossom"] = serde_json::json!(["https://blobs.example"]);
        f.branding.set_base(p.clone());
        f.sync(&managed(&keys)).await;
        let changed = f.stored(keys.public_key(), Kind::Custom(10063)).await;
        assert!(changed[0].created_at > future.created_at);
        assert_eq!(changed[0].tags.clone().to_vec().into_iter().map(Tag::to_vec).collect::<Vec<_>>(), [vec!["server", "https://blobs.example"]]);
        let indexer_count = f.jobs(INDEXER).len();
        p["reach"] = "private".into();
        p["mirror"]["blossom"] = serde_json::json!(["https://other.example"]);
        f.branding.set_base(p);
        f.sync(&managed(&keys)).await;
        let private = f.stored(keys.public_key(), Kind::Custom(10063)).await;
        assert!(private[0].created_at > changed[0].created_at);
        assert!(f.jobs(MIRROR).contains(&private[0].id.to_hex()));
        assert_eq!(f.jobs(INDEXER).len(), indexer_count, "private Blossom lists never go to indexers");
    }

    #[tokio::test]
    async fn mirror_only_profile_waits_for_each_public_copy_then_retries_without_duplicate_uploads() {
        use sha2::{Digest, Sha256};
        const BLOSSOM: &str = "https://blobs.example";
        const LAN: &str = "http://blobs.local";
        let keys = Keys::generate();
        let f = Fixture::with_blossom(keys.public_key(), vec![LAN.into(), BLOSSOM.into()]);
        let mut cfg = almond::Config::defaults();
        cfg.storage_path = f.dir.join("blossom");
        cfg.public_url = Some("https://tube.local".into());
        cfg.allowed_npubs = vec![keys.public_key()];
        cfg.storage_min_free = 0;
        let state = almond::build_state(&cfg.validate().unwrap()).await.unwrap();
        f.outbox.attach_storage(state.clone());
        f.outbox.set_origin_public(false);
        let mut p = public_reach("Home");
        p["origin"] = "https://tube.local".into();
        p["originIsPublic"] = false.into();
        p["mirror"] = serde_json::json!({ "relays": [MIRROR], "blossom": [BLOSSOM] });
        f.branding.set_base(p);
        let banner = b"\x89PNG\r\n\x1a\nbanner";
        f.branding.store(Slot::Logo, Image::Png, Bytes::from_static(PNG)).unwrap();
        f.branding.store(Slot::Banner, Image::Png, Bytes::from_static(banner)).unwrap();
        let logo_hash = format!("{:x}", Sha256::digest(PNG));
        let banner_hash = format!("{:x}", Sha256::digest(banner));
        f.sync(&managed(&keys)).await;
        assert!(f.stored(keys.public_key(), Kind::Metadata).await.is_empty(), "unconfirmed images defer the entire profile");
        for (hash, bytes) in [(&logo_hash, PNG), (&banner_hash, &banner[..])] {
            let metadata = almond::services::file_storage::get_file_metadata(&state, hash).await.unwrap();
            let path = almond::services::file_storage::local_path(&metadata).unwrap();
            assert_eq!(std::fs::read(path).unwrap(), bytes);
        }
        let conn = rusqlite::Connection::open(f.dir.join("relay.sqlite")).unwrap();
        conn.execute("UPDATE outbox SET status='done' WHERE kind='blob' AND target=?", [LAN]).unwrap();
        f.sync(&managed(&keys)).await;
        assert!(f.stored(keys.public_key(), Kind::Metadata).await.is_empty(), "a LAN copy is never announced");
        conn.execute("UPDATE outbox SET status='done' WHERE kind='blob' AND target=? AND ref_id=?", [BLOSSOM, &logo_hash]).unwrap();
        f.sync(&managed(&keys)).await;
        assert!(f.stored(keys.public_key(), Kind::Metadata).await.is_empty(), "banner must also be confirmed");
        conn.execute("UPDATE outbox SET status='done' WHERE kind='blob' AND target=? AND ref_id=?", [BLOSSOM, &banner_hash]).unwrap();
        f.sync(&managed(&keys)).await;
        let complete = f.stored(keys.public_key(), Kind::Metadata).await;
        let profile = content(&complete[0]);
        assert_eq!(profile["picture"], format!("{BLOSSOM}/{logo_hash}.png"));
        assert_eq!(profile["banner"], format!("{BLOSSOM}/{banner_hash}.png"));
        assert!(profile.get("nip05").is_none());
        f.sync(&managed(&keys)).await;
        assert_eq!(f.stored(keys.public_key(), Kind::Metadata).await, complete);
        let jobs: i64 = conn.query_row("SELECT COUNT(*) FROM outbox WHERE kind='blob'", [], |r| r.get(0)).unwrap();
        assert_eq!(jobs, 4, "two shared blobs, one durable job per mirror each");
    }
}
