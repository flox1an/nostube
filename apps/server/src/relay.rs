//! The instance's own Nostr relay (ADR 0001, tickets #4 and #11): NIP-01, NIP-09 (`e` tags),
//! NIP-11, NIP-40. Writes from the allowed writers, reads open. Visitors may not publish
//! arbitrary events, but the relay acts as an interaction inbox for its own videos: NIP-22
//! comments (kind 1111, replies included), NIP-10 legacy replies (kind 1), NIP-25 reactions
//! (kind 7) and NIP-09 deletions of a visitor's own interactions are accepted when they
//! reference a locally stored video whose author is a current allowed writer. A `p`/`P`/`a`
//! tag is a claim, never proof: every target is resolved against this database, and unknown,
//! foreign or non-video targets are rejected.
//!
//! Ported from nostr-rs-relay (https://github.com/scsibug/nostr-rs-relay),
//! Copyright (c) 2021 Greg Heartsfield, MIT License. The schema, the persist rules
//! (replaceable/addressable/deletion) and the filter→SQL generation follow its
//! `repo/sqlite_migration.rs` and `repo/sqlite.rs`, rewritten onto axum ws, nostr 0.45
//! and rusqlite.

use std::{
    collections::HashMap,
    fmt::Write as _,
    path::{Path, PathBuf},
    sync::{Arc, Weak},
    time::Duration,
};

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        FromRequestParts,
    },
    http::{header, Request},
    response::{IntoResponse, Response},
};
use nostr::{
    event::EventId,
    filter::MatchEventOptions,
    nips::nip11::{Limitation, RelayInformationDocument},
    prelude::{ClientMessage, Event, Filter, PublicKey, RelayMessage, SubscriptionId, Timestamp},
};
use parking_lot::Mutex;
use rusqlite::{params, types::Value, Connection, OptionalExtension};
use tokio::sync::{broadcast, mpsc};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

// Request limits are fixed constants, not settings (#11).
/// Max bytes per WebSocket message and frame, which also bounds one event (#11: 128 KiB).
pub(crate) const MAX_MESSAGE_BYTES: usize = 128 * 1024;
/// Max open subscriptions per connection (#11).
const MAX_SUBSCRIPTIONS: usize = 32;
/// Max subscription id length in characters (#11).
const MAX_SUBID_LEN: usize = 256;
/// Events whose `created_at` is more than this far in the future are rejected (#11).
pub(crate) const MAX_FUTURE_SECS: u64 = 1800;
/// NIP-40 purge interval (upstream `repo/sqlite.rs` runs `cleanup_expired` every 600 s).
const EXPIRY_PURGE_EVERY: Duration = Duration::from_secs(600);
/// Idle read connections kept for reuse.
const IDLE_READERS: usize = 8;

/// Schema v1 (`PRAGMA user_version`): upstream's `event` + `tag` tables minus NIP-05,
/// NIP-26, accounts and invoices. `d_tag` holds the identifier of addressable events
/// (`""` when the tag is missing), so keep-newest needs no tag join.
const SCHEMA: &str = "
PRAGMA journal_mode = WAL;
PRAGMA user_version = 1;
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY,
  event_hash BLOB NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  author BLOB NOT NULL,
  kind INTEGER NOT NULL,
  d_tag TEXT,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS created_at_index ON event(created_at);
CREATE INDEX IF NOT EXISTS kind_created_at_index ON event(kind, created_at);
CREATE INDEX IF NOT EXISTS author_kind_index ON event(author, kind, created_at);
CREATE INDEX IF NOT EXISTS event_expiration ON event(expires_at);
CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  kind INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tag_val_index ON tag(value);
CREATE INDEX IF NOT EXISTS tag_composite_index ON tag(event_id, name, value);
CREATE INDEX IF NOT EXISTS tag_covering_index ON tag(name, kind, value, created_at, event_id);
-- Every locally stored version of a video event, so comments/reactions that reference a
-- superseded video id (the id the commenter saw) still resolve to the same video. The
-- current row lives in `event`; this table keeps the historical ids. Rows are recorded on
-- insert and removed when their video is deleted. Versions superseded before this table
-- existed cannot be recovered and stay unresolvable.
CREATE TABLE IF NOT EXISTS video_version (
  event_hash BLOB PRIMARY KEY,
  author BLOB NOT NULL,
  kind INTEGER NOT NULL,
  d_tag TEXT
);
-- Events the relay accepted from a visitor (comment/reply/reaction), so a NIP-09 deletion
-- can prove its targets were the sender's own accepted interactions, and so a repeated
-- deletion stays a harmless no-op after the target row is gone.
CREATE TABLE IF NOT EXISTS visitor_event (
  event_hash BLOB PRIMARY KEY,
  author BLOB NOT NULL
);
";

/// Per-connection pragmas (upstream `STARTUP_SQL`).
const STARTUP: &str = "
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA journal_size_limit = 32768;
PRAGMA temp_store = 2;
PRAGMA busy_timeout = 5000;
";

pub struct RelayConfig {
    pub writers: Vec<PublicKey>,
    pub name: String,
    pub description: String,
    /// Mirror relays (ADR 0009): each newly stored writer event gets an outbox job per target.
    pub mirror_relays: Vec<String>,
}

#[derive(Clone)]
pub struct Relay(Arc<Inner>);

struct Inner {
    path: PathBuf,
    /// The one writer connection; every write goes through it.
    writer: Mutex<Connection>,
    readers: Mutex<Vec<Connection>>,
    writers: Vec<PublicKey>,
    mirror_relays: Vec<String>,
    nip11: String,
    live: broadcast::Sender<Arc<Event>>,
}

impl Inner {
    /// An idle read connection, or a new one.
    fn reader(&self) -> rusqlite::Result<Connection> {
        match self.readers.lock().pop() {
            Some(c) => Ok(c),
            None => connect(&self.path),
        }
    }

    fn release(&self, conn: Connection) {
        let mut idle = self.readers.lock();
        if idle.len() < IDLE_READERS {
            idle.push(conn);
        }
    }
}

/// What `persist` did with an event.
#[derive(Debug, PartialEq)]
enum Saved {
    Stored,
    Duplicate,
    /// A newer replaceable/addressable version is stored.
    Superseded,
    /// Its author deleted it (NIP-09).
    Deleted,
}

/// What the studio overview shows of the relay.
pub struct RelayStats {
    /// Stored, unexpired events per kind, ascending by kind. Superseded and deleted events are
    /// gone from the table (`persist` deletes them), so they are not counted.
    pub by_kind: Vec<(u16, u64)>,
    /// The SQLite database file plus its write-ahead log (`-wal`); the `-shm` index is left out.
    pub database_bytes: u64,
}

impl Relay {
    /// Opens (or creates) the relay database. Must run inside a tokio runtime: it spawns
    /// the NIP-40 purge task.
    pub fn open(db: &Path, cfg: RelayConfig) -> Result<Relay, BoxError> {
        let writer = connect(db)?;
        writer.execute_batch(SCHEMA)?;
        writer.execute_batch(crate::outbox::SCHEMA)?;
        let relay = Relay(Arc::new(Inner {
            path: db.to_owned(),
            writer: Mutex::new(writer),
            readers: Mutex::new(Vec::new()),
            writers: cfg.writers,
            mirror_relays: cfg.mirror_relays,
            nip11: nip11_doc(cfg.name, cfg.description),
            live: broadcast::channel(1024).0,
        }));
        tokio::spawn(purge_expired(Arc::downgrade(&relay.0)));
        Ok(relay)
    }

    #[cfg(test)]
    async fn ingest(&self, ev: Event) -> RelayMessage<'static> {
        self.ingest_from(ev, false).await
    }

    /// `mirrored`: another instance's outbox sent it (`outbox::is_mirror_delivery`), so it is
    /// stored but not passed on to this instance's mirrors.
    async fn ingest_from(&self, ev: Event, mirrored: bool) -> RelayMessage<'static> {
        let id = ev.id;
        if ev.verify().is_err() {
            return RelayMessage::ok(id, false, "invalid: bad event id or signature");
        }
        if !self.0.writers.contains(&ev.pubkey) && visitor_scope(&ev).is_none() {
            return RelayMessage::ok(id, false, "restricted: only this instance's allowed writers may publish");
        }
        if ev.created_at.as_secs() > Timestamp::now().as_secs() + MAX_FUTURE_SECS {
            return RelayMessage::ok(id, false, "invalid: created_at is too far in the future");
        }
        if ev.is_expired() {
            return RelayMessage::ok(id, false, "invalid: event has expired");
        }
        let ev = Arc::new(ev);
        if !ev.kind.is_ephemeral() {
            let inner = self.0.clone();
            let row = ev.clone();
            let saved = tokio::task::spawn_blocking(move || {
                let mirror: &[String] = if mirrored { &[] } else { &inner.mirror_relays };
                admit(&mut inner.writer.lock(), &inner.writers, mirror, &row)
            })
            .await;
            match saved {
                Ok(Ok(Ok(Saved::Stored))) => {}
                Ok(Ok(Ok(Saved::Duplicate))) => {
                    return RelayMessage::ok(id, true, "duplicate: already have this event")
                }
                Ok(Ok(Ok(Saved::Superseded))) => {
                    return RelayMessage::ok(id, true, "duplicate: a newer version of this event is stored")
                }
                Ok(Ok(Ok(Saved::Deleted))) => {
                    return RelayMessage::ok(id, false, "blocked: this event was deleted by its author")
                }
                Ok(Ok(Err(refusal))) => return RelayMessage::ok(id, false, refusal.to_owned()),
                Ok(Err(e)) => return RelayMessage::ok(id, false, format!("error: {e}")),
                Err(e) => return RelayMessage::ok(id, false, format!("error: {e}")),
            }
        }
        let _ = self.0.live.send(ev);
        RelayMessage::ok(id, true, "")
    }

    /// Streams the stored events matching `filters` as ready-to-send `EVENT` messages.
    /// The query stops when the receiver is dropped (client gone).
    fn query(&self, sub: &SubscriptionId, filters: Vec<Filter>) -> mpsc::Receiver<String> {
        let (tx, rx) = mpsc::channel(256);
        let prefix = format!("[\"EVENT\",{},", serde_json::Value::from(sub.as_str()));
        let inner = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let conn = match inner.reader() {
                Ok(c) => c,
                Err(e) => return tracing::warn!("relay: opening read connection: {e}"),
            };
            let now = Timestamp::now().as_secs() as i64;
            if let Err(e) = run_query(&conn, &filters, now, |content| tx.blocking_send(format!("{prefix}{content}]")).is_ok()) {
                tracing::warn!("relay: query failed: {e}");
            }
            inner.release(conn);
        });
        rx
    }

    /// Event counts and database size for the admin overview, read on a read connection.
    pub async fn stats(&self) -> Result<RelayStats, BoxError> {
        let inner = self.0.clone();
        tokio::task::spawn_blocking(move || -> Result<RelayStats, BoxError> {
            let conn = inner.reader()?;
            let by_kind = count_by_kind(&conn, Timestamp::now().as_secs() as i64);
            inner.release(conn);
            let mut wal = inner.path.clone().into_os_string();
            wal.push("-wal");
            let wal = match std::fs::metadata(wal) {
                Ok(m) => m.len(),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
                Err(e) => return Err(e.into()),
            };
            Ok(RelayStats { by_kind: by_kind?, database_bytes: std::fs::metadata(&inner.path)?.len() + wal })
        })
        .await?
    }

    async fn session(self, mut ws: WebSocket, mirrored: bool) {
        let mut live = self.0.live.subscribe();
        let mut subs: HashMap<SubscriptionId, Vec<Filter>> = HashMap::new();
        loop {
            let out: Vec<RelayMessage> = tokio::select! {
                msg = ws.recv() => match msg {
                    Some(Ok(Message::Text(text))) => match ClientMessage::from_json(text.as_str()) {
                        Ok(ClientMessage::Event(ev)) => vec![self.ingest_from(ev.into_owned(), mirrored).await],
                        Ok(ClientMessage::Req { subscription_id, filters }) => {
                            let id = subscription_id.into_owned();
                            if id.as_str().chars().count() > MAX_SUBID_LEN {
                                vec![RelayMessage::closed(id, "invalid: subscription id is longer than 256 characters")]
                            } else if subs.len() >= MAX_SUBSCRIPTIONS && !subs.contains_key(&id) {
                                vec![RelayMessage::closed(id, "error: too many subscriptions (max 32)")]
                            } else {
                                // NIP-50 is not supported: ignore `search` and return the superset.
                                let filters: Vec<Filter> = filters.into_iter().map(|f| f.into_owned().remove_search()).collect();
                                let mut stored = self.query(&id, filters.clone());
                                subs.insert(id.clone(), filters);
                                while let Some(text) = stored.recv().await {
                                    if ws.send(Message::Text(text.into())).await.is_err() {
                                        return;
                                    }
                                }
                                vec![RelayMessage::eose(id)]
                            }
                        }
                        Ok(ClientMessage::Close(id)) => {
                            subs.remove(id.as_ref());
                            vec![]
                        }
                        Ok(_) => vec![RelayMessage::notice("error: unsupported message type")],
                        Err(e) => vec![RelayMessage::notice(format!("invalid: {e}"))],
                    },
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => return,
                    Some(Ok(_)) => continue,
                },
                ev = live.recv() => match ev {
                    Ok(ev) => subs
                        .iter()
                        .filter(|(_, fs)| fs.iter().any(|f| f.match_event(&ev, MatchEventOptions::new())))
                        .map(|(id, _)| RelayMessage::event(id.clone(), (*ev).clone()))
                        .collect(),
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => return,
                },
            };
            for m in out {
                if ws.send(Message::Text(m.as_json().into())).await.is_err() {
                    return;
                }
            }
        }
    }
}

pub(crate) fn connect(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(STARTUP)?;
    Ok(conn)
}

/// Stored events per kind that are not expired at `now` (same rule as `filter_sql`).
fn count_by_kind(conn: &Connection, now: i64) -> rusqlite::Result<Vec<(u16, u64)>> {
    let mut stmt = conn.prepare(
        "SELECT kind, COUNT(*) FROM event WHERE expires_at IS NULL OR expires_at >= ? GROUP BY kind ORDER BY kind",
    )?;
    let rows = stmt.query_map([now], |r| Ok((r.get(0)?, r.get::<_, i64>(1)? as u64)))?;
    rows.collect()
}

/// NIP-01 replaceable kinds. Not `Kind::is_replaceable`: that also counts kind 41 (NIP-28),
/// which is not replaceable per author.
fn is_replaceable(kind: u16) -> bool {
    kind == 0 || kind == 3 || (10000..20000).contains(&kind)
}

/// Video kinds a visitor interaction may target (NIP-71).
fn is_video_kind(kind: u16) -> bool {
    matches!(kind, 21 | 22 | 34235 | 34236)
}

/// What a non-writer event wants to be. `None` = no visitor scope, plain rejection.
#[derive(Clone, Copy, PartialEq)]
enum VisitorScope {
    /// NIP-22 comment (kind 1111), replies to comments included.
    Comment,
    /// NIP-10 legacy reply (kind 1) rooted at a video: only the marker form the web app sends.
    LegacyReply,
    /// NIP-25 reaction (kind 7).
    Reaction,
    /// NIP-09 deletion of the sender's own accepted interactions (kind 5).
    Deletion,
}

/// The visitor scope an event claims, if any.
fn visitor_scope(ev: &Event) -> Option<VisitorScope> {
    match ev.kind.as_u16() {
        1111 => Some(VisitorScope::Comment),
        1 => Some(VisitorScope::LegacyReply),
        7 => Some(VisitorScope::Reaction),
        5 => Some(VisitorScope::Deletion),
        _ => None,
    }
}

/// All tags of `ev` as string vectors. Parsed from the event's canonical JSON so the policy
/// does not depend on how the nostr crate models uppercase NIP-22 tags (`A`/`E`/`K`/`P`).
fn tag_list(ev: &Event) -> Vec<Vec<String>> {
    serde_json::from_str::<serde_json::Value>(&ev.as_json())
        .ok()
        .and_then(|v| serde_json::from_value(v.get("tags").cloned().unwrap_or_default()).ok())
        .unwrap_or_default()
}

/// All tags of a stored event's JSON (same shape as [`tag_list`]).
fn stored_tags(content: &str) -> Vec<Vec<String>> {
    serde_json::from_str::<serde_json::Value>(content)
        .ok()
        .and_then(|v| serde_json::from_value(v.get("tags").cloned().unwrap_or_default()).ok())
        .unwrap_or_default()
}

fn tags_named<'a>(tags: &'a [Vec<String>], name: &'a str) -> impl Iterator<Item = &'a [String]> {
    tags.iter()
        .filter(move |t| t.len() >= 2 && t[0] == name)
        .map(|t| t.as_slice())
}

/// A locally known video: the current row or a recorded historical version.
#[derive(Debug)]
struct VideoRef {
    author: Vec<u8>,
    kind: u16,
    d_tag: Option<String>,
}

fn video_is_allowed(writers: &[PublicKey], video: &VideoRef) -> bool {
    let Ok(author) = PublicKey::from_slice(&video.author) else {
        return false;
    };
    writers.contains(&author) && is_video_kind(video.kind)
}

/// Resolves a video event id against the current rows and the historical version table.
fn video_by_id(conn: &Connection, id: &EventId) -> Option<VideoRef> {
    let id = id.as_bytes().as_slice();
    if let Ok((author, kind, d_tag)) = conn.query_row(
        "SELECT author, kind, d_tag FROM event WHERE event_hash = ?",
        params![id],
        |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, u16>(1)?, r.get::<_, Option<String>>(2)?)),
    ) {
        return Some(VideoRef { author, kind, d_tag });
    }
    conn.query_row(
        "SELECT author, kind, d_tag FROM video_version WHERE event_hash = ?",
        params![id],
        |r| Ok(VideoRef { author: r.get(0)?, kind: r.get(1)?, d_tag: r.get(2)? }),
    )
    .optional()
    .ok()
    .flatten()
}

/// Resolves a video coordinate (`kind:pubkey:d`) against the current row only: an update
/// keeps the coordinate, so the newest version is the video.
fn video_by_coordinate(conn: &Connection, value: &str) -> Option<VideoRef> {
    let mut parts = value.splitn(3, ':');
    let kind = parts.next()?.parse::<u16>().ok()?;
    let author = PublicKey::from_hex(parts.next()?).ok()?;
    let d_tag = parts.next()?;
    if d_tag.is_empty() || !is_video_kind(kind) {
        return None;
    }
    let row = conn
        .query_row(
            "SELECT author FROM event WHERE author = ? AND kind = ? AND d_tag = ?",
            params![author.as_bytes().as_slice(), kind, d_tag],
            |r| r.get::<_, Vec<u8>>(0),
        )
        .optional()
        .ok()
        .flatten()?;
    Some(VideoRef { author: row, kind, d_tag: Some(d_tag.to_owned()) })
}

/// Root video of a comment/reaction id already stored here: kind 1111 resolves via its
/// uppercase `A`/`E` root, a legacy kind-1 reply via its `root`-marked `e`. Reactions and
/// anything else are not valid interaction targets.
fn interaction_root_video(
    conn: &Connection,
    writers: &[PublicKey],
    id: &EventId,
) -> Option<VideoRef> {
    let (kind, content) = conn
        .query_row(
            "SELECT kind, content FROM event WHERE event_hash = ?",
            params![id.as_bytes().as_slice()],
            |r| Ok((r.get::<_, u16>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .ok()
        .flatten()?;
    let tags = stored_tags(&content);
    match kind {
        1111 => {
            let root = tags_named(&tags, "A").next().or_else(|| tags_named(&tags, "E").next())?;
            let video = match root[0].as_str() {
                "A" => video_by_coordinate(conn, &root[1])?,
                _ => video_by_id(conn, &EventId::from_hex(&root[1]).ok()?)?,
            };
            video_is_allowed(writers, &video).then_some(video)
        }
        1 => {
            let root = tags_named(&tags, "e")
                .find(|t| t.len() >= 4 && t[3] == "root")?;
            let video = video_by_id(conn, &EventId::from_hex(&root[1]).ok()?)?;
            video_is_allowed(writers, &video).then_some(video)
        }
        _ => None,
    }
}

fn same_video(a: &VideoRef, b: &VideoRef) -> bool {
    a.author == b.author && a.kind == b.kind && a.d_tag == b.d_tag
}

/// Rejects a visitor event that is outside the interaction inbox policy. `Ok(())` means the
/// event may be persisted. Every target is resolved locally; nothing is fetched.
fn check_visitor(
    conn: &Connection,
    writers: &[PublicKey],
    ev: &Event,
    scope: VisitorScope,
) -> Result<(), &'static str> {
    match scope {
        VisitorScope::Deletion => check_visitor_deletion(conn, ev),
        VisitorScope::Reaction => check_visitor_reaction(conn, writers, ev),
        VisitorScope::Comment | VisitorScope::LegacyReply => {
            check_visitor_comment(conn, writers, ev, scope)
        }
    }
}

/// NIP-22 comment (top-level or reply) rooted at a local video of an allowed writer, or a
/// NIP-10 legacy reply of the exact marker form. Root and parent references must be
/// consistent; unknown or conflicting references are refused.
fn check_visitor_comment(
    conn: &Connection,
    writers: &[PublicKey],
    ev: &Event,
    scope: VisitorScope,
) -> Result<(), &'static str> {
    let tags = tag_list(ev);

    if scope == VisitorScope::LegacyReply {
        return check_legacy_reply(conn, writers, &tags);
    }

    // Root scope: the A coordinate wins; an additional E must be the same video.
    let a_roots: Vec<_> = tags_named(&tags, "A").collect();
    let e_roots: Vec<_> = tags_named(&tags, "E").collect();
    if a_roots.len() + e_roots.len() != 1 || (!a_roots.is_empty() && !e_roots.is_empty()) {
        return Err("restricted: comments need exactly one A or E video root");
    }
    let video = if let Some(root) = a_roots.first() {
        video_by_coordinate(conn, &root[1]).filter(|v| video_is_allowed(writers, v))
    } else {
        let root = e_roots.first().expect("exactly one root");
        let id = EventId::from_hex(&root[1]).map_err(|_| "restricted: invalid comment root")?;
        video_by_id(conn, &id).filter(|v| video_is_allowed(writers, v))
    }
    .ok_or("restricted: comments may only reference videos of this instance's allowed writers")?;

    // K is mandatory and names the root kind; P must be the root author.
    let kinds: Vec<_> = tags_named(&tags, "K").collect();
    if kinds.len() != 1 || kinds[0][1] != video.kind.to_string() {
        return Err("restricted: comment K tag must name the referenced video kind");
    }
    if tags_named(&tags, "P").any(|p| p[1] != PublicKey::from_slice(&video.author).expect("stored key").to_hex()) {
        return Err("restricted: comment P tag does not match the video author");
    }

    // Parent refs: video versions (top-level self-refs) plus at most one stored comment,
    // whose own root must be this video.
    let mut parent: Option<(EventId, Vec<u8>)> = None;
    for e in tags_named(&tags, "e") {
        let id = EventId::from_hex(&e[1]).map_err(|_| "restricted: invalid comment parent")?;
        if video_by_id(conn, &id).is_some_and(|v| same_video(&v, &video)) {
            continue;
        }
        if parent.is_some() {
            return Err("restricted: comment has more than one parent reference");
        }
        let author = stored_interaction_author(conn, &id, &video, writers)?
            .ok_or("restricted: comment parent is not a known interaction on this video")?;
        parent = Some((id, author));
    }
    for a in tags_named(&tags, "a") {
        video_by_coordinate(conn, &a[1])
            .filter(|v| same_video(&v, &video))
            .ok_or("restricted: comment a tag does not match the referenced video")?;
    }
    let expected_parent = match &parent {
        Some((_, author)) => author.clone(),
        None => video.author.clone(),
    };
    let expected = PublicKey::from_slice(&expected_parent).expect("stored key").to_hex();
    if tags_named(&tags, "p").any(|p| p[1] != expected) {
        return Err("restricted: comment p tag does not match its parent author");
    }
    Ok(())
}

/// Author of a stored kind-1111/kind-1 interaction on `video`, if it is a valid parent.
fn stored_interaction_author(
    conn: &Connection,
    id: &EventId,
    video: &VideoRef,
    writers: &[PublicKey],
) -> Result<Option<Vec<u8>>, &'static str> {
    let row = conn
        .query_row(
            "SELECT author, kind FROM event WHERE event_hash = ?",
            params![id.as_bytes().as_slice()],
            |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, u16>(1)?)),
        )
        .optional()
        .map_err(|_| "error: lookup failed")?;
    let Some((author, kind)) = row else { return Ok(None) };
    match kind {
        1111 | 1 => {
            let root = interaction_root_video(conn, writers, id)
                .ok_or("restricted: comment parent is not rooted at an allowed video")?;
            if same_video(&root, video) { Ok(Some(author)) } else { Ok(None) }
        }
        _ => Ok(None),
    }
}

/// Legacy kind-1 note threaded onto a video: exactly one `root`-marked e (the video) and at
/// most one `reply`-marked e (a stored interaction on that video); no other e references.
fn check_legacy_reply(
    conn: &Connection,
    writers: &[PublicKey],
    tags: &[Vec<String>],
) -> Result<(), &'static str> {
    let mut root: Option<(&[String], VideoRef)> = None;
    for e in tags_named(tags, "e") {
        if e.len() >= 4 && e[3] == "root" {
            if root.is_some() {
                return Err("restricted: reply has more than one root marker");
            }
            let id = EventId::from_hex(&e[1]).map_err(|_| "restricted: invalid reply root")?;
            let video = video_by_id(conn, &id)
                .filter(|v| video_is_allowed(writers, v))
                .ok_or("restricted: replies may only reference videos of this instance's allowed writers")?;
            root = Some((e, video));
        }
    }
    let (_, video) = root.ok_or("restricted: legacy replies need a root-marked video")?;

    let mut reply: Option<Vec<u8>> = None;
    for e in tags_named(tags, "e") {
        if e.len() >= 4 && e[3] == "reply" {
            if reply.is_some() {
                return Err("restricted: reply has more than one reply marker");
            }
            let id = EventId::from_hex(&e[1]).map_err(|_| "restricted: invalid reply target")?;
            let author = stored_interaction_author(conn, &id, &video, writers)?
                .ok_or("restricted: reply target is not a known interaction on this video")?;
            reply = Some(author);
        } else if e.len() < 4 || (e[3] != "root" && e[3] != "reply") {
            let id = EventId::from_hex(&e[1]).map_err(|_| "restricted: invalid reply reference")?;
            if video_by_id(conn, &id).map_or(true, |v| !same_video(&v, &video)) {
                return Err("restricted: reply references something other than its video");
            }
        }
    }

    let video_author = PublicKey::from_slice(&video.author).expect("stored key").to_hex();
    let parent_author = reply
        .map(|a| PublicKey::from_slice(&a).expect("stored key").to_hex())
        .unwrap_or_default();
    if tags_named(tags, "p").any(|p| p[1] != video_author && p[1] != parent_author) {
        return Err("restricted: reply p tag matches neither the video nor the parent author");
    }
    Ok(())
}

/// NIP-25 reaction: the target is the last `e` (or the `a` coordinate), and it must be the
/// video or a stored interaction under it; every other `e` must stay inside that video's
/// scope. No reaction-on-reaction chains.
fn check_visitor_reaction(
    conn: &Connection,
    writers: &[PublicKey],
    ev: &Event,
) -> Result<(), &'static str> {
    let tags = tag_list(ev);
    let es: Vec<&[String]> = tags_named(&tags, "e").collect();
    if es.is_empty() {
        return Err("restricted: reactions need an e target");
    }
    let target_id =
        EventId::from_hex(&es[es.len() - 1][1]).map_err(|_| "restricted: invalid reaction target")?;

    let row = conn
        .query_row(
            "SELECT author, kind, d_tag FROM event WHERE event_hash = ?",
            params![target_id.as_bytes().as_slice()],
            |r| {
                Ok((
                    r.get::<_, Vec<u8>>(0)?,
                    r.get::<_, u16>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "error: lookup failed")?
        .or_else(|| {
            // The target may be a superseded video version; the mapping only holds videos.
            conn.query_row(
                "SELECT author, kind, d_tag FROM video_version WHERE event_hash = ?",
                params![target_id.as_bytes().as_slice()],
                |r| {
                    Ok((
                        r.get::<_, Vec<u8>>(0)?,
                        r.get::<_, u16>(1)?,
                        r.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()
            .ok()
            .flatten()
        });
    let Some((target_author, target_kind, target_d_tag)) = row else {
        return Err("restricted: reaction target is not stored here");
    };

    let video = match target_kind {
        k if is_video_kind(k) => VideoRef {
            author: target_author.clone(),
            kind: k,
            d_tag: target_d_tag,
        },
        1111 | 1 => {
            interaction_root_video(conn, writers, &target_id)
                .ok_or("restricted: reaction target is not rooted at an allowed video")?
        }
        _ => return Err("restricted: reactions may only target videos or their comments"),
    };
    if !video_is_allowed(writers, &video) {
        return Err("restricted: reactions may only target videos of this instance's allowed writers");
    }

    // Every e reference must belong to this video: the video itself (any version) or a
    // stored interaction on it. Unknown ids cannot smuggle another scope in.
    for e in &es {
        let id = EventId::from_hex(&e[1]).map_err(|_| "restricted: invalid reaction reference")?;
        if video_by_id(conn, &id).is_some_and(|v| same_video(&v, &video)) {
            continue;
        }
        let in_scope = stored_interaction_author(conn, &id, &video, writers)?
            .is_some();
        if !in_scope {
            return Err("restricted: reaction references something outside the target video");
        }
    }

    let target_author_hex =
        PublicKey::from_slice(&target_author).expect("stored key").to_hex();
    if tags_named(&tags, "p").any(|p| p[1] != target_author_hex) {
        return Err("restricted: reaction p tag does not match the target author");
    }
    if tags_named(&tags, "k").any(|k| k[1] != target_kind.to_string()) {
        return Err("restricted: reaction k tag does not match the target kind");
    }
    for a in tags_named(&tags, "a") {
        let coord = video_by_coordinate(conn, &a[1])
            .filter(|v| video_is_allowed(writers, v))
            .ok_or("restricted: reaction a tag is not an allowed video")?;
        if !same_video(&coord, &video) {
            return Err("restricted: reaction a tag does not match its target");
        }
    }
    Ok(())
}

/// NIP-09 deletion of the sender's own accepted interactions; nothing else.
fn check_visitor_deletion(conn: &Connection, ev: &Event) -> Result<(), &'static str> {
    let tags = tag_list(ev);
    if tags_named(&tags, "a").next().is_some() {
        return Err("restricted: visitors may not delete by address");
    }
    let targets: Vec<_> = tags_named(&tags, "e").collect();
    if targets.is_empty() {
        return Err("restricted: deletions need at least one e target");
    }
    let author = ev.pubkey.as_bytes().as_slice();
    for e in targets {
        let id = EventId::from_hex(&e[1]).map_err(|_| "restricted: invalid deletion target")?;
        let owner: Option<Vec<u8>> = conn
            .query_row(
                "SELECT author FROM visitor_event WHERE event_hash = ?",
                params![id.as_bytes().as_slice()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| "error: lookup failed")?;
        if owner.as_deref() != Some(author) {
            return Err("restricted: you may only delete your own interactions");
        }
    }
    Ok(())
}

/// Validates visitor events and records/persists them; writer events pass straight through and
/// are queued for the `mirror` relays.
fn admit(
    conn: &mut Connection,
    writers: &[PublicKey],
    mirror: &[String],
    ev: &Event,
) -> rusqlite::Result<Result<Saved, &'static str>> {
    if writers.contains(&ev.pubkey) {
        return persist(conn, ev, mirror).map(Ok);
    }
    let Some(scope) = visitor_scope(ev) else {
        return Ok(Err("restricted: only this instance's allowed writers may publish"));
    };
    if let Err(refusal) = check_visitor(conn, writers, ev, scope) {
        return Ok(Err(refusal));
    }
    let saved = persist(conn, ev, &[])?;
    if matches!(saved, Saved::Stored | Saved::Duplicate) && ev.kind.as_u16() != 5 {
        conn.execute(
            "INSERT OR IGNORE INTO visitor_event (event_hash, author) VALUES (?, ?)",
            params![ev.id.as_bytes().as_slice(), ev.pubkey.as_bytes().as_slice()],
        )?;
    }
    Ok(Ok(saved))
}


/// Upstream `persist_event`, minus NIP-26 and with deletion as real deletes: keeps only the
/// newest replaceable/addressable version (tie: lowest id), applies kind-5 `e` deletions of
/// the same author, and refuses events their author already deleted. A stored event gets an
/// outbox job per `mirror` target in the same transaction.
fn persist(conn: &mut Connection, ev: &Event, mirror: &[String]) -> rusqlite::Result<Saved> {
    let tx = conn.transaction()?;
    let id = ev.id.as_bytes().as_slice();
    let author = ev.pubkey.as_bytes().as_slice();
    let kind = ev.kind.as_u16();
    let created_at = ev.created_at.as_secs() as i64;
    let d_tag = ev.kind.is_addressable().then(|| ev.tags.identifier().unwrap_or_default());

    if kind != 5 {
        let deleted = tx
            .query_row(
                "SELECT 1 FROM tag t JOIN event e ON e.id = t.event_id
                 WHERE t.name = 'e' AND t.kind = 5 AND t.value = ? AND e.author = ?",
                params![ev.id.to_hex(), author],
                |_| Ok(()),
            )
            .optional()?;
        if deleted.is_some() {
            return Ok(Saved::Deleted);
        }
    }

    // Replaceable and addressable share one rule; `d_tag IS ?` is NULL IS NULL for replaceable.
    let versioned = is_replaceable(kind) || d_tag.is_some();
    if versioned {
        let newer = tx
            .query_row(
                "SELECT 1 FROM event WHERE author = ?1 AND kind = ?2 AND d_tag IS ?3
                 AND (created_at > ?4 OR (created_at = ?4 AND event_hash < ?5)) LIMIT 1",
                params![author, kind, d_tag, created_at, id],
                |_| Ok(()),
            )
            .optional()?;
        if newer.is_some() {
            return Ok(Saved::Superseded);
        }
    }

    let inserted = tx.execute(
        "INSERT OR IGNORE INTO event (event_hash, created_at, expires_at, author, kind, d_tag, content)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![
            id,
            created_at,
            ev.tags.expiration().map(|t| t.as_secs() as i64),
            author,
            kind,
            d_tag,
            ev.as_json()
        ],
    )?;
    if inserted == 0 {
        return Ok(Saved::Duplicate);
    }
    let row = tx.last_insert_rowid();

    // Remember this video version so interactions referencing its id keep resolving after a
    // newer version replaces it.
    if is_video_kind(kind) {
        tx.execute(
            "INSERT OR IGNORE INTO video_version (event_hash, author, kind, d_tag) VALUES (?, ?, ?, ?)",
            params![id, author, kind, d_tag],
        )?;
    }

    {
        let mut add_tag =
            tx.prepare_cached("INSERT INTO tag (event_id, name, value, kind, created_at) VALUES (?, ?, ?, ?, ?)")?;
        for tag in ev.tags.iter() {
            if let (Some(name), Some(value)) = (tag.single_letter_tag(), tag.content()) {
                add_tag.execute(params![row, name.to_string(), value, kind, created_at])?;
            }
        }
    }

    if versioned {
        tx.execute(
            "DELETE FROM event WHERE author = ? AND kind = ? AND d_tag IS ? AND id != ?",
            params![author, kind, d_tag, row],
        )?;
    }

    if kind == 5 {
        // A deletion of a deletion has no effect (NIP-09).
        let mut delete = tx.prepare_cached("DELETE FROM event WHERE event_hash = ? AND author = ? AND kind != 5")?;
        for target in ev.tags.event_ids() {
            delete.execute(params![target.as_bytes().as_slice(), author])?;
            // A deleted video stops being a valid interaction target, even by historical id.
            tx.execute(
                "DELETE FROM video_version WHERE event_hash = ?",
                params![target.as_bytes().as_slice()],
            )?;
        }
    }

    crate::outbox::enqueue_event(&tx, mirror, &ev.id)?;
    tx.commit()?;
    Ok(Saved::Stored)
}

/// Upstream `query_from_filter`, against `nostr::Filter`. Empty `ids`/`authors`/`kinds` match
/// everything and an empty tag value set matches nothing, as in `Filter::match_event`.
/// Integers go into the SQL text; everything else is a parameter.
fn filter_sql(f: &Filter, now: i64, params: &mut Vec<Value>) -> String {
    fn vars(n: usize) -> String {
        vec!["?"; n].join(",")
    }
    let mut w = vec!["(e.expires_at IS NULL OR e.expires_at >= ?)".to_owned()];
    params.push(Value::Integer(now));
    if let Some(ids) = f.ids.as_ref().filter(|s| !s.is_empty()) {
        w.push(format!("e.event_hash IN ({})", vars(ids.len())));
        params.extend(ids.iter().map(|i| Value::Blob(i.as_bytes().to_vec())));
    }
    if let Some(authors) = f.authors.as_ref().filter(|s| !s.is_empty()) {
        w.push(format!("e.author IN ({})", vars(authors.len())));
        params.extend(authors.iter().map(|a| Value::Blob(a.as_bytes().to_vec())));
    }
    let mut narrow = String::new(); // repeated inside tag subqueries so tag_covering_index applies
    if let Some(kinds) = f.kinds.as_ref().filter(|s| !s.is_empty()) {
        let list: Vec<String> = kinds.iter().map(|k| k.as_u16().to_string()).collect();
        let _ = write!(narrow, " AND kind IN ({})", list.join(","));
    }
    if let Some(since) = f.since {
        let _ = write!(narrow, " AND created_at >= {}", since.as_secs());
    }
    if let Some(until) = f.until {
        let _ = write!(narrow, " AND created_at <= {}", until.as_secs());
    }
    for (name, values) in &f.generic_tags {
        w.push(format!(
            "e.id IN (SELECT event_id FROM tag WHERE name = ? AND value IN ({}){narrow})",
            vars(values.len())
        ));
        params.push(Value::Text(name.to_string()));
        params.extend(values.iter().map(|v| Value::Text(v.clone())));
    }
    // Unqualified `kind`/`created_at` resolve to `tag` inside the subqueries, `event` here.
    let mut sql = format!(
        "SELECT * FROM (SELECT e.created_at, e.event_hash, e.content FROM event e WHERE {}{narrow} \
         ORDER BY e.created_at DESC, e.event_hash",
        w.join(" AND "),
    );
    if let Some(limit) = f.limit {
        let _ = write!(sql, " LIMIT {limit}");
    }
    sql.push(')');
    sql
}

/// Runs a REQ's filters as one query (per-filter `limit`, deduplicated by UNION), newest
/// first then lowest id, and hands each stored event's JSON to `each` until it returns false.
fn run_query(conn: &Connection, filters: &[Filter], now: i64, mut each: impl FnMut(String) -> bool) -> rusqlite::Result<()> {
    if filters.is_empty() {
        return Ok(());
    }
    let mut params = Vec::new();
    let parts: Vec<String> = filters.iter().map(|f| filter_sql(f, now, &mut params)).collect();
    let sql = format!("{} ORDER BY created_at DESC, event_hash", parts.join(" UNION "));
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(rusqlite::params_from_iter(params))?;
    while let Some(row) = rows.next()? {
        if !each(row.get(2)?) {
            break;
        }
    }
    Ok(())
}

async fn purge_expired(relay: Weak<Inner>) {
    loop {
        tokio::time::sleep(EXPIRY_PURGE_EVERY).await;
        let Some(inner) = relay.upgrade() else { return };
        let purged = tokio::task::spawn_blocking(move || {
            inner
                .writer
                .lock()
                .execute("DELETE FROM event WHERE expires_at < ?", [Timestamp::now().as_secs() as i64])
        })
        .await;
        if let Ok(Err(e)) = purged {
            tracing::warn!("relay: purging expired events: {e}");
        }
    }
}

fn nip11_doc(name: String, description: String) -> String {
    RelayInformationDocument {
        name: Some(name),
        description: Some(description),
        supported_nips: Some(vec![1, 9, 11, 40]),
        software: Some("nostube-server".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        limitation: Some(Limitation {
            max_message_length: Some(MAX_MESSAGE_BYTES as i32),
            max_subscriptions: Some(MAX_SUBSCRIPTIONS as i32),
            max_subid_length: Some(MAX_SUBID_LEN as i32),
            created_at_upper_limit: Some(Timestamp::from(MAX_FUTURE_SECS)),
            restricted_writes: Some(true),
            auth_required: Some(false),
            payment_required: Some(false),
            ..Default::default()
        }),
        ..Default::default()
    }
    .as_json()
}

pub fn wants_nip11(req: &Request<Body>) -> bool {
    req.headers()
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("application/nostr+json"))
}

pub fn is_ws_upgrade(req: &Request<Body>) -> bool {
    req.headers()
        .get(header::UPGRADE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.eq_ignore_ascii_case("websocket"))
}

pub async fn handle(relay: Relay, req: Request<Body>) -> Response {
    if !is_ws_upgrade(&req) {
        return (
            [
                (header::CONTENT_TYPE, "application/nostr+json"),
                (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
                (header::ACCESS_CONTROL_ALLOW_HEADERS, "*"),
                (header::ACCESS_CONTROL_ALLOW_METHODS, "GET"),
            ],
            relay.0.nip11.clone(),
        )
            .into_response();
    }
    let (mut parts, _) = req.into_parts();
    let mirrored = crate::outbox::is_mirror_delivery(&parts.headers);
    match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        Ok(ws) => ws
            .max_message_size(MAX_MESSAGE_BYTES)
            .max_frame_size(MAX_MESSAGE_BYTES)
            .on_upgrade(move |socket| relay.session(socket, mirrored))
            .into_response(),
        Err(rejection) => rejection.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::prelude::{EventBuilder, FinalizeEvent, Keys, Kind, Tag};
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn open(writers: Vec<PublicKey>) -> Relay {
        static N: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "nostube-relay-test-{}-{}.sqlite",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_file(&path);
        let cfg = RelayConfig { writers, name: "t".into(), description: "t".into(), mirror_relays: vec![] };
        Relay::open(&path, cfg).unwrap()
    }

    fn ev(keys: &Keys, kind: u16, at: u64, content: &str, tags: &[&[&str]]) -> Event {
        EventBuilder::new(Kind::from(kind), content)
            .tags(tags.iter().map(|t| Tag::parse(t.iter().copied()).unwrap()))
            .custom_created_at(Timestamp::from(at))
            .finalize(keys)
            .unwrap()
    }

    fn put(relay: &Relay, e: &Event) -> Saved {
        persist(&mut relay.0.writer.lock(), e, &[]).unwrap()
    }

    fn get(relay: &Relay, filters: &[Filter], now: i64) -> Vec<Event> {
        let mut out = Vec::new();
        run_query(&relay.0.writer.lock(), filters, now, |json| {
            out.push(Event::from_json(json).unwrap());
            true
        })
        .unwrap();
        out
    }

    fn filter(json: &str) -> Filter {
        Filter::from_json(json).unwrap()
    }

    fn ok_status(msg: RelayMessage) -> (bool, String) {
        match msg {
            RelayMessage::Ok { status, message, .. } => (status, message.into_owned()),
            other => panic!("not OK: {other:?}"),
        }
    }

    #[tokio::test]
    async fn relay_filter_sql_matches_match_event() {
        let relay = open(vec![]);
        let (a, b) = (Keys::generate(), Keys::generate());
        let p = b.public_key().to_hex();
        let events = vec![
            ev(&a, 1, 100, "one", &[&["t", "video"], &["p", &p]]),
            ev(&a, 1, 200, "two", &[&["t", "music"]]),
            ev(&b, 1111, 300, "three", &[&["E", "root"], &["t", "video"]]),
            ev(&b, 34235, 400, "four", &[&["d", "clip"], &["t", "video"], &["x", "abc"]]),
            ev(&a, 7, 200, "five", &[&["e", "ffff"], &["k", "34235"]]),
            ev(&b, 1, 500, "six", &[]),
        ];
        for e in &events {
            assert_eq!(put(&relay, e), Saved::Stored);
        }
        let cases = [
            format!(r#"{{"authors":["{}"]}}"#, a.public_key().to_hex()),
            r##"{"#t":["video"]}"##.to_owned(),
            r##"{"#t":["video","music"],"kinds":[1]}"##.to_owned(),
            format!(r##"{{"#p":["{p}"],"#t":["video"]}}"##),
            r##"{"#E":["root"]}"##.to_owned(),
            r##"{"#d":["clip"],"kinds":[34235]}"##.to_owned(),
            r##"{"#e":["ffff"],"#k":["34235"]}"##.to_owned(),
            r##"{"#t":[]}"##.to_owned(),
            r#"{"since":200,"until":400}"#.to_owned(),
            r#"{"kinds":[1,7],"limit":2}"#.to_owned(),
            format!(r#"{{"ids":["{}","{}"]}}"#, events[0].id, events[5].id),
            r#"{}"#.to_owned(),
        ];
        for case in &cases {
            let f = filter(case);
            let mut want: Vec<&Event> = events.iter().filter(|e| f.match_event(e, MatchEventOptions::new())).collect();
            want.sort_by(|x, y| y.created_at.cmp(&x.created_at).then(x.id.cmp(&y.id)));
            want.truncate(f.limit.unwrap_or(usize::MAX));
            let got = get(&relay, &[f], 0);
            assert_eq!(got.iter().collect::<Vec<_>>(), want, "filter {case}");
        }
        // Several filters: per-filter limit, union without duplicates, newest first.
        let got = get(&relay, &[filter(r#"{"kinds":[1],"limit":1}"#), filter(r##"{"#t":["video"]}"##)], 0);
        let ids: Vec<_> = got.iter().map(|e| e.content.as_str()).collect();
        assert_eq!(ids, ["six", "four", "three", "one"]);
    }

    #[tokio::test]
    async fn relay_replaceable_and_addressable_keep_newest() {
        let relay = open(vec![]);
        let a = Keys::generate();
        let only = |kind: u16| filter(&format!(r#"{{"kinds":[{kind}]}}"#));

        assert_eq!(put(&relay, &ev(&a, 0, 10, "old", &[])), Saved::Stored);
        assert_eq!(put(&relay, &ev(&a, 0, 20, "new", &[])), Saved::Stored);
        assert_eq!(put(&relay, &ev(&a, 0, 15, "older", &[])), Saved::Superseded);
        assert_eq!(get(&relay, &[only(0)], 0).iter().map(|e| e.content.as_str()).collect::<Vec<_>>(), ["new"]);

        // Same created_at: the lowest id wins, whichever arrives first.
        let (x, y) = (ev(&a, 10002, 50, "x", &[]), ev(&a, 10002, 50, "y", &[]));
        let (low, high) = if x.id < y.id { (x, y) } else { (y, x) };
        assert_eq!(put(&relay, &high), Saved::Stored);
        assert_eq!(put(&relay, &low), Saved::Stored);
        assert_eq!(put(&relay, &high), Saved::Superseded);
        assert_eq!(get(&relay, &[only(10002)], 0).iter().map(|e| e.id).collect::<Vec<_>>(), [low.id]);

        // Addressable: per d tag; a missing d tag counts as "".
        assert_eq!(put(&relay, &ev(&a, 34235, 10, "a1", &[&["d", "a"]])), Saved::Stored);
        assert_eq!(put(&relay, &ev(&a, 34235, 10, "b1", &[&["d", "b"]])), Saved::Stored);
        assert_eq!(put(&relay, &ev(&a, 34235, 20, "a2", &[&["d", "a"]])), Saved::Stored);
        assert_eq!(put(&relay, &ev(&a, 34235, 5, "a0", &[&["d", "a"]])), Saved::Superseded);
        assert_eq!(put(&relay, &ev(&a, 34235, 30, "none", &[])), Saved::Stored);
        assert_eq!(put(&relay, &ev(&a, 34235, 40, "empty", &[&["d", ""]])), Saved::Stored);
        let mut got: Vec<_> = get(&relay, &[only(34235)], 0).into_iter().map(|e| e.content).collect();
        got.sort();
        assert_eq!(got, ["a2", "b1", "empty"]);
        // Another author's version is separate.
        assert_eq!(put(&relay, &ev(&Keys::generate(), 34235, 1, "other", &[&["d", "a"]])), Saved::Stored);
    }

    #[tokio::test]
    async fn relay_deletion_by_author_only() {
        let relay = open(vec![]);
        let (a, b) = (Keys::generate(), Keys::generate());
        let target = ev(&a, 1, 10, "doomed", &[]);
        let by_id = filter(&format!(r#"{{"ids":["{}"]}}"#, target.id));
        assert_eq!(put(&relay, &target), Saved::Stored);

        assert_eq!(put(&relay, &ev(&b, 5, 20, "", &[&["e", &target.id.to_hex()]])), Saved::Stored);
        assert_eq!(get(&relay, &[by_id.clone()], 0).len(), 1, "other author's deletion is ignored");

        assert_eq!(put(&relay, &ev(&a, 5, 30, "", &[&["e", &target.id.to_hex()]])), Saved::Stored);
        assert!(get(&relay, &[by_id.clone()], 0).is_empty());
        assert_eq!(put(&relay, &target), Saved::Deleted, "re-publish of a deleted id");

        // Deletion arriving before the event it deletes.
        let late = ev(&a, 1, 40, "late", &[]);
        assert_eq!(put(&relay, &ev(&a, 5, 50, "", &[&["e", &late.id.to_hex()]])), Saved::Stored);
        assert_eq!(put(&relay, &late), Saved::Deleted);
    }

    #[tokio::test]
    async fn relay_expiration() {
        let a = Keys::generate();
        let relay = open(vec![a.public_key()]);
        let now = Timestamp::now().as_secs();

        let expired = ev(&a, 1, now - 100, "gone", &[&["expiration", &(now - 10).to_string()]]);
        let (ok, msg) = ok_status(relay.ingest(expired).await);
        assert!(!ok && msg.starts_with("invalid:"), "{msg}");

        let expiring = ev(&a, 1, now, "soon", &[&["expiration", &(now + 100).to_string()]]);
        assert!(ok_status(relay.ingest(expiring).await).0);
        let all = filter("{}");
        assert_eq!(get(&relay, &[all.clone()], now as i64).len(), 1);
        assert!(get(&relay, &[all], now as i64 + 200).is_empty(), "hidden once expired");
    }

    #[tokio::test]
    async fn relay_rejects_non_writer() {
        let (writer, stranger) = (Keys::generate(), Keys::generate());
        let relay = open(vec![writer.public_key()]);
        let now = Timestamp::now().as_secs();

        let (ok, msg) = ok_status(relay.ingest(ev(&stranger, 1, now, "hi", &[])).await);
        assert!(!ok && msg.starts_with("restricted:"), "{msg}");
        // Ephemeral events from strangers too (#11: views 22236 are rejected).
        assert!(!ok_status(relay.ingest(ev(&stranger, 22236, now, "", &[])).await).0);
        assert!(ok_status(relay.ingest(ev(&writer, 1, now, "hi", &[])).await).0);
        assert!(get(&relay, &[filter("{}")], 0).iter().all(|e| e.pubkey == writer.public_key()));
    }

    async fn queried(relay: &Relay) -> Vec<Event> {
        let mut rx = relay.query(&SubscriptionId::new("test"), vec![Filter::new()]);
        let mut events = Vec::new();
        while let Some(json) = rx.recv().await {
            let value: serde_json::Value = serde_json::from_str(&json).unwrap();
            events.push(Event::from_json(value[2].to_string()).unwrap());
        }
        events
    }

    #[tokio::test]
    async fn visitors_interact_only_with_known_owned_video_threads() {
        let (writer, visitor, other) = (Keys::generate(), Keys::generate(), Keys::generate());
        let relay = open(vec![writer.public_key()]);
        let now = Timestamp::now().as_secs();
        let video = ev(&writer, 21, now, "video", &[]);
        let id = video.id.to_hex();
        let author = writer.public_key().to_hex();
        assert!(ok_status(relay.ingest(video.clone()).await).0);
        let comment = ev(&visitor, 1111, now, "comment", &[
            &["E", &id, "", &author], &["K", "21"], &["P", &author],
            &["e", &id, "", &author], &["k", "21"], &["p", &author],
        ]);
        assert!(ok_status(relay.ingest(comment.clone()).await).0);
        let cid = comment.id.to_hex();
        let cauthor = visitor.public_key().to_hex();
        let reply = ev(&other, 1111, now, "reply", &[
            &["E", &id], &["K", "21"], &["P", &author],
            &["e", &cid, "", &cauthor], &["k", "1111"], &["p", &cauthor],
        ]);
        assert!(ok_status(relay.ingest(reply.clone()).await).0);
        let reaction = ev(&visitor, 7, now, "+", &[
            &["e", &id], &["e", &reply.id.to_hex()], &["k", "1111"],
            &["p", &other.public_key().to_hex()],
        ]);
        assert!(ok_status(relay.ingest(reaction.clone()).await).0);
        let legacy = ev(&visitor, 1, now, "legacy", &[&["e", &id, "", "root"]]);
        assert!(ok_status(relay.ingest(legacy.clone()).await).0);
        let legacy_reply = ev(&other, 1, now, "legacy reply", &[
            &["e", &id, "", "root"], &["e", &legacy.id.to_hex(), "", "reply"],
        ]);
        assert!(ok_status(relay.ingest(legacy_reply.clone()).await).0);
        assert_eq!(queried(&relay).await.len(), 6);

        let deletion = ev(&visitor, 5, now, "", &[
            &["e", &cid], &["e", &reaction.id.to_hex()], &["e", &legacy.id.to_hex()],
        ]);
        assert!(ok_status(relay.ingest(deletion.clone()).await).0);
        assert!(ok_status(relay.ingest(deletion).await).0, "duplicate deletion");
        assert!(ok_status(relay.ingest(ev(&visitor, 5, now + 1, "again", &[&["e", &cid]])).await).0);
        assert!(!ok_status(relay.ingest(comment).await).0, "deleted event cannot return");
        let remaining = queried(&relay).await;
        assert!(remaining.iter().any(|e| e.id == video.id));
        assert!(!remaining.iter().any(|e| e.id == reaction.id || e.id == legacy.id));
        assert!(!ok_status(relay.ingest(ev(&visitor, 5, now, "", &[&["e", &reply.id.to_hex()]])).await).0);
        assert!(!ok_status(relay.ingest(ev(&visitor, 5, now, "", &[&["e", &id]])).await).0);
        assert!(!ok_status(relay.ingest(ev(&visitor, 5, now, "", &[&["a", &format!("34235:{author}:fake")]])).await).0);
    }

    #[tokio::test]
    async fn visitor_roots_targets_and_ancestors_cannot_be_spoofed() {
        let (writer, foreign, visitor) = (Keys::generate(), Keys::generate(), Keys::generate());
        let relay = open(vec![writer.public_key()]);
        let now = Timestamp::now().as_secs();
        let video = ev(&writer, 22, now, "video", &[]);
        let other_video = ev(&writer, 21, now, "other", &[]);
        let note = ev(&writer, 1, now, "not video", &[]);
        let foreign_video = ev(&foreign, 21, now, "foreign", &[]);
        assert!(ok_status(relay.ingest(video.clone()).await).0);
        assert!(ok_status(relay.ingest(other_video.clone()).await).0);
        assert!(ok_status(relay.ingest(note.clone()).await).0);
        // Public writer policy permits an event before the writer is removed.
        let prior = open(vec![writer.public_key(), foreign.public_key()]);
        assert!(ok_status(prior.ingest(foreign_video.clone()).await).0);
        let relay_foreign = Relay::open(&prior.0.path, RelayConfig {
            writers: vec![writer.public_key()], name: "t".into(), description: "t".into(), mirror_relays: vec![],
        }).unwrap();
        let id = video.id.to_hex();
        let author = writer.public_key().to_hex();
        let unknown = "00".repeat(32);
        let bad = [
            ev(&visitor, 1111, now, "", &[&["E", &unknown], &["K", "22"], &["P", &author], &["e", &unknown], &["k", "22"]]),
            ev(&visitor, 1111, now, "", &[&["E", &note.id.to_hex()], &["K", "1"], &["P", &author], &["e", &note.id.to_hex()], &["k", "1"]]),
            ev(&visitor, 1111, now, "", &[&["E", &id], &["K", "21"], &["P", &author], &["e", &id], &["k", "22"]]),
            ev(&visitor, 1111, now, "", &[&["E", &id], &["K", "22"], &["P", &foreign.public_key().to_hex()], &["e", &id], &["k", "22"]]),
            ev(&visitor, 1111, now, "", &[&["E", &id], &["E", &other_video.id.to_hex()], &["K", "22"], &["P", &author], &["e", &id], &["k", "22"]]),
            ev(&visitor, 1111, now, "", &[&["E", &id], &["K", "22"], &["P", &author], &["e", &other_video.id.to_hex()], &["k", "21"]]),
            ev(&visitor, 7, now, "+", &[&["e", &id], &["e", &unknown]]),
            ev(&visitor, 7, now, "+", &[&["e", &id], &["p", &foreign.public_key().to_hex()]]),
            ev(&visitor, 7, now, "+", &[&["e", &id], &["k", "21"]]),
            ev(&visitor, 7, now, "+", &[&["e", &unknown], &["e", &id]]),
            ev(&visitor, 1, now, "", &[&["e", &id, "", "root"], &["e", &note.id.to_hex(), "", "reply"]]),
            ev(&visitor, 1, now, "", &[&["e", &id, "", "root"], &["e", &other_video.id.to_hex(), "", "root"]]),
            ev(&visitor, 1063, now, "", &[&["e", &id]]),
            ev(&visitor, 24242, now, "", &[]),
        ];
        for event in bad {
            assert!(!ok_status(relay.ingest(event).await).0);
        }
        let forged = ev(&visitor, 1111, now, "", &[
            &["E", &foreign_video.id.to_hex()], &["K", "21"], &["P", &author],
            &["e", &foreign_video.id.to_hex()], &["k", "21"],
        ]);
        assert!(!ok_status(relay_foreign.ingest(forged).await).0);
        let mut invalid = ev(&visitor, 7, now, "+", &[&["e", &id]]);
        invalid.content = "-".into();
        let (_, message) = ok_status(relay.ingest(invalid).await);
        assert!(message.starts_with("invalid:"));
        assert_eq!(queried(&relay).await.len(), 3);
    }

    #[tokio::test]
    async fn addressable_video_versions_remain_authenticated_after_updates() {
        let (writer, visitor) = (Keys::generate(), Keys::generate());
        let relay = open(vec![writer.public_key()]);
        let now = Timestamp::now().as_secs();
        let author = writer.public_key().to_hex();
        let address = format!("34235:{author}:clip");
        let old = ev(&writer, 34235, now - 1, "old", &[&["d", "clip"]]);
        let new = ev(&writer, 34235, now, "new", &[&["d", "clip"]]);
        assert!(ok_status(relay.ingest(old.clone()).await).0);
        assert!(ok_status(relay.ingest(new.clone()).await).0);
        let old_id = old.id.to_hex();
        let comment = ev(&visitor, 1111, now, "on old", &[
            &["A", &address], &["K", "34235"], &["P", &author],
            &["a", &address], &["e", &old_id], &["k", "34235"], &["p", &author],
        ]);
        assert!(ok_status(relay.ingest(comment.clone()).await).0);
        assert!(ok_status(relay.ingest(ev(&visitor, 7, now, "+", &[
            &["a", &address], &["e", &old_id], &["k", "34235"], &["p", &author],
        ])).await).0);
        assert!(ok_status(relay.ingest(ev(&visitor, 7, now, "+", &[&["e", &comment.id.to_hex()]])).await).0);
        for target in ["00".repeat(32), new.id.to_hex()] {
            let addr = if target == new.id.to_hex() { format!("34235:{author}:invented") } else { address.clone() };
            assert!(!ok_status(relay.ingest(ev(&visitor, 7, now, "+", &[&["a", &addr], &["e", &target]])).await).0);
            assert!(!ok_status(relay.ingest(ev(&visitor, 1111, now, "", &[
                &["A", &addr], &["K", "34235"], &["P", &author],
                &["a", &addr], &["e", &target], &["k", "34235"],
            ])).await).0);
        }
        assert!(!queried(&relay).await.iter().any(|e| e.id == old.id));
        assert!(ok_status(relay.ingest(ev(&writer, 5, now, "", &[&["e", &new.id.to_hex()]])).await).0);
        assert!(!ok_status(relay.ingest(ev(&visitor, 7, now, "-", &[&["a", &address], &["e", &old_id]])).await).0);
    }

    #[tokio::test]
    async fn stats_count_only_live_rows_per_kind() {
        let relay = open(vec![]);
        let a = Keys::generate();
        let now = Timestamp::now().as_secs();
        let past = (now - 1).to_string();
        let doomed = ev(&a, 1, now, "deleted", &[]);
        for e in [
            ev(&a, 0, now - 20, "old profile", &[]),
            ev(&a, 0, now - 10, "profile", &[]),
            ev(&a, 34235, now - 20, "v1", &[&["d", "clip"]]),
            ev(&a, 34235, now - 10, "v2", &[&["d", "clip"]]),
            ev(&a, 34235, now - 10, "other", &[&["d", "other"]]),
            ev(&a, 1, now, "kept", &[]),
            ev(&a, 1, now, "kept too", &[]),
            ev(&a, 1, now, "expired", &[&["expiration", &past]]),
            doomed.clone(),
            ev(&a, 5, now, "", &[&["e", &doomed.id.to_hex()]]),
        ] {
            put(&relay, &e);
        }
        let stats = relay.stats().await.unwrap();
        // Superseded, deleted and expired rows are not counted; kinds ascend.
        assert_eq!(stats.by_kind, vec![(0, 1), (1, 2), (5, 1), (34235, 2)]);
        assert!(stats.database_bytes >= std::fs::metadata(&relay.0.path).unwrap().len());
        assert!(stats.database_bytes > 0);
    }

    #[tokio::test]
    async fn only_new_writer_events_are_queued_for_the_mirror_relays() {
        let (writer, visitor) = (Keys::generate(), Keys::generate());
        let targets = vec!["wss://a.example".to_owned(), "wss://b.example".to_owned()];
        let relay = Relay::open(&open(vec![]).0.path, RelayConfig {
            writers: vec![writer.public_key()], name: "t".into(), description: "t".into(), mirror_relays: targets.clone(),
        }).unwrap();
        let queued = |id: &EventId| -> Vec<String> {
            let conn = relay.0.writer.lock();
            let mut stmt = conn.prepare("SELECT target FROM outbox WHERE kind = 'event' AND ref_id = ? ORDER BY target").unwrap();
            stmt.query_map([id.to_hex()], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
        };
        let now = Timestamp::now().as_secs();
        let video = ev(&writer, 21, now, "video", &[]);
        assert!(ok_status(relay.ingest(video.clone()).await).0);
        assert_eq!(queued(&video.id), targets);
        // A replay is a duplicate: no second job.
        assert!(ok_status(relay.ingest(video.clone()).await).0);
        let n: i64 = relay.0.writer.lock().query_row("SELECT COUNT(*) FROM outbox", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        // A visitor's comment is stored, but it is not this instance's content.
        let comment = ev(&visitor, 1111, now, "nice", &[&["E", &video.id.to_hex()], &["K", "21"], &["P", &writer.public_key().to_hex()], &["e", &video.id.to_hex()], &["k", "21"], &["p", &writer.public_key().to_hex()]]);
        assert!(ok_status(relay.ingest(comment.clone()).await).0);
        assert!(queued(&comment.id).is_empty());
        // A writer event another instance's outbox delivered is stored, not passed on.
        let copy = ev(&writer, 1, now, "from a mirror", &[]);
        assert!(ok_status(relay.ingest_from(copy.clone(), true).await).0);
        assert!(queued(&copy.id).is_empty());
        assert_eq!(get(&relay, &[filter(&format!(r#"{{"ids":["{}"]}}"#, copy.id))], now as i64).len(), 1);
    }
}
