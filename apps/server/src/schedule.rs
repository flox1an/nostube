//! Scheduled publishing (spec "Geplante Veröffentlichung"): the studio signs the complete video
//! event up front and hands it over; it lives only in the `scheduled` table of `relay.sqlite`
//! until its `published_at` is due. Then `release_due` stores it in the relay like any other
//! accepted event, so the outbox mirrors it as usual. Until then it is in no relay table, and
//! so on no site, embed or Nostr client.
//!
//! Accepted risks (documented, not fixed): the database holds signed events, so a database
//! compromise allows early release of exactly those videos and nothing more; and the blobs are
//! publicly fetchable by hash before the release (the URL is the hash, which nobody can find
//! without the event).

use std::{collections::HashSet, time::Duration};

use nostr::prelude::{Event, PublicKey, RelayMessage, Timestamp};
use rusqlite::{params, OptionalExtension};

use crate::{
    outbox::{enqueue_cleanup, Outbox, MEDIA_LIFECYCLE},
    relay::{media_hashes, Relay, MAX_FUTURE_SECS, MAX_MESSAGE_BYTES},
};

pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS scheduled (
  event_id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  kind INTEGER NOT NULL,
  d_tag TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled', 'released', 'failed')),
  event TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL,
  released_at INTEGER
);
-- One pending version per video: submitting the same coordinate again replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_coordinate ON scheduled(author, kind, d_tag) WHERE state = 'scheduled';
CREATE INDEX IF NOT EXISTS scheduled_due ON scheduled(state, due_at);
";

/// How often due events are looked for; the first look is at startup, which releases whatever
/// became overdue while the server was down. Minute precision, no second-exact guarantee.
const SCAN: Duration = Duration::from_secs(60);
/// Listed in the studio: everything pending plus this many of the newest others.
const HISTORY: i64 = 100;

/// Orders submit, cancel and release of one video against each other: a release in flight
/// cannot publish what a cancel just removed. Taken before `MEDIA_LIFECYCLE`.
static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub enum Error {
    /// The submission is refused; the text says why.
    Rejected(String),
    Failed(String),
}

fn rejected<T>(why: impl Into<String>) -> Result<T, Error> {
    Err(Error::Rejected(why.into()))
}

fn now() -> i64 {
    Timestamp::now().as_secs() as i64
}

fn tag_value<'a>(ev: &'a Event, name: &str) -> Option<&'a str> {
    ev.tags.iter().find_map(|t| match t.as_slice() {
        [n, v, ..] if n == name => Some(v.as_str()),
        _ => None,
    })
}

/// The trust boundary: verifies a presigned video event and stores it for its due date. Same
/// coordinate (`d` tag) as a pending one replaces it (edit before release); the replaced
/// version's blobs are cleaned up unless something still uses them.
pub async fn submit(
    outbox: &Outbox, creators: &[PublicKey], writers: &[PublicKey], body: &[u8],
) -> Result<serde_json::Value, Error> {
    if body.len() > MAX_MESSAGE_BYTES {
        return rejected(format!("event too large (over {} KiB)", MAX_MESSAGE_BYTES / 1024));
    }
    let ev = Event::from_json(body).or_else(|e| rejected(format!("invalid event: {e}")))?;
    if ev.verify().is_err() {
        return rejected("invalid: bad event id or signature");
    }
    if !creators.contains(&ev.pubkey) || !writers.contains(&ev.pubkey) {
        return rejected("the key is not a creator and allowed writer of this instance");
    }
    if !matches!(ev.kind.as_u16(), 34235 | 34236) {
        return rejected("only video events (kind 34235 and 34236) can be scheduled");
    }
    let Some(d_tag) = ev.tags.identifier().map(|d| d.to_owned()) else {
        return rejected("the video event has no d tag");
    };
    let due_at = match tag_value(&ev, "published_at").map(str::parse::<i64>) {
        Some(Ok(due)) if due > now() => due,
        Some(Ok(_)) => return rejected("the publish date is not in the future"),
        _ => return rejected("the video event has no valid published_at tag"),
    };
    if ev.created_at.as_secs() > Timestamp::now().as_secs() + MAX_FUTURE_SECS {
        return rejected("invalid: created_at is too far in the future");
    }
    if ev.is_expired() {
        return rejected("invalid: event has expired");
    }
    let json = ev.as_json();
    let hashes = media_hashes(&json);
    if hashes.is_empty() {
        return rejected("the video event references no media");
    }

    let _lock = LOCK.lock().await;
    let _media = MEDIA_LIFECYCLE.lock().await;
    let state = crate::outbox::storage(outbox).map_err(Error::Failed)?;
    for hash in &hashes {
        if almond::services::file_storage::get_file_metadata(&state, hash).await.is_none() {
            return rejected(format!("blob {hash} is not stored on this instance"));
        }
    }
    let (id, author, kind) = (ev.id.to_hex(), ev.pubkey, ev.kind.as_u16());
    let row = (id.clone(), author.to_hex(), kind, d_tag, due_at, json);
    let taken = outbox
        .db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            let released = tx
                .query_row("SELECT 1 FROM scheduled WHERE event_id = ? AND state != 'scheduled'", [&row.0], |_| Ok(()))
                .optional()?;
            if released.is_some() {
                return Ok(false);
            }
            let old: Vec<String> = tx
                .prepare("SELECT event FROM scheduled WHERE author = ?1 AND kind = ?2 AND d_tag = ?3 AND state = 'scheduled'")?
                .query_map(params![row.1, row.2, row.3], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            tx.execute(
                "DELETE FROM scheduled WHERE author = ?1 AND kind = ?2 AND d_tag = ?3 AND state = 'scheduled'",
                params![row.1, row.2, row.3],
            )?;
            tx.execute(
                "INSERT INTO scheduled (event_id, author, kind, d_tag, due_at, event, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![row.0, row.1, row.2, row.3, row.4, row.5, now()],
            )?;
            for json in old {
                for hash in media_hashes(&json) {
                    enqueue_cleanup(&tx, &author, &hash)?;
                }
            }
            tx.commit()?;
            Ok(true)
        })
        .await
        .map_err(Error::Failed)?;
    if !taken {
        return rejected("this event was already released");
    }
    Ok(serde_json::json!({ "id": id, "dueAt": due_at }))
}

/// Drops a pending video and removes its blobs from Blossom (like a delete, #119). The cleanup
/// jobs keep every blob another video still uses.
pub async fn cancel(outbox: &Outbox, id: String) -> Result<(), Error> {
    let _lock = LOCK.lock().await;
    let _media = MEDIA_LIFECYCLE.lock().await;
    let found = outbox
        .db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            let row: Option<(String, String)> = tx
                .query_row("SELECT author, event FROM scheduled WHERE event_id = ? AND state = 'scheduled'", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()?;
            let Some((author, json)) = row else { return Ok(false) };
            tx.execute("DELETE FROM scheduled WHERE event_id = ?", [&id])?;
            let author = PublicKey::from_hex(&author).expect("stored author is valid hex");
            for hash in media_hashes(&json) {
                enqueue_cleanup(&tx, &author, &hash)?;
            }
            tx.commit()?;
            Ok(true)
        })
        .await
        .map_err(Error::Failed)?;
    if found { Ok(()) } else { rejected("no scheduled video with this id") }
}

/// Pending videos and the newest history, for the studio. `event` is the signed event, so the
/// studio can show and edit it.
pub async fn list(outbox: &Outbox) -> Result<serde_json::Value, String> {
    outbox
        .db(|conn| {
            let mut stmt = conn.prepare(
                "SELECT event_id, kind, d_tag, due_at, state, error, released_at, event FROM scheduled
                 WHERE state = 'scheduled' OR rowid IN (SELECT rowid FROM scheduled WHERE state != 'scheduled' ORDER BY due_at DESC LIMIT ?)
                 ORDER BY due_at",
            )?;
            let items = stmt
                .query_map([HISTORY], |r| {
                    let event: String = r.get(7)?;
                    Ok(serde_json::json!({
                        "id": r.get::<_, String>(0)?,
                        "kind": r.get::<_, i64>(1)?,
                        "identifier": r.get::<_, String>(2)?,
                        "dueAt": r.get::<_, i64>(3)?,
                        "state": r.get::<_, String>(4)?,
                        "error": r.get::<_, Option<String>>(5)?,
                        "releasedAt": r.get::<_, Option<i64>>(6)?,
                        "event": serde_json::from_str::<serde_json::Value>(&event).unwrap_or_default(),
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(serde_json::json!({ "items": items }))
        })
        .await
}

/// Stores every due event in the relay (and thereby queues its mirror jobs). A refusal that no
/// retry can change (writer removed, deleted by its author) marks the row `failed`; a storage
/// error leaves it for the next scan. Answers how many were released.
pub async fn release_due(outbox: &Outbox, relay: &Relay) -> usize {
    let due: Vec<String> = match outbox
        .db(|conn| {
            conn.prepare("SELECT event_id FROM scheduled WHERE state = 'scheduled' AND due_at <= ? ORDER BY due_at")?
                .query_map([now()], |r| r.get(0))?
                .collect()
        })
        .await
    {
        Ok(due) => due,
        Err(e) => {
            tracing::warn!("schedule: {e}");
            return 0;
        }
    };
    let mut released = 0;
    for id in due {
        // Under the lock the row is read again: a cancel or edit since the scan wins.
        let _lock = LOCK.lock().await;
        let key = id.clone();
        let json: Option<String> = match outbox
            .db(move |conn| {
                conn.query_row("SELECT event FROM scheduled WHERE event_id = ? AND state = 'scheduled'", [key], |r| r.get(0)).optional()
            })
            .await
        {
            Ok(json) => json,
            Err(e) => {
                tracing::warn!("schedule: {e}");
                continue;
            }
        };
        let Some(json) = json else { continue };
        let (state, error) = match Event::from_json(&json) {
            Err(e) => ("failed", Some(format!("stored event is broken: {e}"))),
            Ok(ev) => match relay.ingest(ev).await {
                RelayMessage::Ok { status: true, .. } => ("released", None),
                RelayMessage::Ok { message, .. } if message.starts_with("error:") => {
                    tracing::warn!("schedule: cannot release {id}: {message}");
                    continue;
                }
                RelayMessage::Ok { message, .. } => ("failed", Some(message.into_owned())),
                _ => continue,
            },
        };
        if let Some(e) = &error {
            tracing::warn!("schedule: {id} not released: {e}");
        }
        let recorded = outbox
            .db(move |conn| {
                conn.execute(
                    "UPDATE scheduled SET state = ?1, error = ?2, released_at = ?3 WHERE event_id = ?4",
                    params![state, error, now(), id],
                )
            })
            .await;
        match recorded {
            Ok(_) => released += usize::from(state == "released"),
            Err(e) => tracing::warn!("schedule: cannot record the release: {e}"),
        }
    }
    released
}

/// The release worker. Its first scan runs at once: that is the catch-up after downtime.
pub fn spawn(outbox: Outbox, relay: Relay) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(SCAN);
        loop {
            tick.tick().await;
            let n = release_due(&outbox, &relay).await;
            if n > 0 {
                tracing::info!("schedule: released {n} scheduled video(s)");
            }
        }
    })
}

/// Hashes of pending videos: what no cleanup may remove.
pub(crate) fn pending_media(conn: &rusqlite::Connection) -> rusqlite::Result<HashSet<String>> {
    let mut stmt = conn.prepare("SELECT event FROM scheduled WHERE state = 'scheduled'")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut hashes = HashSet::new();
    for json in rows {
        hashes.extend(media_hashes(&json?));
    }
    Ok(hashes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Mirror;
    use super::Error;
    use nostr::prelude::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fixture {
        keys: Keys,
        path: std::path::PathBuf,
        outbox: Outbox,
        relay: Relay,
        state: almond::models::AppState,
    }

    fn open(path: &std::path::Path, keys: &Keys, state: &almond::models::AppState) -> (Outbox, Relay) {
        let relay = Relay::open(path, crate::relay::RelayConfig {
            writers: vec![keys.public_key()], name: "t".into(), description: "t".into(), mirror_relays: vec![],
        }).unwrap();
        let outbox = Outbox::open(path, Mirror::default(), true).unwrap();
        outbox.attach_storage(state.clone());
        (outbox, relay)
    }

    async fn fixture() -> Fixture {
        static N: AtomicUsize = AtomicUsize::new(0);
        let keys = Keys::generate();
        let path = std::env::temp_dir().join(format!("nostube-schedule-test-{}-{}.sqlite", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
        let _ = std::fs::remove_file(&path);
        let mut cfg = almond::Config::defaults();
        cfg.storage_path = path.with_extension("blossom");
        cfg.public_url = Some("https://instance.example".into());
        cfg.allowed_npubs = vec![keys.public_key()];
        cfg.storage_min_free = 0;
        cfg.homepage_enabled = false;
        let state = almond::build_state(&cfg.validate().unwrap()).await.unwrap();
        let (outbox, relay) = open(&path, &keys, &state);
        Fixture { keys, path, outbox, relay, state }
    }

    /// A blob in the real Almond storage, owned by the creator (as an upload leaves it).
    async fn blob(f: &Fixture, bytes: &[u8]) -> String {
        use sha2::Digest;
        let hash = format!("{:x}", sha2::Sha256::digest(bytes));
        let path = f.state.storage.uploads.join(format!("{hash}.mp4"));
        tokio::fs::create_dir_all(&f.state.storage.uploads).await.unwrap();
        tokio::fs::write(&path, bytes).await.unwrap();
        f.state.file_index.insert(hash.clone(), almond::models::FileMetadata {
            location: almond::models::FileLocation::Local(path), extension: Some("mp4".into()),
            mime_type: Some("video/mp4".into()), size: bytes.len() as u64, created_at: now() as u64,
            pubkey: None, expiration: None, origin: Default::default(),
        }).await;
        f.outbox.record_owner(hash.clone(), f.keys.public_key(), false).await.unwrap();
        hash
    }

    fn video(keys: &Keys, kind: u16, d: &str, hash: &str, due: i64) -> Event {
        let url = format!("https://instance.example/{hash}.mp4");
        EventBuilder::new(Kind::Custom(kind), "hello")
            .tags([
                Tag::parse(["d", d]).unwrap(),
                Tag::parse(["title", "clip"]).unwrap(),
                Tag::parse(["published_at", &due.to_string()]).unwrap(),
                Tag::parse(["imeta", format!("url {url}").as_str(), format!("x {hash}").as_str()]).unwrap(),
            ])
            .finalize(keys).unwrap()
    }

    async fn submit_event(f: &Fixture, event: &Event) -> Result<serde_json::Value, Error> {
        let key = [f.keys.public_key()];
        submit(&f.outbox, &key, &key, event.as_json().as_bytes()).await
    }

    fn why(result: Result<serde_json::Value, Error>) -> String {
        match result {
            Err(Error::Rejected(why)) => why,
            Err(Error::Failed(why)) => panic!("failed, not rejected: {why}"),
            Ok(_) => panic!("accepted"),
        }
    }

    async fn on_relay(f: &Fixture) -> Vec<Event> {
        f.relay.stored(Filter::new().kinds([Kind::Custom(34235), Kind::Custom(34236)])).await.unwrap()
    }

    async fn make_due(outbox: &Outbox) {
        outbox.db(|c| c.execute("UPDATE scheduled SET due_at = ?", [now() - 5])).await.unwrap();
    }

    async fn states(outbox: &Outbox) -> Vec<String> {
        outbox.db(|c| c.prepare("SELECT state FROM scheduled ORDER BY due_at")?.query_map([], |r| r.get(0))?.collect()).await.unwrap()
    }

    #[tokio::test]
    async fn invalid_submissions_are_rejected_and_nothing_is_stored() {
        let f = fixture().await;
        let hash = blob(&f, b"video bytes").await;
        let due = now() + 3600;
        let key = [f.keys.public_key()];

        let tampered = video(&f.keys, 34235, "a", &hash, due).as_json().replace("\"hello\"", "\"hellp\"");
        assert!(why(submit(&f.outbox, &key, &key, tampered.as_bytes()).await).starts_with("invalid: bad event id"));

        let stranger = Keys::generate();
        assert!(why(submit_event(&f, &video(&stranger, 34235, "a", &hash, due)).await).contains("not a creator"));
        // A creator the relay does not accept as writer is refused as well.
        let event = video(&f.keys, 34235, "a", &hash, due);
        assert!(why(submit(&f.outbox, &key, &[], event.as_json().as_bytes()).await).contains("not a creator"));

        assert!(why(submit_event(&f, &video(&f.keys, 1, "a", &hash, due)).await).contains("kind 34235 and 34236"));
        assert!(why(submit_event(&f, &video(&f.keys, 34235, "a", &hash, now() - 10)).await).contains("not in the future"));
        let unknown = "e".repeat(64);
        assert!(why(submit_event(&f, &video(&f.keys, 34235, "a", &unknown, due)).await).contains("not stored"));

        assert!(states(&f.outbox).await.is_empty());
        std::fs::remove_file(&f.path).ok();
    }

    #[tokio::test]
    async fn a_scheduled_video_is_hidden_until_due_and_released_after_downtime_on_startup() {
        let f = fixture().await;
        let hash = blob(&f, b"video bytes").await;
        let event = video(&f.keys, 34235, "clip", &hash, now() + 3600);
        submit_event(&f, &event).await.ok().expect("accepted");

        // Not due: a scan releases nothing and no relay table holds the video.
        assert_eq!(release_due(&f.outbox, &f.relay).await, 0);
        assert!(on_relay(&f).await.is_empty());
        assert_eq!(states(&f.outbox).await, ["scheduled"]);

        // The server goes down; the due time passes; the next boot releases it by itself.
        make_due(&f.outbox).await;
        let Fixture { keys, path, outbox, relay, state } = f;
        drop((outbox, relay));
        let (outbox, relay) = open(&path, &keys, &state);
        let worker = spawn(outbox.clone(), relay.clone());
        let mut seen = vec![];
        for _ in 0..50 {
            seen = relay.stored(Filter::new().kind(Kind::Custom(34235))).await.unwrap();
            if !seen.is_empty() { break }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        worker.abort();
        assert_eq!(seen.iter().map(|e| e.id).collect::<Vec<_>>(), [event.id]);
        assert_eq!(states(&outbox).await, ["released"]);
        // History is kept and a repeated scan does nothing.
        assert_eq!(release_due(&outbox, &relay).await, 0);
        std::fs::remove_file(&path).ok();
    }

    #[tokio::test]
    async fn editing_replaces_the_pending_event_and_only_unused_blobs_go() {
        let f = fixture().await;
        let (old, kept) = (blob(&f, b"old video").await, blob(&f, b"new video").await);
        submit_event(&f, &video(&f.keys, 34235, "clip", &old, now() + 3600)).await.ok().expect("accepted");
        let newer = video(&f.keys, 34235, "clip", &kept, now() + 7200);
        submit_event(&f, &newer).await.ok().expect("accepted");
        assert_eq!(states(&f.outbox).await, ["scheduled"], "same d tag: one pending version");

        let keys = Default::default();
        crate::outbox::run_due_for_test(&f.outbox, &keys).await;
        assert!(f.state.file_index.get(&old).await.is_none(), "replaced video's blob is removed");
        assert!(f.state.file_index.get(&kept).await.is_some(), "blob of the pending version stays");

        make_due(&f.outbox).await;
        assert_eq!(release_due(&f.outbox, &f.relay).await, 1);
        assert_eq!(on_relay(&f).await.iter().map(|e| e.id).collect::<Vec<_>>(), [newer.id]);
        std::fs::remove_file(&f.path).ok();
    }

    #[tokio::test]
    async fn cancelling_drops_the_event_and_removes_its_blobs_but_not_after_release() {
        let f = fixture().await;
        let hash = blob(&f, b"video bytes").await;
        let event = video(&f.keys, 34235, "clip", &hash, now() + 3600);
        submit_event(&f, &event).await.ok().expect("accepted");
        cancel(&f.outbox, event.id.to_hex()).await.ok().expect("cancelled");
        crate::outbox::run_due_for_test(&f.outbox, &Default::default()).await;
        assert!(f.state.file_index.get(&hash).await.is_none());
        assert!(states(&f.outbox).await.is_empty());
        make_due(&f.outbox).await;
        assert_eq!(release_due(&f.outbox, &f.relay).await, 0);
        assert!(on_relay(&f).await.is_empty());
        assert!(matches!(cancel(&f.outbox, event.id.to_hex()).await, Err(Error::Rejected(_))));

        // Once released the video is public: cancel no longer applies (the normal delete path does).
        let hash = blob(&f, b"other bytes").await;
        let event = video(&f.keys, 34235, "later", &hash, now() + 3600);
        submit_event(&f, &event).await.ok().expect("accepted");
        make_due(&f.outbox).await;
        assert_eq!(release_due(&f.outbox, &f.relay).await, 1);
        assert!(matches!(cancel(&f.outbox, event.id.to_hex()).await, Err(Error::Rejected(_))));
        assert!(f.state.file_index.get(&hash).await.is_some());
        std::fs::remove_file(&f.path).ok();
    }
}
