//! The channel identity's profile (#129): while the server holds the managed key (ADR 0007), the
//! channel's kind 0 is derived from the site settings (title, tagline, logo, banner) and stored in
//! the instance relay, from where the outbox mirrors it like any other event (ADR 0009). In own
//! identity there is no managed key and nothing is signed: the owner's profile is theirs.

use nostr::prelude::*;
use serde_json::{Map, Value};

use crate::{branding::Branding, relay::Relay};

/// One sync at a time, so the newest settings always end in the newest profile.
static SYNC: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// The profile from the public config: `name` is the title, `about` the tagline, `picture` and
/// `banner` the branding images as absolute URLs, `lud16` the lightning address. An empty or
/// missing value leaves the field out.
fn derive(public: &Value) -> Value {
    let origin = public["origin"].as_str().unwrap_or_default();
    let site = &public["site"];
    let image = |slot: &str| site[slot].as_str().map(|url| format!("{origin}{url}"));
    [
        ("name", public["title"].as_str().map(str::to_owned)),
        ("about", site["tagline"].as_str().map(str::to_owned)),
        ("picture", image("logo")),
        ("banner", image("banner")),
        ("lud16", site["lightning"].as_str().map(str::to_owned)),
    ]
    .into_iter()
    .filter_map(|(field, value)| Some((field.to_owned(), Value::from(value.filter(|v| !v.is_empty())?))))
    .collect::<Map<_, _>>()
    .into()
}

/// Publishes the derived profile with the managed key when it differs from the stored one. Run
/// at startup, after a config applied while running and after a branding upload or removal.
pub async fn sync(relay: &Relay, branding: &Branding, keys: &crate::signer::Shared) {
    // `None` is own identity; an unlock error was logged at startup.
    let Some(Ok(keys)) = keys.lock().clone() else { return };
    let _one = SYNC.lock().await;
    let public = match serde_json::from_slice(&branding.public_config()) {
        Ok(public) => public,
        Err(e) => return tracing::warn!("profile: reading the public config: {e}"),
    };
    let profile = derive(&public);
    let filter = Filter::new().author(keys.public_key()).kind(Kind::Metadata).limit(1);
    let current = match relay.stored(filter).await {
        Ok(events) => events.into_iter().next(),
        Err(e) => return tracing::warn!("profile: reading the stored profile: {e}"),
    };
    if current.as_ref().and_then(|e| serde_json::from_str::<Value>(&e.content).ok()).as_ref() == Some(&profile) {
        return;
    }
    // Strictly newer than the stored one, also for two changes within a second.
    let created_at = current.map_or(0, |e| e.created_at.as_secs() + 1).max(Timestamp::now().as_secs());
    let event = match EventBuilder::new(Kind::Metadata, profile.to_string())
        .custom_created_at(Timestamp::from(created_at))
        .finalize(&keys)
    {
        Ok(event) => event,
        Err(e) => return tracing::warn!("profile: cannot sign: {e}"),
    };
    match relay.ingest(event).await {
        RelayMessage::Ok { status: true, .. } => tracing::info!("profile: channel profile updated"),
        RelayMessage::Ok { message, .. } => tracing::warn!("profile: the relay refused the channel profile: {message}"),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::branding::{Kind as Image, Slot};
    use axum::body::Bytes;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nxx";

    fn public(title: &str, tagline: &str) -> Value {
        serde_json::json!({ "origin": "https://tube.example", "title": title, "site": { "tagline": tagline } })
    }

    struct Fixture {
        dir: std::path::PathBuf,
        relay: Relay,
        branding: Branding,
    }

    impl Fixture {
        fn new(writer: PublicKey) -> Fixture {
            let dir = std::env::temp_dir().join(format!("nss-profile-test-{}", crate::admin::random_boot_id()));
            std::fs::create_dir_all(&dir).unwrap();
            let relay = Relay::open(&dir.join("relay.sqlite"), crate::relay::RelayConfig {
                writers: vec![writer], name: "t".into(), description: "t".into(),
                mirror_relays: vec!["wss://mirror.example".into()],
            }).unwrap();
            let branding = Branding::open(&dir, public("Channel", "Videos about things"));
            Fixture { dir, relay, branding }
        }

        async fn profiles(&self, author: PublicKey) -> Vec<Event> {
            self.relay.stored(Filter::new().author(author).kind(Kind::Metadata)).await.unwrap()
        }

        /// Event jobs queued for the mirror relay.
        fn mirror_jobs(&self) -> Vec<String> {
            let conn = rusqlite::Connection::open(self.dir.join("relay.sqlite")).unwrap();
            let mut stmt = conn.prepare("SELECT ref_id FROM outbox WHERE kind = 'event' ORDER BY id").unwrap();
            stmt.query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
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
        }));
        let mut empty = public("Channel", "");
        empty["site"]["lightning"] = "".into();
        assert_eq!(derive(&empty), serde_json::json!({ "name": "Channel" }));
    }

    #[tokio::test]
    async fn the_channel_profile_follows_the_site_settings_and_is_mirrored() {
        let keys = Keys::generate();
        let shared: crate::signer::Shared = std::sync::Arc::new(parking_lot::Mutex::new(Some(Ok(keys.clone()))));
        let f = Fixture::new(keys.public_key());

        sync(&f.relay, &f.branding, &shared).await;
        let first = f.profiles(keys.public_key()).await;
        assert_eq!(first.len(), 1);
        assert_eq!(content(&first[0]), serde_json::json!({ "name": "Channel", "about": "Videos about things" }));
        assert_eq!(f.mirror_jobs(), [first[0].id.to_hex()]);

        // Unchanged settings (an unrelated save, a restart): nothing new is signed or queued.
        sync(&f.relay, &f.branding, &shared).await;
        assert_eq!(f.profiles(keys.public_key()).await, first);
        assert_eq!(f.mirror_jobs().len(), 1);

        // A new title replaces the profile with a newer one, within the same second too.
        f.branding.set_base(public("Renamed", "Videos about things"));
        sync(&f.relay, &f.branding, &shared).await;
        let renamed = f.profiles(keys.public_key()).await;
        assert_eq!(content(&renamed[0])["name"], "Renamed");
        assert!(renamed[0].created_at > first[0].created_at);

        let url = f.branding.store(Slot::Logo, Image::Png, Bytes::from_static(PNG)).unwrap();
        f.branding.store(Slot::Banner, Image::Png, Bytes::from_static(PNG)).unwrap();
        sync(&f.relay, &f.branding, &shared).await;
        let branded = content(&f.profiles(keys.public_key()).await[0]);
        assert_eq!(branded["picture"], format!("https://tube.example{url}"));
        assert!(branded["banner"].as_str().unwrap().starts_with("https://tube.example/branding/banner?v="));

        f.branding.remove(Slot::Logo).unwrap();
        sync(&f.relay, &f.branding, &shared).await;
        let stored = f.profiles(keys.public_key()).await;
        assert_eq!(stored.len(), 1, "a replaceable event keeps only its newest version");
        assert!(content(&stored[0]).get("picture").is_none());
        assert!(content(&stored[0]).get("banner").is_some());
        assert_eq!(f.mirror_jobs().len(), 4, "each new profile goes to the mirror relay");
    }

    #[tokio::test]
    async fn own_identity_never_signs_a_profile() {
        let owner = Keys::generate();
        let f = Fixture::new(owner.public_key());
        sync(&f.relay, &f.branding, &Default::default()).await;
        f.branding.set_base(public("Renamed", "Other"));
        sync(&f.relay, &f.branding, &Default::default()).await;
        assert!(f.relay.stored(Filter::new().kind(Kind::Metadata)).await.unwrap().is_empty());
        assert!(f.mirror_jobs().is_empty());
    }
}
