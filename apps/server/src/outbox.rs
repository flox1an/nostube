//! The outbox (ADR 0009, spec "Externe Synchronisierung"): the instance's own events and blobs
//! are copied to the relays and Blossom servers the owner chose in `[mirror]`. A job is one item
//! for one target, kept in `relay.sqlite` until it is delivered or has failed for good, so
//! restarts and offline periods lose nothing. Event jobs are written in the same transaction as
//! the event (`relay::persist`); blob jobs after Blossom answered an upload.
//!
//! Delivery is idempotent on the target side (a relay answers `duplicate`, a Blossom server
//! keeps one copy per hash), so a job that is interrupted is simply delivered again.

use std::{collections::HashSet, path::Path, sync::Arc, time::Duration};

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
  kind TEXT NOT NULL CHECK (kind IN ('event', 'blob')),
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
/// The reason a blob job fails without the managed key (ADR 0007): nothing else may sign.
pub const NEEDS_KEY: &str = "mirroring blobs needs the managed signing key";
/// Recent problems shown in the studio.
const PROBLEMS: i64 = 50;

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
}

impl Outbox {
    pub fn open(db: &Path, mirror: Mirror) -> rusqlite::Result<Outbox> {
        let conn = crate::relay::connect(db)?;
        conn.execute_batch(SCHEMA)?;
        Ok(Outbox(Arc::new(Inner { conn: Mutex::new(conn), mirror })))
    }

    async fn db<T: Send + 'static>(
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
            let targets = self.0.mirror.blossom.clone();
            let added = self
                .db(move |conn| {
                    let now = now();
                    let mut add = conn.prepare_cached(
                        "INSERT OR IGNORE INTO outbox (kind, target, ref_id, size, source_url, next_attempt_at, created_at, updated_at)
                         VALUES ('blob', ?1, ?2, ?3, ?4, ?5, ?5, ?5)",
                    )?;
                    for target in &targets {
                        add.execute(params![target, d.sha256, d.size as i64, d.url, now])?;
                    }
                    Ok(())
                })
                .await;
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

    /// Up to `limit` pending jobs that are due, for configured targets only: a target removed
    /// from the config keeps its rows, but nothing is sent there.
    async fn due(&self, limit: usize) -> Result<Vec<Job>, String> {
        let targets: Vec<String> = self.0.mirror.relays.iter().chain(&self.0.mirror.blossom).cloned().collect();
        self.db(move |conn| {
            let marks = vec!["?"; targets.len()].join(",");
            let mut stmt = conn.prepare(&format!(
                "SELECT id, kind, target, ref_id, size, source_url, attempts FROM outbox
                 WHERE status = 'pending' AND next_attempt_at <= ? AND target IN ({marks})
                 ORDER BY next_attempt_at, id LIMIT {limit}"
            ))?;
            let args = std::iter::once(rusqlite::types::Value::from(now()))
                .chain(targets.into_iter().map(rusqlite::types::Value::from));
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
                conn.execute(
                    "UPDATE outbox SET status = ?1, attempts = ?2, next_attempt_at = ?3, last_error = ?4, updated_at = ?5 WHERE id = ?6",
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

/// Starts the worker; `None` (and no background work at all) without mirror targets. Abort the
/// handle to stop: running deliveries are dropped and stay `pending`, the next start sends them
/// again.
pub fn spawn(outbox: Outbox, keys: crate::signer::Shared) -> Option<tokio::task::JoinHandle<()>> {
    if outbox.0.mirror.relays.is_empty() && outbox.0.mirror.blossom.is_empty() {
        return None;
    }
    tracing::info!(
        "outbox: mirroring to {} relay(s) and {} Blossom server(s)",
        outbox.0.mirror.relays.len(),
        outbox.0.mirror.blossom.len()
    );
    Some(tokio::spawn(async move {
        let http = http_client();
        let mut running = JoinSet::new();
        let mut busy = HashSet::new();
        let mut tick = tokio::time::interval(POLL);
        loop {
            tokio::select! {
                Some(Ok(id)) = running.join_next() => { busy.remove(&id); }
                _ = tick.tick() => {}
            }
            let free = CONCURRENCY - running.len();
            if free == 0 {
                continue;
            }
            let jobs = match outbox.due(free + busy.len()).await {
                Ok(j) => j,
                Err(e) => {
                    tracing::warn!("outbox: {e}");
                    continue;
                }
            };
            let jobs: Vec<Job> = jobs.into_iter().filter(|j| !busy.contains(&j.id)).take(free).collect();
            for job in jobs {
                busy.insert(job.id);
                let (outbox, keys, http) = (outbox.clone(), keys.clone(), http.clone());
                running.spawn(async move {
                    work(&outbox, &keys, &http, &job).await;
                    job.id
                });
            }
        }
    }))
}

/// Delivers one job and records the outcome.
async fn work(outbox: &Outbox, keys: &crate::signer::Shared, http: &reqwest::Client, job: &Job) {
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
        _ => match mirror_key(keys) {
            Err(e) => Outcome::Fail(e),
            Ok(k) => {
                let (size, url) = (job.size.unwrap_or_default() as u64, job.source_url.as_deref().unwrap_or_default());
                match mirror(http, &k, &job.target, &job.ref_id, size, url).await {
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

/// BUD-04 `PUT /mirror` of the blob at `url` (its public URL here), authorized with a BUD-11
/// upload token (kind 24242, `t=upload`, `x=<sha256>`) signed by the managed key. Done only when
/// the target's descriptor confirms the hash and the size.
async fn mirror(http: &reqwest::Client, keys: &Keys, target: &str, sha256: &str, size: u64, url: &str) -> Result<(), String> {
    let tag = |t: &[&str]| Tag::parse(t.iter().copied()).map_err(|e| format!("cannot build the auth token: {e}"));
    let expiration = (Timestamp::now().as_secs() + 600).to_string();
    let auth = EventBuilder::new(Kind::Custom(24242), "Mirror blob")
        .tags([tag(&["t", "upload"])?, tag(&["x", sha256])?, tag(&["expiration", &expiration])?])
        .finalize(keys)
        .map_err(|e| format!("cannot sign the auth token: {e}"))?;
    let token = base64::engine::general_purpose::STANDARD.encode(auth.as_json());
    let res = http
        .put(format!("{}/mirror", target.trim_end_matches('/')))
        .header(header::AUTHORIZATION, format!("Nostr {token}"))
        .json(&serde_json::json!({ "url": url }))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = res.status();
    if !status.is_success() {
        // BUD-01: the reason is in `X-Reason`; fall back to the body.
        let reason = res.headers().get("x-reason").and_then(|v| v.to_str().ok()).map(str::to_owned);
        let reason = match reason {
            Some(r) => r,
            None => res.text().await.unwrap_or_default(),
        };
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
}
