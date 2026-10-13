//! The channel identity's profile (#129): while the server holds the managed key (ADR 0007), the
//! channel's kind 0 is derived from the site settings (title, tagline, logo, banner) and stored in
//! the instance relay, from where the outbox mirrors it like any other event (ADR 0009). In public
//! reach (ADR 0012) the channel's relay list (kind 10002) joins it and the outbox also delivers
//! both to the indexers. In own identity there is no managed key and nothing is signed: the
//! owner's profile is theirs. Both identities answer NIP-05 lookups (`nostr_json`).

use nostr::prelude::*;
use serde_json::{Map, Value};

use crate::{branding::Branding, outbox::Outbox, relay::Relay};

/// One sync at a time, so the newest settings always end in the newest profile.
static SYNC: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn is_public(public: &Value) -> bool {
    public["reach"] == "public"
}

/// The profile from the public config: `name` is the title, `about` the tagline, `picture` and
/// `banner` the branding images as absolute URLs, `lud16` the lightning address, `nip05` the
/// instance's NIP-05 name `_@<origin host>`. An empty or missing value leaves the field out.
fn derive(public: &Value) -> Value {
    let origin = public["origin"].as_str().unwrap_or_default();
    let site = &public["site"];
    let image = |slot: &str| site[slot].as_str().map(|url| format!("{origin}{url}"));
    let host = Url::parse(origin).ok().and_then(|url| url.host_str().map(str::to_owned));
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

/// The relays the channel announces (kind 10002 and NIP-05): the instance relay, then in public
/// reach the `[mirror]` relays, without duplicates.
fn relays(public: &Value, mirror: &[String]) -> Vec<String> {
    let mut relays = vec![public["origin"].as_str().unwrap_or_default().replacen("https://", "wss://", 1)];
    if is_public(public) {
        for url in mirror {
            if !relays.contains(url) {
                relays.push(url.clone());
            }
        }
    }
    relays
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

/// Publishes the derived profile, and in public reach the relay list, with the managed key when
/// they differ from the stored ones; in public reach the outbox delivers both to the indexers
/// (`profileRelays`), in private reach nothing goes there. Run at startup, after a config applied
/// while running and after a branding upload or removal.
pub async fn sync(relay: &Relay, branding: &Branding, outbox: &Outbox, keys: &crate::signer::Shared) {
    let _one = SYNC.lock().await;
    let public: Value = match serde_json::from_slice(&branding.public_config()) {
        Ok(public) => public,
        Err(e) => return tracing::warn!("profile: reading the public config: {e}"),
    };
    // `None` is own identity; an unlock error was logged at startup.
    let managed = keys.lock().clone();
    let mut ids = Vec::new();
    if let Some(Ok(keys)) = managed {
        ids.extend(replace(relay, &keys, Kind::Metadata, derive(&public).to_string(), vec![]).await);
        if is_public(&public) {
            let tags = relay_list(&relays(&public, relay.mirror_relays()));
            ids.extend(replace(relay, &keys, Kind::RelayList, String::new(), tags).await);
        }
    }
    let (indexers, ids) = if is_public(&public) {
        (serde_json::from_value(public["profileRelays"].clone()).unwrap_or_default(), ids)
    } else {
        (vec![], vec![])
    };
    if let Err(e) = outbox.announce(indexers, ids).await {
        tracing::warn!("profile: queueing for the indexers: {e}");
    }
}

/// Makes `content` and `tags` the managed key's current `kind` (a replaceable kind) unless the
/// stored one says the same already. Answers the id of the current event.
async fn replace(relay: &Relay, keys: &Keys, kind: Kind, content: String, tags: Vec<Tag>) -> Option<EventId> {
    let what = if kind == Kind::Metadata { "profile" } else { "relay list" };
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
        e.tags == Tags::from_list(tags.clone()) && (e.content == content || json(&e.content).is_some_and(|v| json(&content) == Some(v)))
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
        serde_json::json!({ "origin": "https://tube.example", "title": title, "site": { "tagline": tagline } })
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
            let dir = std::env::temp_dir().join(format!("nss-profile-test-{}", crate::admin::random_boot_id()));
            std::fs::create_dir_all(&dir).unwrap();
            let relay = Relay::open(&dir.join("relay.sqlite"), crate::relay::RelayConfig {
                writers: vec![writer], name: "t".into(), description: "t".into(),
                mirror_relays: vec![MIRROR.into()],
            }).unwrap();
            let outbox = Outbox::open(&dir.join("relay.sqlite"), crate::config::Mirror {
                relays: vec![MIRROR.into()], blossom: vec![],
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
    async fn the_channel_profile_follows_the_site_settings_and_is_mirrored() {
        let keys = Keys::generate();
        let shared = managed(&keys);
        let f = Fixture::new(keys.public_key());

        f.sync(&shared).await;
        let first = f.stored(keys.public_key(), Kind::Metadata).await;
        assert_eq!(first.len(), 1);
        assert_eq!(content(&first[0]), serde_json::json!({ "name": "Channel", "about": "Videos about things", "nip05": "_@tube.example" }));
        assert_eq!(f.jobs(MIRROR), [first[0].id.to_hex()]);

        // Unchanged settings (an unrelated save, a restart): nothing new is signed or queued.
        f.sync(&shared).await;
        assert_eq!(f.stored(keys.public_key(), Kind::Metadata).await, first);
        assert_eq!(f.jobs(MIRROR).len(), 1);

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
        assert_eq!(f.jobs(MIRROR).len(), 4, "each new profile goes to the mirror relay");
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
        assert_eq!(f.jobs(INDEXER), [profile[0].id.to_hex(), list[0].id.to_hex()]);
        assert_eq!(f.jobs(MIRROR), [profile[0].id.to_hex(), list[0].id.to_hex()]);

        // Identical content is not signed again.
        f.sync(&shared).await;
        assert_eq!(f.stored(keys.public_key(), Kind::RelayList).await, list);
        assert_eq!(f.jobs(INDEXER).len(), 2);

        // Back to private: the relay list stays as it is, and a new profile goes nowhere public.
        let mut private = public("Renamed", "Videos about things");
        private["reach"] = "private".into();
        f.branding.set_base(private);
        f.sync(&shared).await;
        assert_eq!(f.stored(keys.public_key(), Kind::RelayList).await, list);
        assert_eq!(content(&f.stored(keys.public_key(), Kind::Metadata).await[0])["name"], "Renamed");
        assert_eq!(f.jobs(INDEXER).len(), 2);
    }

    #[tokio::test]
    async fn own_identity_never_signs_a_profile() {
        let owner = Keys::generate();
        let f = Fixture::new(owner.public_key());
        f.sync(&Default::default()).await;
        f.branding.set_base(public_reach("Renamed"));
        f.sync(&Default::default()).await;
        assert!(f.relay.stored(Filter::new().kinds([Kind::Metadata, Kind::RelayList])).await.unwrap().is_empty());
        assert_eq!(count_event_jobs(&f), 0);
    }
}
