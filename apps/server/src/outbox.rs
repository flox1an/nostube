//! The outbox (ADR 0009, spec "Externe Synchronisierung"): the instance's own events and blobs
//! are copied to the relays and Blossom servers the owner chose in `[mirror]`. A job is one item
//! for one target, kept in `relay.sqlite` until it is delivered or has failed for good, so
//! restarts and offline periods lose nothing. Event jobs are written in the same transaction as
//! the event (`relay::persist`); blob jobs after Blossom answered an upload.
//!
//! Delivery is idempotent on the target side (a relay answers `duplicate`, a Blossom server
//! keeps one copy per hash), so a job that is interrupted is simply delivered again.

use std::{collections::HashSet, path::Path, sync::{atomic::{AtomicBool, Ordering}, Arc}, time::Duration};

use axum::{
    body::Body,
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use nostr::prelude::{EventBuilder, EventId, FinalizeEvent, Keys, Kind, Tag, Timestamp};
use parking_lot::Mutex;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use tokio::task::JoinSet;

use crate::config::Mirror;

/// The outbox table; created next to the relay tables (same file, same writer rules).
pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'blob', 'cleanup', 'blob-delete')),
  target TEXT NOT NULL,
  -- Event id or blob sha256, hex.
  ref_id TEXT NOT NULL,
  -- Blobs only: the size and the public URL here that the target fetches.
  size INTEGER,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (kind, target, ref_id)
);
CREATE INDEX IF NOT EXISTS outbox_due ON outbox(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS blob_owner (
  hash TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  mirrored INTEGER NOT NULL CHECK (mirrored IN (0,1))
);
-- Jobs the owner sent to an explicit target (`deliver`, `delete_blobs`): due even when the target
-- is not (or no longer) a configured mirror or indexer.
CREATE TABLE IF NOT EXISTS outbox_forced (job INTEGER PRIMARY KEY);
-- An event whose jobs wait until every blob it names is confirmed on every mirror Blossom server
-- (`require_blobs`): an nsite manifest must not point at files the servers do not have yet.
CREATE TABLE IF NOT EXISTS outbox_requires (
  event_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (event_id, hash, target)
);
-- Explicit events are held before relay ingestion, then released to an exact target allowlist.
CREATE TABLE IF NOT EXISTS outbox_explicit (
  event_id TEXT PRIMARY KEY,
  ready INTEGER NOT NULL DEFAULT 0,
  canceled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS outbox_event_target (
  event_id TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (event_id, target)
);
-- Blobs another feature still uses (`retain`, e.g. the published nsite's files): never cleaned.
CREATE TABLE IF NOT EXISTS outbox_retain (
  owner TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (owner, hash)
);
-- Historical targets explicitly authorized by the owner for nsite cleanup.
CREATE TABLE IF NOT EXISTS outbox_delete_target (
  hash TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (hash, target)
);
";

/// Sent with every delivery. A nostube-server receiving it does not pass the item on: copies
/// do not chain from instance to instance (see `is_mirror_delivery`).
const USER_AGENT: &str = concat!("nostube-outbox/", env!("CARGO_PKG_VERSION"));
/// How often the worker looks for due jobs.
const POLL: Duration = Duration::from_secs(5);
/// Deliveries running at once.
const CONCURRENCY: usize = 4;
/// First retry delay; it doubles per failed attempt up to `BACKOFF_CAP`.
const BACKOFF_BASE: u64 = 30;
const BACKOFF_CAP: u64 = 3600;
/// After this many failed attempts (about a day with the delays above) a job is `failed` until
/// the owner retries it.
pub const MAX_ATTEMPTS: u32 = 24;
/// A relay must answer `OK` within this.
const RELAY_TIMEOUT: Duration = Duration::from_secs(30);
/// The target downloads the whole blob before it answers, so this is generous.
const MIRROR_TIMEOUT: Duration = Duration::from_secs(600);
/// The `HEAD` that tells whether a target has a blob already.
const PROBE_TIMEOUT: Duration = Duration::from_secs(30);
/// A push upload (S2) gets `MIRROR_TIMEOUT` plus its size at this rate (≈2 Mbit/s) in bytes/s.
// ponytail: a whole-request deadline; an idle-stall timeout if slow uplinks hit it.
const MIN_UPLOAD_RATE: u64 = 256 * 1024;
/// `last_error` of a blob job that cleanup or a deletion closed: `done`, but no confirmed copy.
const CANCELED: &str = "canceled";
/// The reason a blob job fails without the managed key (ADR 0007): nothing else may sign.
pub const NEEDS_KEY: &str = "mirroring blobs needs the managed signing key";
/// Recent problems shown in the studio.
const PROBLEMS: i64 = 50;

// Orders local media changes: uploads, accepted events, scheduling and local cleanup. Never held
// across a call to a mirror target (see `work`); the worker keeps a mirror and a mirror delete of
// the same blob and target apart instead (`spawn`'s `busy`).
// ponytail: one global lock, and an upload holds it while Almond receives the body, so uploads
// serialize; per-hash locks if parallel uploads matter.
pub(crate) static MEDIA_LIFECYCLE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub(crate) fn initialize(conn: &Connection) -> rusqlite::Result<()> {
    let existing: Option<String> = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'outbox'", [], |r| r.get(0),
    ).optional()?;
    let unmarked: bool = conn.query_row(
        "SELECT NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'outbox_retain')", [], |r| r.get(0),
    )?;
    if existing.is_some_and(|sql| !sql.contains("'cleanup'")) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch("DROP INDEX IF EXISTS outbox_due; ALTER TABLE outbox RENAME TO outbox_old;")?;
        tx.execute_batch(SCHEMA)?;
        tx.execute_batch("INSERT INTO outbox SELECT * FROM outbox_old; DROP TABLE outbox_old;")?;
        tx.commit()?;
    } else {
        conn.execute_batch(SCHEMA)?;
    }
    if unmarked {
        // Once: cleanup used to close blob jobs as plain `done`. A delete job for the same copy
        // that is not older means the copy is gone or going.
        conn.execute(
            "UPDATE outbox SET last_error = ?1 WHERE kind = 'blob' AND status = 'done' AND last_error IS NULL
             AND EXISTS (SELECT 1 FROM outbox d WHERE d.kind = 'blob-delete' AND d.target = outbox.target
               AND d.ref_id = outbox.ref_id AND d.updated_at >= outbox.updated_at)",
            [CANCELED],
        )?;
    }
    conn.execute_batch(crate::schedule::SCHEMA)?;
    Ok(())
}

/// Queued inside the accepted event transaction; ownership is proved by the worker.
pub(crate) fn enqueue_cleanup(
    conn: &Connection, author: &nostr::prelude::PublicKey, hash: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO outbox (kind,target,ref_id,next_attempt_at,created_at,updated_at)
         VALUES ('cleanup',?1,?2,?3,?3,?3)
         ON CONFLICT(kind,target,ref_id) DO UPDATE SET status='pending', attempts=0,
         next_attempt_at=excluded.next_attempt_at, last_error=NULL, updated_at=excluded.updated_at",
        params![author.to_hex(), hash, now()],
    )?;
    Ok(())
}

/// True when the request comes from another instance's outbox.
pub fn is_mirror_delivery(headers: &HeaderMap) -> bool {
    headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("nostube-outbox/"))
}

/// Inside `persist`'s transaction: one job per mirror relay for a newly stored event. A replay
/// of the same event adds nothing (`UNIQUE (kind, target, ref_id)`).
pub(crate) fn enqueue_event(conn: &Connection, targets: &[String], id: &EventId) -> rusqlite::Result<()> {
    let now = now();
    let mut add = conn.prepare_cached(
        "INSERT OR IGNORE INTO outbox (kind, target, ref_id, next_attempt_at, created_at, updated_at)
         VALUES ('event', ?1, ?2, ?3, ?3, ?3)",
    )?;
    for target in targets {
        add.execute(params![target, id.to_hex(), now])?;
    }
    Ok(())
}

/// One blob job per target. A confirmed copy stays as it is; a failed or canceled job starts
/// over; a pending one keeps going.
fn enqueue_blob(conn: &Connection, targets: &[String], hash: &str, size: u64, source_url: &str) -> rusqlite::Result<()> {
    let now = now();
    let mut add = conn.prepare_cached(
        "INSERT INTO outbox (kind, target, ref_id, size, source_url, next_attempt_at, created_at, updated_at)
         VALUES ('blob', ?1, ?2, ?3, ?4, ?5, ?5, ?5)
         ON CONFLICT(kind,target,ref_id) DO UPDATE SET status='pending', attempts=0,
         size=excluded.size, source_url=excluded.source_url, next_attempt_at=excluded.next_attempt_at,
         last_error=NULL, updated_at=excluded.updated_at
         WHERE outbox.status = 'failed' OR (outbox.status = 'done' AND outbox.last_error IS NOT NULL)",
    )?;
    for target in targets {
        add.execute(params![target, hash, size as i64, source_url, now])?;
    }
    Ok(())
}

/// Closes every blob job of `hash` without a confirmed copy, then a BUD-02 `DELETE` job per
/// target. Answers the delete jobs' ids.
fn enqueue_deletes(conn: &Connection, targets: &[String], hash: &str) -> rusqlite::Result<Vec<i64>> {
    let now = now();
    conn.execute(
        "UPDATE outbox SET status='done', last_error=?1, updated_at=?2 WHERE kind='blob' AND ref_id=?3",
        params![CANCELED, now, hash],
    )?;
    let mut add = conn.prepare_cached(
        "INSERT INTO outbox (kind,target,ref_id,next_attempt_at,created_at,updated_at)
         VALUES ('blob-delete',?1,?2,?3,?3,?3)
         ON CONFLICT(kind,target,ref_id) DO UPDATE SET status='pending',attempts=0,
         next_attempt_at=excluded.next_attempt_at,last_error=NULL,updated_at=excluded.updated_at
         RETURNING id",
    )?;
    targets.iter().map(|target| add.query_row(params![target, hash, now], |r| r.get(0))).collect()
}

fn now() -> i64 {
    Timestamp::now().as_secs() as i64
}

/// Delay in seconds after the `attempt`-th failure (1-based): `BACKOFF_BASE·2^(attempt-1)`, at
/// most `BACKOFF_CAP`, scaled into [½, 1] of that by `jitter` ∈ [0, 1) so that jobs failing
/// together do not all come back at the same second.
fn backoff(attempt: u32, jitter: f64) -> u64 {
    let full = BACKOFF_BASE.saturating_mul(1 << attempt.saturating_sub(1).min(20)).min(BACKOFF_CAP);
    full / 2 + (full as f64 / 2.0 * jitter) as u64
}

#[derive(Debug)]
struct Job {
    id: i64,
    kind: String,
    target: String,
    ref_id: String,
    size: Option<i64>,
    source_url: Option<String>,
    attempts: u32,
}

#[derive(Debug, PartialEq)]
enum Outcome {
    Done,
    /// Worth another attempt after the backoff.
    Retry(String),
    /// No attempt can succeed until the owner changes something and retries.
    Fail(String),
}

/// The outbox table on its own connection to `relay.sqlite`, plus the configured targets.
#[derive(Clone)]
pub struct Outbox(Arc<Inner>);

struct Inner {
    conn: Mutex<Connection>,
    mirror: Mirror,
    /// Public reach only (ADR 0012): the indexers the channel's derived lists/profile go to; set by
    /// `profile::sync`, so it follows the config while running. Empty in private reach.
    indexers: parking_lot::RwLock<Vec<String>>,
    storage: parking_lot::RwLock<Option<almond::models::AppState>>,
    origin_public: AtomicBool,
}

impl Outbox {
    pub fn open(db: &Path, mirror: Mirror) -> rusqlite::Result<Outbox> {
        let conn = crate::relay::connect(db)?;
        initialize(&conn)?;
        Ok(Outbox(Arc::new(Inner {
            conn: Mutex::new(conn), mirror, indexers: Default::default(), storage: parking_lot::RwLock::new(None),
            origin_public: AtomicBool::new(true),
        })))
    }

    pub fn attach_storage(&self, state: almond::models::AppState) {
        *self.0.storage.write() = Some(state);
    }

    pub fn set_origin_public(&self, public: bool) {
        self.0.origin_public.store(public, Ordering::Relaxed);
    }

    pub fn mirror(&self) -> Mirror {
        self.0.mirror.clone()
    }

    pub async fn queue_blob(&self, hash: String, size: u64, source_url: String) -> Result<(), String> {
        almond::services::file_storage::validate_sha256_format(&hash).map_err(|e| e.to_string())?;
        if size > i64::MAX as u64 { return Err("blob size exceeds database range".into()); }
        let targets = self.0.mirror.blossom.clone();
        self.db(move |conn| enqueue_blob(conn, &targets, &hash, size, &source_url)).await
    }

    /// Confirmed copies on current targets only; canceled jobs are not copies.
    pub async fn blob_copies(&self, hash: String) -> Result<Vec<String>, String> {
        let targets = self.0.mirror.blossom.clone();
        self.db(move |conn| {
            let mut stmt = conn.prepare("SELECT target FROM outbox WHERE kind='blob' AND ref_id=? AND status='done' AND last_error IS NULL ORDER BY id")?;
            let copies = stmt.query_map([hash], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(copies.into_iter().filter(|t| targets.contains(t)).collect())
        }).await
    }

    pub async fn blob_problems(&self, hash: String) -> Result<Option<String>, String> {
        let targets = self.0.mirror.blossom.clone();
        self.db(move |conn| {
            let mut stmt = conn.prepare("SELECT target,last_error FROM outbox WHERE kind='blob' AND ref_id=? AND status!='done' AND last_error IS NOT NULL ORDER BY updated_at DESC,id DESC")?;
            let rows = stmt.query_map([hash], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows.into_iter().find(|(t, _)| targets.contains(t)).map(|(t, e)| format!("{t}: {e}")))
        }).await
    }

    pub async fn retain(&self, scope: &str, hashes: Vec<String>) -> Result<(), String> {
        for hash in &hashes {
            almond::services::file_storage::validate_sha256_format(hash).map_err(|e| e.to_string())?;
        }
        let _guard = MEDIA_LIFECYCLE.lock().await;
        let scope = scope.to_owned();
        self.db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            tx.execute("DELETE FROM outbox_retain WHERE owner=?", [&scope])?;
            for hash in hashes { tx.execute("INSERT OR IGNORE INTO outbox_retain VALUES (?,?)", params![scope, hash])?; }
            tx.commit()
        }).await
    }

    pub async fn store_local(&self, bytes: &[u8], mime: &str, ext: &str, owner: &str) -> Result<(String, u64), String> {
        let owner = nostr::prelude::PublicKey::from_hex(owner).map_err(|e| e.to_string())?;
        let _guard = MEDIA_LIFECYCLE.lock().await;
        let state = storage(self)?;
        let hash = crate::branding::store_blob(&state, bytes, mime, (!ext.is_empty()).then_some(ext)).await?;
        self.record_owner(hash.clone(), owner, false).await?;
        Ok((hash, bytes.len() as u64))
    }

    /// Install before ingesting the manifest: relay ingestion may immediately queue its jobs.
    pub async fn require_blobs(&self, event: EventId, hashes: Vec<String>) -> Result<(), String> {
        let targets = self.0.mirror.blossom.clone();
        self.db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            tx.execute("INSERT OR IGNORE INTO outbox_explicit (event_id) VALUES (?)", [event.to_hex()])?;
            for hash in hashes {
                for target in &targets {
                    tx.execute("INSERT OR IGNORE INTO outbox_requires VALUES (?,?,?)", params![event.to_hex(), hash, target])?;
                }
            }
            tx.commit()
        }).await
    }

    /// Explicit owner-authorized targets stay eligible after removal from mirror configuration.
    pub async fn deliver(&self, targets: Vec<String>, ids: Vec<EventId>) -> Result<(), String> {
        self.db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            for id in ids {
                tx.execute(
                    "INSERT INTO outbox_explicit (event_id,ready) VALUES (?,1) ON CONFLICT(event_id) DO UPDATE SET ready=1",
                    [id.to_hex()],
                )?;
                tx.execute("DELETE FROM outbox_event_target WHERE event_id=?", [id.to_hex()])?;
                for target in &targets {
                    tx.execute("INSERT OR IGNORE INTO outbox_event_target VALUES (?,?)", params![id.to_hex(), target])?;
                }
                tx.execute(
                    "UPDATE outbox SET status='done',last_error=?1,updated_at=?2
                     WHERE kind='event' AND ref_id=?3 AND status!='done'
                       AND target NOT IN (SELECT target FROM outbox_event_target WHERE event_id=?3)",
                    params![CANCELED, now(), id.to_hex()],
                )?;
                enqueue_event(&tx, &targets, &id)?;
                for target in &targets {
                    tx.execute("INSERT OR IGNORE INTO outbox_forced SELECT id FROM outbox WHERE kind='event' AND target=? AND ref_id=?", params![target, id.to_hex()])?;
                }
            }
            tx.commit()
        }).await
    }

    pub async fn event_delivery(&self, event: EventId) -> Result<bool, String> {
        self.db(move |conn| conn.query_row(
            "SELECT NOT EXISTS (SELECT 1 FROM outbox_explicit WHERE event_id=?1 AND (ready=0 OR canceled=1))
             AND NOT EXISTS (SELECT 1 FROM outbox WHERE kind='event' AND ref_id=?1 AND (status!='done' OR last_error IS NOT NULL)
               AND (NOT EXISTS (SELECT 1 FROM outbox_explicit WHERE event_id=?1)
                 OR target IN (SELECT target FROM outbox_event_target WHERE event_id=?1)))",
            [event.to_hex()], |r| r.get(0),
        )).await
    }

    pub async fn cancel_event(&self, event: EventId) -> Result<(), String> {
        self.db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            tx.execute(
                "INSERT INTO outbox_explicit (event_id,canceled) VALUES (?,1) ON CONFLICT(event_id) DO UPDATE SET canceled=1",
                [event.to_hex()],
            )?;
            tx.execute(
                "UPDATE outbox SET status='done',last_error=?1,updated_at=?2 WHERE kind='event' AND ref_id=?3 AND status!='done'",
                params![CANCELED, now(), event.to_hex()],
            )?;
            tx.commit()
        }).await
    }

    pub async fn delete_blobs(&self, hash: String, owner: String, targets: Vec<String>) -> Result<(), String> {
        almond::services::file_storage::validate_sha256_format(&hash).map_err(|e| e.to_string())?;
        let author = nostr::prelude::PublicKey::from_hex(&owner).map_err(|e| e.to_string())?;
        self.db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            for target in targets {
                tx.execute("INSERT OR IGNORE INTO outbox_delete_target VALUES (?,?)", params![hash, target])?;
            }
            enqueue_cleanup(&tx, &author, &hash)?;
            tx.commit()
        }).await
    }

    /// Sets the indexers and queues the channel's derived kinds 0, 10002 and 10063 (`ids`) for them; a
    /// job that exists already is kept as it is. Private reach passes none of either: jobs still
    /// pending for an indexer wait, and nothing goes there.
    pub async fn announce(&self, indexers: Vec<String>, ids: Vec<EventId>) -> Result<(), String> {
        *self.0.indexers.write() = indexers.clone();
        self.db(move |conn| ids.iter().try_for_each(|id| enqueue_event(conn, &indexers, id))).await
    }

    /// Called only after Almond accepted an upload. Its index does not retain auth authors.
    pub async fn record_owner(&self, hash: String, author: nostr::prelude::PublicKey, mirrored: bool) -> Result<(), String> {
        almond::services::file_storage::validate_sha256_format(&hash).map_err(|e| e.to_string())?;
        self.db(move |conn| {
            let tx = conn.unchecked_transaction()?;
            let hash = hash.to_ascii_lowercase();
            let author = author.to_hex();
            tx.execute(
                "INSERT INTO blob_owner VALUES (?1,?2,?3)
                 ON CONFLICT(hash) DO UPDATE SET mirrored = blob_owner.mirrored AND excluded.mirrored
                 WHERE blob_owner.author = excluded.author",
                params![hash, author, mirrored],
            )?;
            // A newly accepted publication supersedes cleanup intents for the previous
            // copy, even when its content hash is identical. Never transfer ownership.
            tx.execute(
                "UPDATE outbox SET status='done',last_error=NULL,updated_at=?1
                 WHERE ref_id=?2 AND (kind='blob-delete' OR (kind='cleanup' AND target=?3))
                 AND EXISTS (SELECT 1 FROM blob_owner WHERE hash=?2 AND author=?3)",
                params![now(), hash, author],
            )?;
            tx.commit()
        }).await
    }

    pub(crate) async fn db<T: Send + 'static>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T> + Send + 'static,
    ) -> Result<T, String> {
        let inner = self.0.clone();
        tokio::task::spawn_blocking(move || f(&inner.conn.lock()))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("outbox database: {e}"))
    }

    /// Blossom answered an upload or mirror request with `res`: a blob descriptor means the blob
    /// is stored here, so each mirror Blossom server gets a job for it. The response is passed on
    /// unchanged (its body is buffered to read the descriptor).
    pub async fn after_upload(&self, res: Response) -> Response {
        if self.0.mirror.blossom.is_empty() || !res.status().is_success() {
            return res;
        }
        let (parts, body) = res.into_parts();
        // A descriptor is a few hundred bytes; 1 MiB is far beyond any real one.
        let bytes = match axum::body::to_bytes(body, 1 << 20).await {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("outbox: cannot read the upload answer: {e}");
                return axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };
        #[derive(serde::Deserialize)]
        struct Descriptor {
            url: String,
            sha256: String,
            size: u64,
        }
        // PATCH chunks answer 204 without a body: no descriptor, nothing stored yet.
        if let Ok(d) = serde_json::from_slice::<Descriptor>(&bytes) {
            let added = self.queue_blob(d.sha256, d.size, d.url).await;
            if let Err(e) = added {
                tracing::warn!("outbox: cannot queue the blob for mirroring: {e}");
            }
        }
        Response::from_parts(parts, Body::from(bytes))
    }

    /// For the studio: the targets, job counts per target and status, and the most recent
    /// problems (failed jobs and jobs waiting for a retry), newest first.
    pub async fn status(&self) -> Result<serde_json::Value, String> {
        let mirror = self.0.mirror.clone();
        self.db(move |conn| {
            let mut counts: Vec<serde_json::Value> = Vec::new();
            let mut stmt = conn.prepare(
                "SELECT target, kind, status, COUNT(*) FROM outbox GROUP BY target, kind, status ORDER BY target, kind",
            )?;
            let rows = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?))
            })?;
            for row in rows {
                let (target, kind, status, n) = row?;
                let entry = match counts.iter_mut().find(|c| c["target"] == target.as_str() && c["kind"] == kind.as_str()) {
                    Some(e) => e,
                    None => {
                        counts.push(serde_json::json!({ "target": target, "kind": kind, "pending": 0, "done": 0, "failed": 0 }));
                        counts.last_mut().unwrap()
                    }
                };
                entry[status.as_str()] = n.into();
            }
            let mut stmt = conn.prepare(
                "SELECT kind, target, ref_id, status, attempts, last_error, next_attempt_at, updated_at FROM outbox
                 WHERE last_error IS NOT NULL AND status != 'done' ORDER BY updated_at DESC, id DESC LIMIT ?",
            )?;
            let problems = stmt
                .query_map([PROBLEMS], |r| {
                    let status: String = r.get(3)?;
                    Ok(serde_json::json!({
                        "kind": r.get::<_, String>(0)?,
                        "target": r.get::<_, String>(1)?,
                        "ref": r.get::<_, String>(2)?,
                        "status": status,
                        "attempts": r.get::<_, i64>(4)?,
                        "lastError": r.get::<_, String>(5)?,
                        "nextAttemptAt": (status == "pending").then(|| r.get::<_, i64>(6)).transpose()?,
                        "updatedAt": r.get::<_, i64>(7)?,
                    }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(serde_json::json!({
                "relays": mirror.relays,
                "blossom": mirror.blossom,
                "counts": counts,
                "problems": problems,
            }))
        })
        .await
    }

    /// Gives failed jobs (of one target, or all) a fresh set of attempts, due now.
    pub async fn retry(&self, target: Option<String>) -> Result<usize, String> {
        self.db(move |conn| {
            conn.execute(
                "UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = ?1, last_error = NULL, updated_at = ?1
                 WHERE status = 'failed' AND (?2 IS NULL OR target = ?2)",
                params![now(), target],
            )
        })
        .await
    }

    /// Cleanup always runs. Outbound jobs run for configured targets or explicit durable owner
    /// authorizations; manifests also wait for their exact required blob copies.
    // ponytail: an indexer URL that was once a mirror relay also gets that relay's old pending
    // event jobs; filter by kind and author here if that ever matters.
    async fn due(&self, limit: usize) -> Result<Vec<Job>, String> {
        let targets: Vec<String> = self.0.mirror.relays.iter().chain(&self.0.mirror.blossom).cloned().collect();
        let indexers = self.0.indexers.read().clone();
        self.db(move |conn| {
            let marks = vec!["?"; targets.len()].join(",");
            let indexer_marks = vec!["?"; indexers.len()].join(",");
            let mut stmt = conn.prepare(&format!(
                "SELECT id, kind, target, ref_id, size, source_url, attempts FROM outbox
                 WHERE status = 'pending' AND next_attempt_at <= ? AND (kind = 'cleanup' OR target IN ({marks})
                   OR id IN (SELECT job FROM outbox_forced) OR (kind = 'event' AND target IN ({indexer_marks})))
                 AND (kind != 'event' OR NOT EXISTS (SELECT 1 FROM outbox_explicit e WHERE e.event_id=outbox.ref_id)
                   OR EXISTS (SELECT 1 FROM outbox_explicit e JOIN outbox_event_target t ON t.event_id=e.event_id
                     WHERE e.event_id=outbox.ref_id AND e.ready=1 AND e.canceled=0 AND t.target=outbox.target))
                 AND (kind != 'event' OR NOT EXISTS (
                   SELECT 1 FROM outbox_requires r WHERE r.event_id=outbox.ref_id AND NOT EXISTS (
                     SELECT 1 FROM outbox b WHERE b.kind='blob' AND b.ref_id=r.hash AND b.target=r.target
                       AND b.status='done' AND b.last_error IS NULL)))
                 AND (kind != 'blob-delete' OR NOT EXISTS (
                   SELECT 1 FROM outbox c JOIN blob_owner b ON b.hash=c.ref_id AND b.author=c.target
                   WHERE c.kind='cleanup' AND c.ref_id=outbox.ref_id AND c.status!='done'))
                 ORDER BY next_attempt_at, id LIMIT {limit}"
            ))?;
            let args = std::iter::once(rusqlite::types::Value::from(now()))
                .chain(targets.into_iter().chain(indexers).map(rusqlite::types::Value::from));
            let jobs = stmt.query_map(params_from_iter(args), |r| {
                Ok(Job {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    target: r.get(2)?,
                    ref_id: r.get(3)?,
                    size: r.get(4)?,
                    source_url: r.get(5)?,
                    attempts: r.get(6)?,
                })
            })?;
            jobs.collect()
        })
        .await
    }

    /// The stored JSON of an event job; `None` once a newer version replaced it or its author
    /// deleted it here (the replacement or the deletion has its own job).
    async fn event_json(&self, id: &str) -> Result<Option<String>, String> {
        let id = EventId::from_hex(id).map_err(|e| format!("broken event id: {e}"))?;
        self.db(move |conn| {
            conn.query_row("SELECT content FROM event WHERE event_hash = ?", [id.as_bytes().as_slice()], |r| r.get(0))
                .optional()
        })
        .await
    }

    async fn record(&self, job: &Job, outcome: Outcome) {
        let (id, attempts) = (job.id, job.attempts + 1);
        let jitter = rand::random::<f64>();
        let (target, kind) = (job.target.clone(), job.kind.clone());
        let res = self
            .db(move |conn| {
                let now = now();
                let (status, next, error) = match outcome {
                    Outcome::Done => ("done", now, None),
                    Outcome::Retry(e) if attempts < MAX_ATTEMPTS => ("pending", now + backoff(attempts, jitter) as i64, Some(e)),
                    Outcome::Retry(e) | Outcome::Fail(e) => ("failed", now, Some(e)),
                };
                // Only a still pending job: cleanup may have canceled a blob job, or an upload a
                // blob-delete job, while its remote request ran without the lifecycle lock.
                conn.execute(
                    "UPDATE outbox SET status = ?1, attempts = ?2, next_attempt_at = ?3, last_error = ?4, updated_at = ?5
                     WHERE id = ?6 AND status = 'pending'",
                    params![status, attempts, next, error, now, id],
                )
            })
            .await;
        if let Err(e) = res {
            tracing::warn!("outbox: cannot record the {kind} job for {target}: {e}");
        }
    }
}

/// The managed key as the worker sees it; read at each blob delivery, so a key created in the
/// studio is used without a restart.
fn mirror_key(keys: &crate::signer::Shared) -> Result<Keys, String> {
    match &*keys.lock() {
        Some(Ok(k)) => Ok(k.clone()),
        Some(Err(e)) => Err(format!("{NEEDS_KEY}, which cannot be unlocked: {e}")),
        None => Err(NEEDS_KEY.to_owned()),
    }
}

/// The HTTP client for mirror requests. Targets come only from the owner's config, so private
/// addresses are allowed (a NAS on the LAN is a fine mirror); redirects are not followed, so a
/// target cannot send the request anywhere else.
fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(MIRROR_TIMEOUT)
        .build()
        .expect("static reqwest client config")
}

/// Local cleanup runs even without mirror targets. Aborting leaves work pending for restart.
pub fn spawn(outbox: Outbox, keys: crate::signer::Shared) -> Option<tokio::task::JoinHandle<()>> {
    tracing::info!(
        "outbox: mirroring to {} relay(s) and {} Blossom server(s)",
        outbox.0.mirror.relays.len(),
        outbox.0.mirror.blossom.len()
    );
    Some(tokio::spawn(async move {
        let http = http_client();
        let mut running = JoinSet::new();
        // (target, ref) of running jobs: a blob and a blob-delete job for the same target never
        // run at once, so a mirror that lands late cannot undo a delete (or the reverse).
        let mut busy: HashSet<(String, String)> = HashSet::new();
        let mut tick = tokio::time::interval(POLL);
        loop {
            tokio::select! {
                Some(Ok(key)) = running.join_next() => { busy.remove(&key); }
                _ = tick.tick() => {}
            }
            let free = CONCURRENCY - running.len();
            if free == 0 {
                continue;
            }
            // Each running key can hide at most two due rows (its own and a blob/blob-delete sibling).
            let jobs = match outbox.due(free + 2 * busy.len()).await {
                Ok(j) => j,
                Err(e) => {
                    tracing::warn!("outbox: {e}");
                    continue;
                }
            };
            let mut started = 0;
            for job in jobs {
                if started == free { break; }
                let key = (job.target.clone(), job.ref_id.clone());
                if !busy.insert(key.clone()) { continue; }
                started += 1;
                let (outbox, keys, http) = (outbox.clone(), keys.clone(), http.clone());
                running.spawn(async move {
                    work(&outbox, &keys, &http, &job).await;
                    key
                });
            }
        }
    }))
}

/// Delivers one job and records the outcome. Local media work (the status re-check, cleanup, the
/// retained check) runs under `MEDIA_LIFECYCLE`; the lock is released before any request to a
/// mirror target, which may take up to `MIRROR_TIMEOUT`.
async fn work(outbox: &Outbox, keys: &crate::signer::Shared, http: &reqwest::Client, job: &Job) {
    let media_guard = if job.kind != "event" { Some(MEDIA_LIFECYCLE.lock().await) } else { None };
    // A selected job may have been canceled by cleanup (or superseded by an upload) since `due`.
    let id = job.id;
    match outbox.db(move |conn| conn.query_row("SELECT status FROM outbox WHERE id = ?", [id], |r| r.get::<_, String>(0))).await {
        Ok(status) if status == "pending" => {}
        Ok(_) => return,
        Err(e) => { outbox.record(job, Outcome::Retry(e)).await; return; }
    }
    let outcome = match job.kind.as_str() {
        "event" => match outbox.event_json(&job.ref_id).await {
            Ok(Some(json)) => match tokio::time::timeout(RELAY_TIMEOUT, publish(&job.target, &json, &job.ref_id)).await {
                Ok(Ok(())) => Outcome::Done,
                Ok(Err(e)) => Outcome::Retry(e),
                Err(_) => Outcome::Retry(format!("no OK within {} s", RELAY_TIMEOUT.as_secs())),
            },
            Ok(None) => Outcome::Done,
            Err(e) => Outcome::Retry(e),
        },
        "cleanup" => match cleanup(outbox, job).await {
            Ok(()) => Outcome::Done,
            Err(Outcome::Fail(e)) => Outcome::Fail(e),
            Err(Outcome::Retry(e)) => Outcome::Retry(e),
            Err(Outcome::Done) => unreachable!(),
        },
        "blob-delete" => match retained_hashes(outbox).await {
            Err(e) => Outcome::Retry(e),
            Ok(retained) if retained.contains(&job.ref_id) => Outcome::Done,
            Ok(_) => match mirror_key(keys) {
                Err(e) => Outcome::Fail(e),
                Ok(k) => {
                    drop(media_guard);
                    // Accepted race: an event that references the hash again while this request
                    // runs does not stop it. The local copy is already gone (cleanup removes it
                    // before a blob-delete is due), so only a re-upload brings the blob back, and
                    // its mirror job waits for this one (`busy`).
                    match delete_mirror(http, &k, &job.target, &job.ref_id).await {
                        Ok(()) => Outcome::Done,
                        Err(e) => Outcome::Retry(e),
                    }
                }
            },
        },
        _ => match mirror_key(keys) {
            Err(e) => Outcome::Fail(e),
            Ok(k) => {
                drop(media_guard);
                // Cleanup may remove the local blob while the target fetches it: the target then
                // fails the fetch (a retry that `record` drops) or keeps a copy that the queued
                // blob-delete removes after this job (`busy`).
                let (size, url) = (job.size.unwrap_or_default() as u64, job.source_url.as_deref().unwrap_or_default());
                match mirror(outbox, http, &k, &job.target, &job.ref_id, size, url).await {
                    Ok(()) => Outcome::Done,
                    Err(e) => Outcome::Retry(e),
                }
            }
        },
    };
    if let Outcome::Retry(e) | Outcome::Fail(e) = &outcome {
        tracing::info!("outbox: {} {} to {}: {e}", job.kind, job.ref_id, job.target);
    }
    outbox.record(job, outcome).await;
}

pub(crate) fn storage(outbox: &Outbox) -> Result<almond::models::AppState, String> {
    outbox.0.storage.read().clone().ok_or_else(|| "local Blossom storage is unavailable".into())
}

/// Walk only indexed local playlists. Read errors and excessive graphs are not absence.
async fn media_tree(state: &almond::models::AppState, roots: HashSet<String>) -> Result<HashSet<String>, String> {
    use almond::services::{file_storage, hls};
    let mut seen = HashSet::new();
    let mut pending: Vec<_> = roots.into_iter().collect();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) { continue; }
        if seen.len() > 1024 { return Err("local HLS graph exceeds 1024 blobs".into()); }
        let Some(metadata) = file_storage::get_file_metadata(state, &hash).await else { continue };
        if metadata.extension.as_deref() != Some("m3u8")
            && !metadata.mime_type.as_deref().is_some_and(hls::is_hls_playlist) { continue; }
        if metadata.size > 1 << 20 { return Err(format!("local playlist {hash} exceeds 1 MiB")); }
        let text = file_storage::read_text(state, &metadata).await
            .map_err(|e| format!("cannot read local playlist {hash}: {e}"))?;
        pending.extend(hls::parse_playlist_references(&text).into_iter().map(|r| r.sha256.to_ascii_lowercase()));
        // Initialization segments and encryption keys use URI attributes on comment lines.
        for part in text.split("URI=\"").skip(1) {
            let value = part.split('"').next().unwrap_or_default();
            let filename = nostr::prelude::Url::parse(value).ok()
                .and_then(|url| url.path_segments().and_then(|mut p| p.next_back()).map(str::to_owned))
                .unwrap_or_else(|| value.to_owned());
            if let Some(hash) = file_storage::extract_sha256_from_filename(&filename) {
                pending.push(hash.to_ascii_lowercase());
            }
        }
    }
    Ok(seen)
}

async fn retained_hashes(outbox: &Outbox) -> Result<HashSet<String>, String> {
    let roots = outbox.db(|conn| {
        let mut stmt = conn.prepare("SELECT DISTINCT hash FROM media_ref")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut roots = rows.collect::<rusqlite::Result<HashSet<_>>>()?;
        // Scheduled videos are not in the relay yet, but their blobs must outlive any cleanup.
        roots.extend(crate::schedule::pending_media(conn)?);
        let mut retained = conn.prepare("SELECT DISTINCT hash FROM outbox_retain")?;
        roots.extend(retained.query_map([], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?);
        Ok(roots)
    }).await?;
    let state = outbox.0.storage.read().clone();
    match state {
        Some(state) => media_tree(&state, roots).await,
        None => Ok(roots),
    }
}

async fn cleanup(outbox: &Outbox, job: &Job) -> Result<(), Outcome> {
    use almond::services::file_storage::{self, Removal};
    file_storage::validate_sha256_format(&job.ref_id).map_err(|e| Outcome::Fail(e.to_string()))?;
    let retained = retained_hashes(outbox).await.map_err(Outcome::Retry)?;
    if retained.contains(&job.ref_id) { return Ok(()); }
    let hash = job.ref_id.clone();
    let owner = outbox.db(move |conn| {
        conn.query_row("SELECT author, mirrored FROM blob_owner WHERE hash = ?", [hash],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?))).optional()
    }).await.map_err(Outcome::Retry)?;
    let Some((author, mirrored)) = owner else {
        // ponytail: Almond-mirrored HLS children have no owner and no cancel hook; they
        // stay as safe leaks until Almond exposes child ownership/cancellation.
        return Err(Outcome::Fail("blob has no recorded owner; not deleting".into()));
    };
    if author != job.target {
        return Err(Outcome::Fail("blob owner differs from video author; not deleting".into()));
    }
    let state = storage(outbox).map_err(Outcome::Retry)?;
    let metadata = file_storage::get_file_metadata(&state, &job.ref_id).await;
    if metadata.as_ref().is_some_and(|m| m.pubkey.is_some_and(|owner| owner.to_hex() != author)) {
        return Err(Outcome::Fail("indexed blob owner differs from video author; not deleting".into()));
    }
    let tree = media_tree(&state, HashSet::from([job.ref_id.clone()])).await.map_err(Outcome::Retry)?;
    let descendants: Vec<_> = tree.difference(&retained).filter(|hash| *hash != &job.ref_id).cloned().collect();
    let public_key = nostr::prelude::PublicKey::from_hex(&author).map_err(|e| Outcome::Fail(e.to_string()))?;
    let targets = if mirrored { vec![] } else { outbox.0.mirror.blossom.clone() };
    let hash = job.ref_id.clone();
    // Persist children before removing their parent, and DELETE intents before touching bytes:
    // either crash point can be resumed without losing the playlist or the mirror work.
    outbox.db(move |conn| {
        let tx = conn.unchecked_transaction()?;
        for child in descendants { enqueue_cleanup(&tx, &public_key, &child)?; }
        let mut targets = targets;
        let mut explicit = tx.prepare("SELECT target FROM outbox_delete_target WHERE hash=?")?;
        let historical = explicit.query_map([&hash], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        drop(explicit);
        targets.extend(historical.iter().cloned());
        targets.sort();
        targets.dedup();
        let ids = enqueue_deletes(&tx, &targets, &hash)?;
        for (target, id) in targets.iter().zip(ids) {
            if historical.contains(target) { tx.execute("INSERT OR IGNORE INTO outbox_forced VALUES (?)", [id])?; }
        }
        tx.commit()
    }).await.map_err(Outcome::Retry)?;
    if let Some(metadata) = metadata {
        let removed = file_storage::remove_indexed_blob(&state, &job.ref_id, Removal::Requested, Some(&metadata))
            .await.map_err(|e| Outcome::Retry(format!("cannot remove local blob: {e}")))?;
        if !removed && file_storage::get_file_metadata(&state, &job.ref_id).await.is_some() {
            return Err(Outcome::Retry("local blob changed during cleanup".into()));
        }
    }
    Ok(())
}

async fn delete_mirror(http: &reqwest::Client, keys: &Keys, target: &str, hash: &str) -> Result<(), String> {
    almond::services::file_storage::validate_sha256_format(hash).map_err(|e| e.to_string())?;
    let expiration = (Timestamp::now().as_secs() + 600).to_string();
    let auth = EventBuilder::new(Kind::Custom(24242), "Delete blob")
        .tags([
            Tag::parse(["t", "delete"]).map_err(|e| e.to_string())?,
            Tag::parse(["x", hash]).map_err(|e| e.to_string())?,
            Tag::parse(["expiration", expiration.as_str()]).map_err(|e| e.to_string())?,
        ]).finalize(keys).map_err(|e| format!("cannot sign delete token: {e}"))?;
    let token = base64::engine::general_purpose::STANDARD.encode(auth.as_json());
    let res = http.delete(format!("{}/{hash}", target.trim_end_matches('/')))
        .header(header::AUTHORIZATION, format!("Nostr {token}"))
        .send().await.map_err(|e| format!("delete request failed: {e}"))?;
    let status = res.status();
    // Almond's delete is idempotent and answers 204 even for an absent blob. Other
    // targets' 404s are not success: a wrong route must remain visible.
    if !status.is_success() {
        let reason = res.headers().get("x-reason").and_then(|v| v.to_str().ok()).map(str::to_owned);
        let reason = match reason { Some(r) => r, None => res.text().await.unwrap_or_default() };
        return Err(format!("{status}: {}", short(&reason)));
    }
    Ok(())
}

/// NIP-01 `EVENT` to `target`, done at its `OK`. `OK false` with `duplicate:` means the relay
/// has it already, which is what we want.
async fn publish(target: &str, json: &str, id: &str) -> Result<(), String> {
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};
    let mut req = target.into_client_request().map_err(|e| format!("invalid relay URL: {e}"))?;
    req.headers_mut().insert(header::USER_AGENT, HeaderValue::from_static(USER_AGENT));
    let (mut ws, _) = tokio_tungstenite::connect_async(req).await.map_err(|e| format!("cannot connect: {e}"))?;
    ws.send(Message::text(format!("[\"EVENT\",{json}]"))).await.map_err(|e| format!("cannot send: {e}"))?;
    while let Some(msg) = ws.next().await {
        let Message::Text(text) = msg.map_err(|e| format!("connection lost: {e}"))? else {
            continue;
        };
        let Ok(serde_json::Value::Array(m)) = serde_json::from_str(text.as_str()) else {
            continue;
        };
        if m.first().and_then(|v| v.as_str()) != Some("OK") || m.get(1).and_then(|v| v.as_str()) != Some(id) {
            continue;
        }
        let _ = ws.close(None).await;
        let message = m.get(3).and_then(|v| v.as_str()).unwrap_or_default();
        return if m.get(2).and_then(|v| v.as_bool()) == Some(true) || message.starts_with("duplicate") {
            Ok(())
        } else {
            Err(format!("refused: {}", short(message)))
        };
    }
    Err("connection closed before OK".into())
}

/// S1 keeps BUD-04 pull; S2 sends a streaming BUD-02 upload from the attached storage.
async fn mirror(outbox: &Outbox, http: &reqwest::Client, keys: &Keys, target: &str, sha256: &str, size: u64, url: &str) -> Result<(), String> {
    let base = target.trim_end_matches('/');
    // A matching strong ETag and length confirm an existing content-addressed copy. Never trust
    // an arbitrary 200 (a gateway may answer HTML); without both values do the normal upload.
    if let Ok(existing) = http.head(format!("{base}/{sha256}")).timeout(PROBE_TIMEOUT).send().await {
        if existing.status().is_success() {
            let confirmed = existing.headers().get("x-sha-256").and_then(|v| v.to_str().ok())
                .or_else(|| existing.headers().get(header::ETAG).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix('"')?.strip_suffix('"')));
            let length = existing.headers().get(header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
            if confirmed == Some(sha256) && length == Some(size) { return Ok(()); }
        }
    }
    let push = !outbox.0.origin_public.load(Ordering::Relaxed);
    let timeout = if push { MIRROR_TIMEOUT.saturating_add(Duration::from_secs(size / MIN_UPLOAD_RATE)) } else { MIRROR_TIMEOUT };
    let expiration = Timestamp::now().as_secs().saturating_add(timeout.as_secs()).saturating_add(60).to_string();
    let tag = |t: &[&str]| Tag::parse(t.iter().copied()).map_err(|e| format!("cannot build the auth token: {e}"));
    let auth = EventBuilder::new(Kind::Custom(24242), "Mirror blob")
        .tags([tag(&["t", "upload"])?, tag(&["x", sha256])?, tag(&["expiration", &expiration])?])
        .finalize(keys).map_err(|e| format!("cannot sign the auth token: {e}"))?;
    let token = base64::engine::general_purpose::STANDARD.encode(auth.as_json());
    let request = if push {
        let state = storage(outbox)?;
        let metadata = almond::services::file_storage::get_file_metadata(&state, sha256).await
            .ok_or_else(|| format!("local blob {sha256} is unavailable"))?;
        if metadata.size != size {
            return Err(format!("local blob {sha256} has size {}, expected {size}", metadata.size));
        }
        let body = match &metadata.location {
            almond::models::FileLocation::Local(path) => {
                let file = tokio::fs::File::open(path).await.map_err(|e| format!("cannot open local blob {sha256}: {e}"))?;
                reqwest::Body::from(file)
            }
            almond::models::FileLocation::S3 { key } => {
                let s3 = state.native_s3.as_ref().ok_or("S3 storage is unavailable")?;
                let output = s3.get(key, None).await.map_err(|e| e.to_string())?;
                reqwest::Body::wrap_stream(futures_util::stream::try_unfold(output.body, |mut body| async move {
                    body.next().await.transpose().map(|chunk| chunk.map(|chunk| (chunk, body)))
                }))
            }
        };
        http.put(format!("{base}/upload"))
            .header("x-sha-256", sha256)
            .header(header::CONTENT_LENGTH, size)
            .header(header::CONTENT_TYPE, metadata.mime_type.as_deref().unwrap_or("application/octet-stream"))
            .body(body)
    } else {
        http.put(format!("{base}/mirror")).json(&serde_json::json!({ "url": url }))
    };
    let res = request.header(header::AUTHORIZATION, format!("Nostr {token}"))
        .timeout(timeout).send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = res.status();
    if !status.is_success() {
        let reason = res.headers().get("x-reason").and_then(|v| v.to_str().ok()).map(str::to_owned);
        let reason = match reason { Some(r) => r, None => res.text().await.unwrap_or_default() };
        return Err(format!("{status}: {}", short(&reason)));
    }
    let d: serde_json::Value = res.json().await.map_err(|e| format!("not a blob descriptor: {e}"))?;
    if d["sha256"].as_str() != Some(sha256) || d["size"].as_u64() != Some(size) {
        return Err(format!(
            "the target confirmed sha256 {} and size {}, expected {sha256} and {size}",
            d["sha256"], d["size"]
        ));
    }
    Ok(())
}

/// Error texts from targets are stored and shown; keep them short.
fn short(s: &str) -> String {
    let s = s.trim();
    match s.char_indices().nth(300) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_owned(),
    }
}

/// One round of the worker, for tests of other modules that leave jobs in the outbox.
#[cfg(test)]
pub(crate) async fn run_due_for_test(outbox: &Outbox, keys: &crate::signer::Shared) {
    let http = http_client();
    for job in outbox.due(100).await.unwrap() {
        work(outbox, keys, &http, &job).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{extract::ws::WebSocketUpgrade, routing::put, Json, Router};
    use std::sync::atomic::{AtomicUsize, Ordering};

    const SHA: &str = "c9f1c6b2a1a8c3e0e1c0a5f5f2b3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5";

    /// A relay file with the relay schema and the outbox, in a fresh temp path.
    fn fixture(mirror: Mirror) -> (Outbox, crate::relay::Relay, std::path::PathBuf) {
        static N: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "nostube-outbox-test-{}-{}.sqlite",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_file(&path);
        let relay = crate::relay::Relay::open(
            &path,
            crate::relay::RelayConfig {
                writers: vec![],
                name: "t".into(),
                description: "t".into(),
                mirror_relays: mirror.relays.clone(),
            },
        )
        .unwrap();
        (Outbox::open(&path, mirror).unwrap(), relay, path)
    }

    fn row(outbox: &Outbox, kind: &str, target: &str) -> (String, u32, i64, Option<String>) {
        outbox
            .0
            .conn
            .lock()
            .query_row(
                "SELECT status, attempts, next_attempt_at, last_error FROM outbox WHERE kind = ? AND target = ?",
                [kind, target],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap()
    }

    /// What the worker does in one round, in sequence.
    async fn run_due(outbox: &Outbox, keys: &crate::signer::Shared) {
        let http = http_client();
        for job in outbox.due(100).await.unwrap() {
            work(outbox, keys, &http, &job).await;
        }
    }

    async fn serve(app: Router) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("127.0.0.1:{}", addr.port())
    }

    /// A relay that answers every `EVENT` with `OK` (`accept`, `message`) and counts them.
    async fn fake_relay(accept: bool, message: &'static str, seen: Arc<AtomicUsize>) -> String {
        let app = Router::new().route(
            "/",
            axum::routing::get(move |ws: WebSocketUpgrade| async move {
                ws.on_upgrade(move |mut socket| async move {
                    use axum::extract::ws::Message;
                    while let Some(Ok(Message::Text(text))) = socket.recv().await {
                        let msg: serde_json::Value = serde_json::from_str(text.as_str()).unwrap();
                        seen.fetch_add(1, Ordering::Relaxed);
                        let ok = serde_json::json!(["OK", msg[1]["id"], accept, message]).to_string();
                        socket.send(Message::Text(ok.into())).await.unwrap();
                    }
                })
            }),
        );
        format!("ws://{}", serve(app).await)
    }

    /// A Blossom server whose `/mirror` answers a descriptor with `sha256`/`size`, after checking
    /// the request carries an upload token for `SHA` signed by `signer` and the source URL.
    async fn fake_blossom(sha256: &'static str, size: u64, signer: nostr::prelude::PublicKey) -> String {
        let app = Router::new().route(
            "/mirror",
            put(move |headers: HeaderMap, Json(body): Json<serde_json::Value>| async move {
                let token = headers[header::AUTHORIZATION].to_str().unwrap().strip_prefix("Nostr ").unwrap().to_owned();
                let auth = nostr::prelude::Event::from_json(base64::engine::general_purpose::STANDARD.decode(token).unwrap()).unwrap();
                auth.verify().unwrap();
                assert_eq!((auth.kind, auth.pubkey), (Kind::Custom(24242), signer));
                let tags: Vec<Vec<String>> = auth.tags.iter().map(|t| t.as_slice().to_vec()).collect();
                assert!(tags.contains(&vec!["t".into(), "upload".into()]) && tags.contains(&vec!["x".into(), SHA.into()]));
                assert!(is_mirror_delivery(&headers));
                assert_eq!(body["url"], format!("https://here.example/{SHA}.mp4"));
                Json(serde_json::json!({ "url": "https://there/x", "sha256": sha256, "size": size, "type": "video/mp4", "uploaded": 1 }))
            }),
        );
        format!("http://{}", serve(app).await)
    }

    fn descriptor() -> Response {
        let body = serde_json::json!({ "url": format!("https://here.example/{SHA}.mp4"), "sha256": SHA, "size": 42, "type": "video/mp4", "uploaded": 1 });
        (axum::http::StatusCode::CREATED, Json(body)).into_response()
    }

    fn shared(keys: Option<Keys>) -> crate::signer::Shared {
        Arc::new(Mutex::new(keys.map(Ok)))
    }

    #[test]
    fn backoff_doubles_up_to_the_cap_and_jitters_down_to_half() {
        assert_eq!(backoff(1, 0.999_999), BACKOFF_BASE - 1);
        assert_eq!(backoff(1, 0.0), BACKOFF_BASE / 2);
        assert_eq!(backoff(2, 0.0), BACKOFF_BASE);
        assert_eq!(backoff(4, 0.0), BACKOFF_BASE * 4);
        assert_eq!(backoff(8, 0.0), BACKOFF_CAP / 2);
        assert!(backoff(MAX_ATTEMPTS, 0.999_999) < BACKOFF_CAP);
        assert!(backoff(u32::MAX, 0.0) == BACKOFF_CAP / 2);
    }

    #[tokio::test]
    async fn blob_jobs_are_queued_once_per_target_and_only_for_descriptors() {
        let blossom = vec!["https://a.example".to_owned(), "https://b.example".to_owned()];
        let (outbox, _relay, path) = fixture(Mirror { relays: vec![], blossom: blossom.clone() });
        // The answer goes back to the client unchanged.
        let res = outbox.after_upload(descriptor()).await;
        assert_eq!(res.status(), axum::http::StatusCode::CREATED);
        let body = axum::body::to_bytes(res.into_body(), 1 << 16).await.unwrap();
        assert_eq!(serde_json::from_slice::<serde_json::Value>(&body).unwrap()["sha256"], SHA);
        // A replay (or the same blob uploaded again) adds nothing.
        outbox.after_upload(descriptor()).await;
        // A refused upload and a PATCH chunk (204, no body) queue nothing.
        outbox.after_upload(axum::http::StatusCode::UNAUTHORIZED.into_response()).await;
        outbox.after_upload(axum::http::StatusCode::NO_CONTENT.into_response()).await;
        let n: i64 = outbox.0.conn.lock().query_row("SELECT COUNT(*) FROM outbox", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        for target in &blossom {
            assert_eq!(row(&outbox, "blob", target).0, "pending");
        }
        std::fs::remove_file(path).ok();
    }

    #[tokio::test]
    async fn events_reach_a_mirror_relay_and_failures_back_off() {
        let seen = Arc::new(AtomicUsize::new(0));
        let ok = fake_relay(true, "", seen.clone()).await;
        let dup = fake_relay(false, "duplicate: already have this event", seen.clone()).await;
        let refusing = fake_relay(false, "blocked: not on the list", seen.clone()).await;
        // Nobody listens here.
        let gone = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            format!("ws://{}", l.local_addr().unwrap())
        };
        let relays = vec![ok.clone(), dup.clone(), refusing.clone(), gone.clone()];
        let (outbox, _relay, path) = fixture(Mirror { relays: relays.clone(), blossom: vec![] });
        let ev = EventBuilder::new(Kind::TextNote, "hi").finalize(&Keys::generate()).unwrap();
        {
            let conn = outbox.0.conn.lock();
            conn.execute(
                "INSERT INTO event (event_hash, created_at, author, kind, content) VALUES (?, 1, ?, 1, ?)",
                params![ev.id.as_bytes().as_slice(), ev.pubkey.as_bytes().as_slice(), ev.as_json()],
            )
            .unwrap();
            enqueue_event(&conn, &relays, &ev.id).unwrap();
            enqueue_event(&conn, &relays, &ev.id).unwrap();
        }
        run_due(&outbox, &shared(None)).await;
        assert_eq!(seen.load(Ordering::Relaxed), 3);
        assert_eq!(row(&outbox, "event", &ok).0, "done");
        assert_eq!(row(&outbox, "event", &dup).0, "done");
        let before = now();
        let (status, attempts, next, error) = row(&outbox, "event", &refusing);
        assert_eq!((status.as_str(), attempts), ("pending", 1));
        assert_eq!(error.as_deref(), Some("refused: blocked: not on the list"));
        assert!(next >= before + (BACKOFF_BASE / 2) as i64 - 1 && next <= before + BACKOFF_BASE as i64, "{next}");
        let (status, _, _, error) = row(&outbox, "event", &gone);
        assert_eq!(status, "pending");
        assert!(error.unwrap().starts_with("cannot connect"));

        // Not due yet: nothing is sent again.
        run_due(&outbox, &shared(None)).await;
        assert_eq!(seen.load(Ordering::Relaxed), 3);

        // The last allowed attempt fails for good; the studio sees it and can retry it.
        outbox
            .0
            .conn
            .lock()
            .execute("UPDATE outbox SET attempts = ?, next_attempt_at = 0 WHERE target = ?", params![MAX_ATTEMPTS - 1, refusing])
            .unwrap();
        run_due(&outbox, &shared(None)).await;
        assert_eq!(row(&outbox, "event", &refusing).0, "failed");
        let status = outbox.status().await.unwrap();
        let problems = status["problems"].as_array().unwrap();
        let problem = |t: &str| problems.iter().find(|p| p["target"] == t).unwrap().clone();
        assert_eq!((problem(&refusing)["status"].as_str(), problem(&refusing)["nextAttemptAt"].is_null()), (Some("failed"), true));
        assert_eq!(problem(&gone)["status"], "pending");
        assert!(problem(&gone)["nextAttemptAt"].as_i64().unwrap() > before);
        let counts = status["counts"].as_array().unwrap();
        assert!(counts.iter().any(|c| c["target"] == ok.as_str() && c["done"] == 1));
        assert_eq!(outbox.retry(Some(gone.clone())).await.unwrap(), 0);
        assert_eq!(outbox.retry(Some(refusing.clone())).await.unwrap(), 1);
        let (status, attempts, _, error) = row(&outbox, "event", &refusing);
        assert_eq!((status.as_str(), attempts, error), ("pending", 0, None));
        std::fs::remove_file(path).ok();
    }

    #[tokio::test]
    async fn blobs_are_mirrored_with_the_managed_key_and_the_hash_is_checked() {
        let keys = Keys::generate();
        let good = fake_blossom(SHA, 42, keys.public_key()).await;
        let wrong_hash = fake_blossom("00ff", 42, keys.public_key()).await;
        let wrong_size = fake_blossom(SHA, 41, keys.public_key()).await;
        let blossom = vec![good.clone(), wrong_hash.clone(), wrong_size.clone()];
        let (outbox, _relay, path) = fixture(Mirror { relays: vec![], blossom: blossom.clone() });
        outbox.after_upload(descriptor()).await;

        // Without the managed key nothing else may sign: failed at once, with the reason.
        run_due(&outbox, &shared(None)).await;
        for target in &blossom {
            let (status, attempts, _, error) = row(&outbox, "blob", target);
            assert_eq!((status.as_str(), attempts, error.as_deref()), ("failed", 1, Some(NEEDS_KEY)));
        }

        // Created later in the studio: a retry delivers.
        assert_eq!(outbox.retry(None).await.unwrap(), 3);
        run_due(&outbox, &shared(Some(keys))).await;
        assert_eq!(row(&outbox, "blob", &good).0, "done");
        for target in [&wrong_hash, &wrong_size] {
            let (status, _, _, error) = row(&outbox, "blob", target);
            assert_eq!(status, "pending");
            assert!(error.unwrap().starts_with("the target confirmed sha256"));
        }
        std::fs::remove_file(path).ok();
    }

    async fn lifecycle_fixture(keys: &Keys, mirror: Mirror) -> (Outbox, crate::relay::Relay, almond::models::AppState) {
        let (outbox, old_relay, path) = fixture(mirror.clone());
        drop(old_relay);
        let relay = crate::relay::Relay::open(&path, crate::relay::RelayConfig {
            writers: vec![keys.public_key()], name: "test".into(), description: "test".into(),
            mirror_relays: mirror.relays,
        }).unwrap();
        let mut cfg = almond::Config::defaults();
        cfg.storage_path = path.with_extension("blossom");
        cfg.public_url = Some("https://instance.example".into());
        cfg.allowed_npubs = vec![keys.public_key()];
        cfg.storage_min_free = 0;
        cfg.homepage_enabled = false;
        let state = almond::build_state(&cfg.validate().unwrap()).await.unwrap();
        outbox.attach_storage(state.clone());
        (outbox, relay, state)
    }

    async fn stored(
        outbox: &Outbox, state: &almond::models::AppState, keys: &Keys,
        bytes: &[u8], extension: &str, mirrored: bool,
    ) -> (String, std::path::PathBuf) {
        use sha2::Digest;
        let hash = format!("{:x}", sha2::Sha256::digest(bytes));
        let path = state.storage.uploads.join(format!("{hash}.{extension}"));
        tokio::fs::create_dir_all(&state.storage.uploads).await.unwrap();
        tokio::fs::write(&path, bytes).await.unwrap();
        state.file_index.insert(hash.clone(), almond::models::FileMetadata {
            location: almond::models::FileLocation::Local(path.clone()), extension: Some(extension.into()),
            mime_type: Some(mime_guess::from_ext(extension).first_or_octet_stream().to_string()),
            size: bytes.len() as u64, created_at: now() as u64, pubkey: None, expiration: None,
            origin: Default::default(),
        }).await;
        outbox.record_owner(hash.clone(), keys.public_key(), mirrored).await.unwrap();
        (hash, path)
    }

    fn video_event(keys: &Keys, at: u64, d: &str, hashes: &[(&str, &str)]) -> nostr::prelude::Event {
        let mut tags = vec![Tag::parse(["d", d]).unwrap(), Tag::parse(["title", "clip"]).unwrap()];
        tags.extend(hashes.iter().map(|(tag, hash)| {
            let url = format!("https://instance.example/{hash}");
            if *tag == "imeta" {
                Tag::parse(["imeta", format!("url {url}").as_str(), format!("x {hash}").as_str()]).unwrap()
            } else { Tag::parse([*tag, url.as_str()]).unwrap() }
        }));
        EventBuilder::new(Kind::Custom(34235), "description").tags(tags)
            .custom_created_at(Timestamp::from(at)).finalize(keys).unwrap()
    }

    async fn accepted(relay: &crate::relay::Relay, event: nostr::prelude::Event) {
        assert!(matches!(relay.ingest(event).await, nostr::prelude::RelayMessage::Ok { status: true, .. }));
    }

    #[tokio::test]
    async fn replacement_cleans_real_storage_and_hls_children_then_delivers_mirror_deletes() {
        let keys = Keys::generate();
        let (remote_outbox, _remote_relay, remote) = lifecycle_fixture(&keys, Mirror::default()).await;
        let target = format!("http://{}", serve(almond::create_app(remote.clone())).await);
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        let (segment, segment_path) = stored(&outbox, &state, &keys, b"shared segment", "ts", false).await;
        let (init, init_path) = stored(&outbox, &state, &keys, b"init bytes", "mp4", false).await;
        let playlist = format!("#EXTM3U\n#EXT-X-MAP:URI=\"{init}.mp4\"\n{segment}.ts\n");
        let (old, old_path) = stored(&outbox, &state, &keys, playlist.as_bytes(), "m3u8", false).await;
        let (thumb, thumb_path) = stored(&outbox, &state, &keys, b"old thumbnail", "jpg", false).await;
        let (track, track_path) = stored(&outbox, &state, &keys, b"WEBVTT\nold", "vtt", false).await;
        let (new, new_path) = stored(&outbox, &state, &keys, b"replacement", "mp4", false).await;
        for (bytes, ext) in [
            (b"shared segment".as_slice(), "ts"), (b"init bytes".as_slice(), "mp4"),
            (playlist.as_bytes(), "m3u8"), (b"old thumbnail".as_slice(), "jpg"), (b"WEBVTT\nold".as_slice(), "vtt"),
        ] { stored(&remote_outbox, &remote, &keys, bytes, ext, true).await; }
        accepted(&relay, video_event(&keys, 10, "clip", &[("imeta", &old), ("thumb", &thumb), ("text-track", &track)])).await;
        accepted(&relay, video_event(&keys, 11, "shared", &[("imeta", &segment)])).await;
        accepted(&relay, video_event(&keys, 20, "clip", &[("imeta", &old), ("thumb", &thumb), ("text-track", &track)])).await;
        let queued: i64 = outbox.0.conn.lock().query_row("SELECT COUNT(*) FROM outbox WHERE kind='cleanup'", [], |r| r.get(0)).unwrap();
        assert_eq!(queued, 0, "metadata update cannot delete media");
        // A pending mirror upload selected before deletion cannot run after cleanup.
        outbox.after_upload((axum::http::StatusCode::CREATED, Json(serde_json::json!({
            "sha256": old, "size": playlist.len(), "url": format!("https://instance.example/{old}.m3u8")
        }))).into_response()).await;
        let selected_upload = outbox.due(100).await.unwrap().into_iter().find(|j| j.kind == "blob").unwrap();
        accepted(&relay, video_event(&keys, 30, "clip", &[("imeta", &new)])).await;
        let cleanup_jobs: Vec<_> = outbox.due(100).await.unwrap().into_iter().filter(|j| j.kind == "cleanup").collect();
        for job in cleanup_jobs { work(&outbox, &shared(Some(keys.clone())), &http_client(), &job).await; }
        work(&outbox, &shared(Some(keys.clone())), &http_client(), &selected_upload).await;
        assert_eq!(row(&outbox, "blob", &target).0, "done");
        assert!(!old_path.exists() && !thumb_path.exists() && !track_path.exists());
        assert!(segment_path.exists() && new_path.exists());
        run_due(&outbox, &shared(Some(keys.clone()))).await;
        run_due(&outbox, &shared(Some(keys.clone()))).await;
        assert!(!init_path.exists(), "HLS URI attributes are cleaned too");
        for hash in [&old, &thumb, &track, &init] {
            assert!(state.file_index.get(hash).await.is_none());
            assert!(remote.file_index.get(hash).await.is_none(), "real Almond DELETE removed {hash}");
        }
        assert!(remote.file_index.get(&segment).await.is_some(), "shared active segment remains on mirror");
        assert!(outbox.due(100).await.unwrap().is_empty());
        let count: i64 = outbox.0.conn.lock().query_row(
            "SELECT COUNT(*) FROM outbox WHERE kind IN ('cleanup','blob-delete') AND ref_id=?", [&segment], |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 0);
        // The coordinate deletion cleans the replacement, too.
        let coordinate = format!("34235:{}:clip", keys.public_key());
        let deletion = EventBuilder::new(Kind::EventDeletion, "")
            .tags([Tag::parse(["a", &coordinate]).unwrap()])
            .custom_created_at(Timestamp::from(40)).finalize(&keys).unwrap();
        accepted(&relay, deletion).await;
        run_due(&outbox, &shared(Some(keys.clone()))).await;
        run_due(&outbox, &shared(Some(keys))).await;
        assert!(!new_path.exists());
    }

    #[tokio::test]
    async fn cleanup_requires_ownership_and_mirrored_blobs_never_chain_deletion() {
        let keys = Keys::generate();
        let foreign = Keys::generate();
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror {
            relays: vec![], blossom: vec!["http://unreachable.invalid".into()],
        }).await;
        let (mirrored, mirrored_path) = stored(&outbox, &state, &keys, b"mirrored copy", "mp4", true).await;
        let (wrong_owner, wrong_owner_path) = stored(&outbox, &state, &foreign, b"foreign copy", "mp4", false).await;
        let (unowned, unowned_path) = stored(&outbox, &state, &keys, b"old unowned copy", "mp4", false).await;
        outbox.0.conn.lock().execute("DELETE FROM blob_owner WHERE hash=?", [&unowned]).unwrap();
        accepted(&relay, video_event(&keys, 10, "clip", &[("imeta", &mirrored), ("thumb", &wrong_owner), ("text-track", &unowned)])).await;
        let coordinate = format!("34235:{}:clip", keys.public_key());
        let deletion = EventBuilder::new(Kind::EventDeletion, "")
            .tags([Tag::parse(["a", &coordinate]).unwrap()])
            .custom_created_at(Timestamp::from(20)).finalize(&keys).unwrap();
        accepted(&relay, deletion).await;
        run_due(&outbox, &shared(None)).await;
        assert!(!mirrored_path.exists());
        assert!(wrong_owner_path.exists() && unowned_path.exists());
        let status = outbox.status().await.unwrap();
        let problems = status["problems"].as_array().unwrap();
        assert_eq!(problems.len(), 2);
        assert!(problems.iter().all(|p| p["status"] == "failed"));
        assert!(problems.iter().any(|p| p["lastError"] == "blob has no recorded owner; not deleting"));
        assert!(problems.iter().any(|p| p["lastError"] == "blob owner differs from video author; not deleting"));
        let outbound: i64 = outbox.0.conn.lock().query_row(
            "SELECT COUNT(*) FROM outbox WHERE kind IN ('blob','blob-delete')", [], |r| r.get(0),
        ).unwrap();
        assert_eq!(outbound, 0, "mirrored-origin cleanup must not chain to this instance's targets");
    }

    #[tokio::test]
    async fn durable_delete_missing_key_and_remote_errors_remain_real_failures() {
        let keys = Keys::generate();
        let target = format!("http://{}", serve(Router::new().route("/{hash}", axum::routing::delete(|| async {
            (axum::http::StatusCode::SERVICE_UNAVAILABLE, "disk unavailable")
        }))).await);
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        let (hash, path) = stored(&outbox, &state, &keys, b"delete copy", "mp4", false).await;
        accepted(&relay, video_event(&keys, 10, "clip", &[("imeta", &hash)])).await;
        accepted(&relay, video_event(&keys, 20, "clip", &[])).await;
        run_due(&outbox, &shared(None)).await;
        assert!(!path.exists());
        run_due(&outbox, &shared(None)).await;
        assert_eq!(row(&outbox, "blob-delete", &target).3.as_deref(), Some(NEEDS_KEY));
        assert_eq!(outbox.retry(None).await.unwrap(), 1);
        run_due(&outbox, &shared(Some(keys))).await;
        let (status, _, _, error) = row(&outbox, "blob-delete", &target);
        assert_eq!(status, "pending");
        assert!(error.unwrap().contains("disk unavailable"));
    }

    #[tokio::test]
    async fn inflight_mirror_blocks_no_edit_and_its_late_answer_cannot_resurrect_a_cleaned_blob() {
        let keys = Keys::generate();
        let started = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let present = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let order = Arc::new(Mutex::new(Vec::new()));
        let bytes = b"inflight bytes";
        use sha2::Digest;
        let hash = format!("{:x}", sha2::Sha256::digest(bytes));
        let upload = {
            let (started, release, present, order, hash) = (started.clone(), release.clone(), present.clone(), order.clone(), hash.clone());
            put(move || {
                let (started, release, present, order, hash) = (started.clone(), release.clone(), present.clone(), order.clone(), hash.clone());
                async move {
                    started.notify_one();
                    release.notified().await;
                    present.store(true, Ordering::SeqCst);
                    order.lock().push("upload");
                    Json(serde_json::json!({"sha256": hash, "size": bytes.len()}))
                }
            })
        };
        let delete = {
            let (present, order) = (present.clone(), order.clone());
            axum::routing::delete(move || {
                let (present, order) = (present.clone(), order.clone());
                async move {
                    present.store(false, Ordering::SeqCst);
                    order.lock().push("delete");
                    axum::http::StatusCode::NO_CONTENT
                }
            })
        };
        let target = format!("http://{}", serve(Router::new().route("/mirror", upload).route("/{hash}", delete)).await);
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        let (_, path) = stored(&outbox, &state, &keys, bytes, "mp4", false).await;
        accepted(&relay, video_event(&keys, 10, "clip", &[("imeta", &hash)])).await;
        outbox.after_upload((axum::http::StatusCode::CREATED, Json(serde_json::json!({
            "sha256": hash, "size": bytes.len(), "url": format!("https://instance.example/{hash}.mp4")
        }))).into_response()).await;
        let job = outbox.due(1).await.unwrap().remove(0);
        let sending = {
            let (outbox, keys) = (outbox.clone(), keys.clone());
            tokio::spawn(async move { work(&outbox, &shared(Some(keys)), &http_client(), &job).await })
        };
        started.notified().await;
        // The edit and its cleanup do not wait for the mirror request.
        let wait = Duration::from_secs(5);
        tokio::time::timeout(wait, accepted(&relay, video_event(&keys, 20, "clip", &[]))).await.expect("edit waited for the mirror");
        let cleanup = outbox.due(100).await.unwrap().into_iter().find(|j| j.kind == "cleanup").unwrap();
        tokio::time::timeout(wait, work(&outbox, &shared(Some(keys.clone())), &http_client(), &cleanup)).await.expect("cleanup waited for the mirror");
        assert!(!path.exists());
        release.notify_one();
        sending.await.unwrap();
        let (status, attempts, _, _) = row(&outbox, "blob", &target);
        assert_eq!((status.as_str(), attempts), ("done", 0), "the late answer leaves the canceled job alone");
        run_due(&outbox, &shared(Some(keys))).await;
        assert!(!present.load(Ordering::SeqCst));
        assert_eq!(*order.lock(), ["upload", "delete"]);
    }

    #[tokio::test]
    async fn a_mirror_target_that_never_answers_does_not_hold_the_media_lifecycle_lock() {
        // Accepts the connection, reads nothing, answers nothing.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target = format!("http://{}", listener.local_addr().unwrap());
        let (outbox, _relay, path) = fixture(Mirror { relays: vec![], blossom: vec![target] });
        outbox.after_upload(descriptor()).await;
        let job = outbox.due(1).await.unwrap().remove(0);
        let sending = {
            let outbox = outbox.clone();
            tokio::spawn(async move { work(&outbox, &shared(Some(Keys::generate())), &http_client(), &job).await })
        };
        // Once the target has the connection, the mirror request is in flight.
        let (_held, _) = tokio::time::timeout(Duration::from_secs(5), listener.accept()).await.unwrap().unwrap();
        // What every upload and relay write takes first.
        let lock = tokio::time::timeout(Duration::from_secs(1), MEDIA_LIFECYCLE.lock()).await;
        assert!(lock.is_ok(), "the mirror request holds the media lifecycle lock");
        drop(lock);
        assert!(!sending.is_finished());
        sending.abort();
        std::fs::remove_file(path).ok();
    }

    #[tokio::test]
    async fn cleanup_and_delete_intents_survive_reopening_the_database() {
        let keys = Keys::generate();
        let (remote_outbox, _remote_relay, remote) = lifecycle_fixture(&keys, Mirror::default()).await;
        stored(&remote_outbox, &remote, &keys, b"durable bytes", "mp4", true).await;
        let target = format!("http://{}", serve(almond::create_app(remote.clone())).await);
        let mirror = Mirror { relays: vec![], blossom: vec![target] };
        let (outbox, relay, state) = lifecycle_fixture(&keys, mirror.clone()).await;
        let (hash, path) = stored(&outbox, &state, &keys, b"durable bytes", "mp4", false).await;
        accepted(&relay, video_event(&keys, 10, "clip", &[("imeta", &hash)])).await;
        accepted(&relay, video_event(&keys, 20, "clip", &[])).await;
        let db = state.storage.root.with_extension("sqlite");
        drop(outbox);
        drop(relay);
        let reopened = Outbox::open(&db, mirror.clone()).unwrap();
        reopened.attach_storage(state.clone());
        run_due(&reopened, &shared(Some(keys.clone()))).await;
        assert!(!path.exists() && state.file_index.get(&hash).await.is_none());
        assert!(remote.file_index.get(&hash).await.is_some());
        drop(reopened);
        let reopened = Outbox::open(&db, mirror).unwrap();
        reopened.attach_storage(state);
        run_due(&reopened, &shared(Some(keys))).await;
        assert!(remote.file_index.get(&hash).await.is_none());
        assert!(reopened.due(100).await.unwrap().is_empty());
    }

    #[test]
    fn old_outbox_schema_migrates_without_losing_delivery_state() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE outbox (
              id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('event','blob')),
              target TEXT NOT NULL, ref_id TEXT NOT NULL, size INTEGER, source_url TEXT,
              status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
              next_attempt_at INTEGER NOT NULL, last_error TEXT, created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL, UNIQUE(kind,target,ref_id));
             INSERT INTO outbox VALUES (7,'blob','https://mirror.example','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               42,'https://instance.example/a','failed',3,99,'offline',1,2);"
        ).unwrap();
        initialize(&conn).unwrap();
        let preserved: (i64, String, u32, String) = conn.query_row(
            "SELECT id,status,attempts,last_error FROM outbox", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)),
        ).unwrap();
        assert_eq!(preserved, (7, "failed".into(), 3, "offline".into()));
        enqueue_cleanup(&conn, &Keys::generate().public_key(), SHA).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM outbox", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn authenticated_republication_cancels_old_cleanup_and_delete_intents_for_the_same_hash() {
        let keys = Keys::generate();
        let target = "http://unreachable.invalid".to_owned();
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        let (hash, path) = stored(&outbox, &state, &keys, b"reused bytes", "mp4", false).await;
        accepted(&relay, video_event(&keys, 10, "clip", &[("imeta", &hash)])).await;
        accepted(&relay, video_event(&keys, 20, "clip", &[])).await;
        let selected = outbox.due(100).await.unwrap().into_iter().find(|j| j.kind == "cleanup").unwrap();
        // Republish before cleanup starts: a previously selected job is now stale.
        stored(&outbox, &state, &keys, b"reused bytes", "mp4", false).await;
        work(&outbox, &shared(None), &http_client(), &selected).await;
        assert!(path.exists());
        enqueue_cleanup(&outbox.0.conn.lock(), &keys.public_key(), &hash).unwrap();
        run_due(&outbox, &shared(None)).await;
        assert!(!path.exists());
        assert!(outbox.due(100).await.unwrap().iter().any(|j| j.kind == "blob-delete"));
        // A successful fresh upload also invalidates old pending mirror deletion.
        stored(&outbox, &state, &keys, b"reused bytes", "mp4", false).await;
        assert!(path.exists());
        assert_eq!(row(&outbox, "blob-delete", &target).0, "done");
        assert!(outbox.due(100).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn indexers_get_only_what_was_announced_and_nothing_in_private_reach() {
        let (outbox, _relay, _path) = fixture(Mirror { relays: vec!["wss://mirror.example".into()], blossom: vec![] });
        let (profile, other) = (EventId::from_byte_array([0; 32]), EventId::from_byte_array([1; 32]));
        enqueue_event(&outbox.0.conn.lock(), &["wss://mirror.example".to_owned()], &other).unwrap();
        outbox.announce(vec!["wss://indexer.example".into()], vec![profile]).await.unwrap();
        let due = |jobs: Vec<Job>| jobs.into_iter().map(|j| (j.target, j.ref_id)).collect::<Vec<_>>();
        let mut public = due(outbox.due(100).await.unwrap());
        public.sort();
        assert_eq!(public, [
            ("wss://indexer.example".to_owned(), profile.to_hex()),
            ("wss://mirror.example".to_owned(), other.to_hex()),
        ]);
        // Private reach: the mirror keeps going, the indexers' jobs wait.
        outbox.announce(vec![], vec![]).await.unwrap();
        assert_eq!(due(outbox.due(100).await.unwrap()), [("wss://mirror.example".to_owned(), other.to_hex())]);
        assert_eq!(row(&outbox, "event", "wss://indexer.example").0, "pending");
    }

    #[tokio::test]
    async fn s2_streams_every_output_to_real_blossom_and_accepts_existing_copies() {
        let keys = Keys::generate();
        let (_remote_outbox, _remote_relay, remote) = lifecycle_fixture(&keys, Mirror::default()).await;
        let target = format!("http://{}", serve(almond::create_app(remote.clone())).await);
        let (outbox, _relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        outbox.set_origin_public(false);
        let large = vec![7u8; 3 * 1024 * 1024];
        for (bytes, ext) in [(large.as_slice(), "mp4"), (b"thumbnail".as_slice(), "jpg"), (b"WEBVTT\ncaptions".as_slice(), "vtt")] {
            let (hash, _) = stored(&outbox, &state, &keys, bytes, ext, false).await;
            outbox.queue_blob(hash.clone(), bytes.len() as u64, format!("https://unreachable.local/{hash}.{ext}")).await.unwrap();
            run_due(&outbox, &shared(Some(keys.clone()))).await;
            assert_eq!(outbox.blob_copies(hash.clone()).await.unwrap(), [target.clone()]);
            let res = http_client().get(format!("{target}/{hash}")).send().await.unwrap();
            assert_eq!(res.bytes().await.unwrap().as_ref(), bytes);
            // Simulate the successful request's response being lost before durable recording.
            outbox.db({
                let hash = hash.clone();
                move |conn| conn.execute("UPDATE outbox SET status='pending' WHERE kind='blob' AND ref_id=?", [hash]).map(|_| ())
            }).await.unwrap();
            run_due(&outbox, &shared(Some(keys.clone()))).await;
            assert_eq!(outbox.blob_copies(hash.clone()).await.unwrap(), [target.clone()]);
            outbox.queue_blob(hash.clone(), bytes.len() as u64, "ignored replay".into()).await.unwrap();
            assert_eq!(outbox.blob_copies(hash).await.unwrap(), [target.clone()]);
        }
    }

    #[tokio::test]
    async fn s2_upload_checks_token_headers_descriptors_and_retries_interruption() {
        let keys = Keys::generate();
        let seen = Arc::new(AtomicUsize::new(0));
        let signer = keys.public_key();
        let target = {
            let seen = seen.clone();
            format!("http://{}", serve(Router::new().route("/upload", put(move |headers: HeaderMap, body: Body| {
                let seen = seen.clone();
                async move {
                    let token = headers[header::AUTHORIZATION].to_str().unwrap().strip_prefix("Nostr ").unwrap();
                    let auth = nostr::prelude::Event::from_json(base64::engine::general_purpose::STANDARD.decode(token).unwrap()).unwrap();
                    auth.verify().unwrap();
                    assert_eq!((auth.pubkey, auth.kind), (signer, Kind::Custom(24242)));
                    let hash = headers["x-sha-256"].to_str().unwrap().to_owned();
                    assert!(auth.tags.iter().any(|t| t.as_slice() == ["t", "upload"]));
                    assert!(auth.tags.iter().any(|t| t.as_slice() == ["x", hash.as_str()]));
                    assert_eq!(headers[header::CONTENT_TYPE], "video/mp4");
                    assert_eq!(headers[header::CONTENT_LENGTH], "12");
                    let bytes = axum::body::to_bytes(body, 1024).await.unwrap();
                    assert_eq!(bytes.as_ref(), b"upload bytes");
                    match seen.fetch_add(1, Ordering::SeqCst) {
                        0 => Response::new(Body::from_stream(futures_util::stream::once(async {
                            Err::<axum::body::Bytes, _>(std::io::Error::other("connection lost after upload"))
                        }))),
                        1 => Json(serde_json::json!({"sha256":"wrong-hash","size":999})).into_response(),
                        _ => Json(serde_json::json!({"sha256":hash,"size":12})).into_response(),
                    }
                }
            }))).await)
        };
        let (outbox, _relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        outbox.set_origin_public(false);
        let (hash, _) = stored(&outbox, &state, &keys, b"upload bytes", "mp4", false).await;
        outbox.queue_blob(hash.clone(), 12, "https://private.local/video".into()).await.unwrap();
        run_due(&outbox, &shared(None)).await;
        assert_eq!(outbox.blob_problems(hash.clone()).await.unwrap(), Some(format!("{target}: {NEEDS_KEY}")));
        assert_eq!(seen.load(Ordering::SeqCst), 0);
        outbox.retry(None).await.unwrap();
        run_due(&outbox, &shared(Some(keys.clone()))).await;
        let first = row(&outbox, "blob", &target);
        assert_eq!((first.0.as_str(), first.1), ("pending", 1));
        assert!(first.2 > now());
        outbox.0.conn.lock().execute("UPDATE outbox SET next_attempt_at=0", []).unwrap();
        run_due(&outbox, &shared(Some(keys.clone()))).await;
        let error = outbox.blob_problems(hash.clone()).await.unwrap().unwrap();
        assert!(error.contains("wrong-hash") && error.contains("999") && error.contains(&hash) && error.contains("12"), "{error}");
        assert!(outbox.blob_copies(hash.clone()).await.unwrap().is_empty());
        outbox.0.conn.lock().execute("UPDATE outbox SET next_attempt_at=0", []).unwrap();
        run_due(&outbox, &shared(Some(keys))).await;
        assert_eq!(outbox.blob_copies(hash).await.unwrap(), [target]);
        assert_eq!(seen.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn manifest_waits_for_confirmed_blobs_across_restart_and_can_be_canceled() {
        let keys = Keys::generate();
        let seen = Arc::new(AtomicUsize::new(0));
        let target = fake_relay(true, "", seen.clone()).await;
        let forbidden_seen = Arc::new(AtomicUsize::new(0));
        let forbidden = fake_relay(true, "", forbidden_seen.clone()).await;
        let remote = "https://blossom.example".to_owned();
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror {
            relays: vec![target.clone(), forbidden.clone()], blossom: vec![remote.clone()],
        }).await;
        let event = EventBuilder::new(Kind::Custom(15128), "").finalize(&keys).unwrap();
        outbox.require_blobs(event.id, vec![SHA.into()]).await.unwrap();
        outbox.queue_blob(SHA.into(), 42, "https://instance.example/file".into()).await.unwrap();
        accepted(&relay, event.clone()).await;
        assert!(!outbox.event_delivery(event.id).await.unwrap(), "registered event is held until explicit delivery");
        outbox.deliver(vec![target.clone()], vec![event.id]).await.unwrap();
        // Pending and failed blob jobs both keep the manifest behind the barrier.
        run_due(&outbox, &shared(None)).await;
        assert_eq!(seen.load(Ordering::SeqCst), 0);
        assert!(!outbox.event_delivery(event.id).await.unwrap());
        let db = state.storage.root.with_extension("sqlite");
        drop(outbox);
        drop(relay);
        let reopened = Outbox::open(&db, Mirror { relays: vec![target.clone(), forbidden], blossom: vec![remote.clone()] }).unwrap();
        reopened.require_blobs(event.id, vec![SHA.into()]).await.unwrap();
        run_due(&reopened, &shared(None)).await;
        assert_eq!(seen.load(Ordering::SeqCst), 0);
        reopened.db(|conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='blob'", []).map(|_| ())).await.unwrap();
        run_due(&reopened, &shared(None)).await;
        assert_eq!(seen.load(Ordering::SeqCst), 1);
        assert!(reopened.event_delivery(event.id).await.unwrap());
        assert_eq!(forbidden_seen.load(Ordering::SeqCst), 0, "nsite never leaks to an unlisted mirror relay");
        // Explicit delivery remains eligible after a relay leaves configuration.
        let historical = Outbox::open(&db, Mirror::default()).unwrap();
        let other = EventBuilder::new(Kind::Custom(15128), "")
            .custom_created_at(Timestamp::from(Timestamp::now().as_secs() + 1)).finalize(&keys).unwrap();
        historical.db({
            let other = other.clone();
            move |conn| conn.execute(
                "INSERT INTO event (event_hash,created_at,author,kind,content) VALUES (?,?,?,?,?)",
                params![other.id.as_bytes().as_slice(), other.created_at.as_secs() as i64, other.pubkey.as_bytes().as_slice(), 15128, other.as_json()],
            ).map(|_| ())
        }).await.unwrap();
        historical.deliver(vec![target.clone()], vec![other.id]).await.unwrap();
        historical.cancel_event(other.id).await.unwrap();
        run_due(&historical, &shared(None)).await;
        assert_eq!(seen.load(Ordering::SeqCst), 1, "disable prevents queued manifest delivery");
        assert!(!historical.event_delivery(other.id).await.unwrap());
        let deletion = EventBuilder::new(Kind::EventDeletion, "").finalize(&keys).unwrap();
        historical.db({
            let deletion = deletion.clone();
            move |conn| conn.execute(
                "INSERT INTO event (event_hash,created_at,author,kind,content) VALUES (?,?,?,?,?)",
                params![deletion.id.as_bytes().as_slice(), deletion.created_at.as_secs() as i64, deletion.pubkey.as_bytes().as_slice(), 5, deletion.as_json()],
            ).map(|_| ())
        }).await.unwrap();
        historical.deliver(vec![target], vec![deletion.id]).await.unwrap();
        run_due(&historical, &shared(None)).await;
        assert_eq!(seen.load(Ordering::SeqCst), 2);
        assert!(historical.event_delivery(deletion.id).await.unwrap());
    }

    #[tokio::test]
    async fn explicit_nsite_deletion_spares_retained_media_and_reaches_removed_targets() {
        let keys = Keys::generate();
        let (remote_outbox, _remote_relay, remote) = lifecycle_fixture(&keys, Mirror::default()).await;
        let target = format!("http://{}", serve(almond::create_app(remote.clone())).await);
        let (outbox, relay, state) = lifecycle_fixture(&keys, Mirror::default()).await;
        let mut assets = Vec::new();
        for bytes in [
            b"nsite asset".as_slice(), b"pending profile image".as_slice(), b"video thumb".as_slice(),
            b"scheduled thumb".as_slice(), b"signed profile image".as_slice(), b"note attachment".as_slice(), b"obsolete asset".as_slice(),
        ] {
            let (hash, path) = stored(&outbox, &state, &keys, bytes, "jpg", false).await;
            stored(&remote_outbox, &remote, &keys, bytes, "jpg", true).await;
            assets.push((hash, path));
        }
        outbox.retain("nsite", vec![assets[0].0.clone()]).await.unwrap();
        outbox.retain("profile", vec![assets[1].0.clone()]).await.unwrap();
        accepted(&relay, video_event(&keys, 10, "clip", &[("thumb", &assets[2].0)])).await;
        let due = (Timestamp::now().as_secs() + 3600).to_string();
        let scheduled_url = format!("https://instance.example/{}.jpg", assets[3].0);
        let scheduled = EventBuilder::new(Kind::Custom(34235), "").tags([
            Tag::parse(["d", "scheduled"]).unwrap(), Tag::parse(["published_at", due.as_str()]).unwrap(),
            Tag::parse(["imeta", format!("url {scheduled_url}").as_str()]).unwrap(),
        ]).finalize(&keys).unwrap();
        assert!(crate::schedule::submit(&outbox, &[keys.public_key()], &[keys.public_key()], scheduled.as_json().as_bytes()).await.is_ok());
        let profile = EventBuilder::new(Kind::Metadata, serde_json::json!({
            "picture": format!("https://instance.example/{}.jpg", assets[4].0),
        }).to_string()).finalize(&keys).unwrap();
        accepted(&relay, profile).await;
        accepted(&relay, EventBuilder::new(Kind::TextNote, "attachment")
            .tags([Tag::parse(["x", assets[5].0.as_str()]).unwrap()]).finalize(&keys).unwrap()).await;
        for (hash, _) in &assets {
            outbox.delete_blobs(hash.clone(), keys.public_key().to_hex(), vec![target.clone()]).await.unwrap();
        }
        let db = state.storage.root.with_extension("sqlite");
        drop(outbox);
        let reopened = Outbox::open(&db, Mirror::default()).unwrap();
        reopened.attach_storage(state.clone());
        run_due(&reopened, &shared(Some(keys.clone()))).await;
        run_due(&reopened, &shared(Some(keys.clone()))).await;
        for (hash, path) in &assets[..6] {
            assert!(path.exists(), "live reference keeps local {hash}");
            assert!(remote.file_index.get(hash).await.is_some(), "live reference keeps historical remote {hash}");
        }
        assert!(!assets[6].1.exists());
        assert!(remote.file_index.get(&assets[6].0).await.is_none(), "explicit DELETE reaches removed mirror");
        // Clearing only nsite retention does not release profile/video media.
        reopened.retain("nsite", vec![]).await.unwrap();
        reopened.delete_blobs(assets[0].0.clone(), keys.public_key().to_hex(), vec![target]).await.unwrap();
        run_due(&reopened, &shared(Some(keys.clone()))).await;
        run_due(&reopened, &shared(Some(keys))).await;
        assert!(!assets[0].1.exists() && remote.file_index.get(&assets[0].0).await.is_none());
        assert!(assets[1..6].iter().all(|(_, path)| path.exists()));
    }

    #[tokio::test]
    async fn s2_upload_streams_chunks_without_holding_the_lifecycle_lock() {
        use sha2::{Digest, Sha256};
        let keys = Keys::generate();
        let bytes = vec![11u8; 3 * 1024 * 1024];
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let size = bytes.len() as u64;
        let started = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let target = {
            let (started, release, expected) = (started.clone(), release.clone(), hash.clone());
            format!("http://{}", serve(Router::new().route("/upload", put(move |body: Body| {
                let (started, release, expected) = (started.clone(), release.clone(), expected.clone());
                async move {
                    let mut stream = body.into_data_stream();
                    let first = stream.next().await.unwrap().unwrap();
                    assert!(!first.is_empty() && first.len() < size as usize);
                    let mut digest = Sha256::new();
                    digest.update(&first);
                    let mut received = first.len() as u64;
                    started.notify_one();
                    release.notified().await;
                    while let Some(chunk) = stream.next().await {
                        let chunk = chunk.unwrap();
                        received += chunk.len() as u64;
                        digest.update(&chunk);
                    }
                    assert_eq!(received, size);
                    assert_eq!(format!("{:x}", digest.finalize()), expected);
                    Json(serde_json::json!({"sha256":expected,"size":size}))
                }
            }))).await)
        };
        let (outbox, _relay, state) = lifecycle_fixture(&keys, Mirror { relays: vec![], blossom: vec![target.clone()] }).await;
        outbox.set_origin_public(false);
        stored(&outbox, &state, &keys, &bytes, "mp4", false).await;
        outbox.queue_blob(hash.clone(), size, "https://private.local/video".into()).await.unwrap();
        let sending = {
            let outbox = outbox.clone();
            tokio::spawn(async move { run_due(&outbox, &shared(Some(keys))).await })
        };
        tokio::time::timeout(Duration::from_secs(5), started.notified()).await.unwrap();
        let guard = tokio::time::timeout(Duration::from_secs(1), MEDIA_LIFECYCLE.lock()).await.expect("streaming upload holds lifecycle lock");
        drop(guard);
        assert!(!sending.is_finished());
        release.notify_one();
        sending.await.unwrap();
        assert_eq!(outbox.blob_copies(hash).await.unwrap(), [target]);
    }
}
