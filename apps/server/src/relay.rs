//! The instance's own Nostr relay (ADR 0001, tickets #4 and #11): NIP-01, NIP-09 (`e` tags),
//! NIP-11, NIP-40. Writes only from the allowed writers, reads open.
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
const MAX_MESSAGE_BYTES: usize = 128 * 1024;
/// Max open subscriptions per connection (#11).
const MAX_SUBSCRIPTIONS: usize = 32;
/// Max subscription id length in characters (#11).
const MAX_SUBID_LEN: usize = 256;
/// Events whose `created_at` is more than this far in the future are rejected (#11).
const MAX_FUTURE_SECS: u64 = 1800;
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
}

#[derive(Clone)]
pub struct Relay(Arc<Inner>);

struct Inner {
    path: PathBuf,
    /// The one writer connection; every write goes through it.
    writer: Mutex<Connection>,
    readers: Mutex<Vec<Connection>>,
    writers: Vec<PublicKey>,
    nip11: String,
    live: broadcast::Sender<Arc<Event>>,
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

impl Relay {
    /// Opens (or creates) the relay database. Must run inside a tokio runtime: it spawns
    /// the NIP-40 purge task.
    pub fn open(db: &Path, cfg: RelayConfig) -> Result<Relay, BoxError> {
        let writer = connect(db)?;
        writer.execute_batch(SCHEMA)?;
        let relay = Relay(Arc::new(Inner {
            path: db.to_owned(),
            writer: Mutex::new(writer),
            readers: Mutex::new(Vec::new()),
            writers: cfg.writers,
            nip11: nip11_doc(cfg.name, cfg.description),
            live: broadcast::channel(1024).0,
        }));
        tokio::spawn(purge_expired(Arc::downgrade(&relay.0)));
        Ok(relay)
    }

    async fn ingest(&self, ev: Event) -> RelayMessage<'static> {
        let id = ev.id;
        if ev.verify().is_err() {
            return RelayMessage::ok(id, false, "invalid: bad event id or signature");
        }
        if !self.0.writers.contains(&ev.pubkey) {
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
            let saved = tokio::task::spawn_blocking(move || persist(&mut inner.writer.lock(), &row)).await;
            match saved {
                Ok(Ok(Saved::Stored)) => {}
                Ok(Ok(Saved::Duplicate)) => return RelayMessage::ok(id, true, "duplicate: already have this event"),
                Ok(Ok(Saved::Superseded)) => {
                    return RelayMessage::ok(id, true, "duplicate: a newer version of this event is stored")
                }
                Ok(Ok(Saved::Deleted)) => return RelayMessage::ok(id, false, "blocked: this event was deleted by its author"),
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
            let conn = match inner.readers.lock().pop() {
                Some(c) => c,
                None => match connect(&inner.path) {
                    Ok(c) => c,
                    Err(e) => return tracing::warn!("relay: opening read connection: {e}"),
                },
            };
            let now = Timestamp::now().as_secs() as i64;
            if let Err(e) = run_query(&conn, &filters, now, |content| tx.blocking_send(format!("{prefix}{content}]")).is_ok()) {
                tracing::warn!("relay: query failed: {e}");
            }
            let mut idle = inner.readers.lock();
            if idle.len() < IDLE_READERS {
                idle.push(conn);
            }
        });
        rx
    }

    async fn session(self, mut ws: WebSocket) {
        let mut live = self.0.live.subscribe();
        let mut subs: HashMap<SubscriptionId, Vec<Filter>> = HashMap::new();
        loop {
            let out: Vec<RelayMessage> = tokio::select! {
                msg = ws.recv() => match msg {
                    Some(Ok(Message::Text(text))) => match ClientMessage::from_json(text.as_str()) {
                        Ok(ClientMessage::Event(ev)) => vec![self.ingest(ev.into_owned()).await],
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

fn connect(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(STARTUP)?;
    Ok(conn)
}

/// NIP-01 replaceable kinds. Not `Kind::is_replaceable`: that also counts kind 41 (NIP-28),
/// which is not replaceable per author.
fn is_replaceable(kind: u16) -> bool {
    kind == 0 || kind == 3 || (10000..20000).contains(&kind)
}

/// Upstream `persist_event`, minus NIP-26 and with deletion as real deletes: keeps only the
/// newest replaceable/addressable version (tie: lowest id), applies kind-5 `e` deletions of
/// the same author, and refuses events their author already deleted.
fn persist(conn: &mut Connection, ev: &Event) -> rusqlite::Result<Saved> {
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
        }
    }

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
    match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        Ok(ws) => ws
            .max_message_size(MAX_MESSAGE_BYTES)
            .max_frame_size(MAX_MESSAGE_BYTES)
            .on_upgrade(move |socket| relay.session(socket))
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
        let cfg = RelayConfig { writers, name: "t".into(), description: "t".into() };
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
        persist(&mut relay.0.writer.lock(), e).unwrap()
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
}
