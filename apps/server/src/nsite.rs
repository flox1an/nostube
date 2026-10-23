//! Managed root nsites: reproducible embedded files, durable publication and cleanup intents.
use std::{collections::{BTreeMap, BTreeSet}, path::{Path, PathBuf}, sync::Arc, time::{Duration, SystemTime, UNIX_EPOCH}};
use nostr::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use crate::{branding::Branding, outbox::Outbox, relay::Relay, signer};

const DEBOUNCE_MS: u64 = 750;

#[derive(Clone)]
pub struct Nsite {
    path: PathBuf,
    state: Arc<tokio::sync::Mutex<State>>,
}

#[derive(Default, Serialize, Deserialize)]
struct State {
    enabled: bool,
    dirty: Option<u64>,
    current: Option<Version>,
    pending: Option<Version>,
    /// Includes attempted uploads: a timed-out upload may already exist on its target.
    ledger: BTreeMap<String, Vec<String>>,
    relays: BTreeSet<String>,
    retained: bool,
    deleting: bool,
    deletion: Option<Event>,
    last_timestamp: u64,
    error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Version {
    aggregate: String,
    url: String,
    hashes: Vec<String>,
    tags: Vec<Vec<String>>,
    relays: Vec<String>,
    event: Option<Event>,
}

pub struct File {
    pub path: String,
    pub bytes: axum::body::Bytes,
    pub mime: String,
}

fn millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}
fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn enabled(public: &Value) -> bool { public["siteHosting"] == "nsite" && public["reach"] == "public" }

pub fn url(public: &Value, key: PublicKey) -> Result<String, String> {
    let domain = public["nsite"]["domain"].as_str().unwrap_or_default();
    if !domain.is_empty() { return Ok(format!("https://{domain}")); }
    let npub = key.to_bech32().map_err(|e| e.to_string())?;
    let gateway = public["nsite"]["gateway"].as_str().unwrap_or("nsite.lol");
    Ok(format!("https://{npub}.{gateway}"))
}

/// Only the creator site's routes redirect. In particular `/embed.html` and root relay traffic stay.
pub fn redirect(public: &[u8], key: Option<PublicKey>, path: &str, query: Option<&str>) -> Option<String> {
    let public: Value = serde_json::from_slice(public).ok()?;
    if !enabled(&public) || !site_route(path) { return None; }
    let origin = url(&public, key?).ok()?;
    Some(format!("{origin}{path}{}", query.map(|q| format!("?{q}")).unwrap_or_default()))
}
fn site_route(path: &str) -> bool {
    matches!(path, "/" | "/search" | "/about" | "/imprint" | "/privacy")
        || path.strip_prefix("/v/").is_some_and(|s| !s.is_empty())
        || path.strip_prefix("/t/").is_some_and(|s| !s.is_empty())
}

fn public_urls(value: &Value) -> Vec<String> {
    value.as_array().into_iter().flatten().filter_map(Value::as_str)
        .filter(|url| crate::config::is_public_url(url)).map(str::to_owned).collect()
}
fn unique(values: impl IntoIterator<Item=String>) -> Vec<String> {
    let mut result = Vec::new();
    for value in values { if !result.contains(&value) { result.push(value); } }
    result
}
fn servers(public: &Value) -> Vec<String> {
    let own = (public["originIsPublic"] == true).then(|| public["origin"].as_str().unwrap_or_default().to_owned());
    unique(own.into_iter().chain(public_urls(&public["mirror"]["blossom"])))
}
fn targets(public: &Value) -> Vec<String> {
    let own = (public["originIsPublic"] == true).then(|| public["origin"].as_str().unwrap_or_default().replacen("https://", "wss://", 1));
    unique(own.into_iter().chain(public_urls(&public["mirror"]["relays"])).chain(public_urls(&public["profileRelays"])))
}

/// The revision identifies baked settings, not the counter of unrelated Studio saves.
fn baked_config(mut public: Value, origin: &str) -> Value {
    let instance = public["origin"].as_str().unwrap_or_default().replacen("https://", "wss://", 1);
    let origin_public = public["originIsPublic"] == true;
    for key in ["videoSources", "interactionRelays", "profileRelays"] {
        public[key] = serde_json::json!(unique(public_urls(&public[key]).into_iter()
            .chain(public_urls(&public["mirror"]["relays"]))
            .filter(|relay| origin_public || relay.trim_end_matches('/') != instance.trim_end_matches('/'))));
    }
    public["origin"] = origin.into();
    public.as_object_mut().expect("public config object").remove("revision");
    let digest = Sha256::digest(serde_json::to_vec(&public).expect("JSON"));
    let revision = u64::from_be_bytes(digest[..8].try_into().expect("8 bytes")) & ((1u64 << 53) - 1);
    public["revision"] = revision.into();
    public
}
fn inline(shell: &str, public: &Value) -> Result<String, String> {
    let json = serde_json::to_string(public).map_err(|e| e.to_string())?
        .replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028").replace('\u{2029}', "\\u2029");
    let script = format!("<script type=\"application/json\" id=\"nostube-config\">{json}</script>");
    if !shell.contains("</head>") { return Err("embedded HTML has no head".into()); }
    Ok(shell.replacen("</head>", &format!("{script}</head>"), 1))
}

pub async fn files(relay: &Relay, branding: &Branding, public: &Value, origin: &str) -> Result<Vec<File>, String> {
    let baked = baked_config(public.clone(), origin);
    let mut files = BTreeMap::new();
    for name in crate::Web::iter() {
        let name = name.as_ref();
        if name == "studio" || name.starts_with("studio/") || name == "index.html" || name == "manifest.webmanifest" { continue; }
        let asset = crate::Web::get(name).ok_or_else(|| format!("embedded file missing: {name}"))?;
        let bytes = if name == "embed.html" {
            axum::body::Bytes::from(inline(std::str::from_utf8(&asset.data).map_err(|e| e.to_string())?, &baked)?)
        } else {
            match asset.data {
                std::borrow::Cow::Borrowed(bytes) => axum::body::Bytes::from_static(bytes),
                std::borrow::Cow::Owned(bytes) => axum::body::Bytes::from(bytes),
            }
        };
        files.insert(format!("/{name}"), File { path: format!("/{name}"), bytes, mime: mime_guess::from_path(name).first_or_octet_stream().to_string() });
    }
    let shell = crate::Web::get("index.html").ok_or("embedded index.html missing")?;
    let shell = std::str::from_utf8(&shell.data).map_err(|e| e.to_string())?;
    let shell = crate::seo::shell(relay, &serde_json::to_vec(&baked).map_err(|e| e.to_string())?, "/", shell).await;
    let shell = axum::body::Bytes::from(shell);
    for path in ["/index.html", "/404.html"] {
        files.insert(path.into(), File { path: path.into(), bytes: shell.clone(), mime: "text/html; charset=utf-8".into() });
    }
    files.insert("/manifest.webmanifest".into(), File { path: "/manifest.webmanifest".into(), bytes: branding.manifest(), mime: "application/manifest+json".into() });
    for (path, mime, bytes) in branding.files() {
        files.insert(path.into(), File { path: path.into(), bytes, mime: mime.into() });
    }
    for required in ["/embed.html", "/sw.js", "/registerSW.js"] {
        if !files.contains_key(required) { return Err(format!("embedded site build is missing {required}")); }
    }
    Ok(files.into_values().collect())
}

/// NIP-5A sorts whole hash-first lines, NOT paths.
fn aggregate(paths: &[(String, String)]) -> String {
    let mut lines: Vec<_> = paths.iter().map(|(path, hash)| format!("{hash} {path}\n")).collect();
    lines.sort();
    let mut digest = Sha256::new();
    for line in lines { digest.update(line.as_bytes()); }
    format!("{:x}", digest.finalize())
}
fn manifest_tags(paths: &[(String, String)], public: &Value, aggregate: &str) -> Vec<Vec<String>> {
    paths.iter().map(|(path, hash)| vec!["path".into(), path.clone(), hash.clone()])
        .chain(servers(public).into_iter().map(|server| vec!["server".into(), server]))
        .chain([
            vec!["x".into(), aggregate.into(), "aggregate".into()],
            vec!["title".into(), public["title"].as_str().unwrap_or_default().into()],
            vec!["description".into(), public["site"]["tagline"].as_str().unwrap_or_default().into()],
        ]).collect()
}
fn newer(last: u64, now: u64) -> u64 { last.saturating_add(1).max(now) }

/// One outbox job as Studio shows it: `done`, `pending` (with the last retry error) or `failed`.
fn job_state(row: Option<(String, Option<String>)>) -> (&'static str, Option<String>) {
    match row {
        Some((status, None)) if status == "done" => ("done", None),
        Some((status, error)) if status == "failed" => ("failed", error),
        Some((_, error)) => ("pending", error),
        None => ("pending", None),
    }
}

/// Per-target delivery of the shown version: the manifest (or deletion) per relay and its files
/// per manifest `server`. The instance's own Blossom holds every file locally.
async fn deliveries(outbox: &Outbox, event: Option<EventId>, relays: Vec<String>, servers: Vec<String>, hashes: Vec<String>, own: Option<String>) -> Result<(Value, Value), String> {
    outbox.db(move |conn| {
        use rusqlite::OptionalExtension;
        let mut relay_rows = Vec::new();
        for target in relays {
            let row = match event {
                Some(id) => conn.query_row("SELECT status,last_error FROM outbox WHERE kind='event' AND ref_id=? AND target=?", [id.to_hex(), target.clone()], |r| Ok((r.get(0)?, r.get(1)?))).optional()?,
                None => None,
            };
            let (status, error) = job_state(row);
            relay_rows.push(serde_json::json!({ "target": target, "status": status, "error": error }));
        }
        let mut blob = conn.prepare("SELECT status,last_error FROM outbox WHERE kind='blob' AND ref_id=? AND target=?")?;
        let mut server_rows = Vec::new();
        for target in servers {
            let local = own.as_deref().is_some_and(|own| own.trim_end_matches('/') == target.trim_end_matches('/'));
            let (mut done, mut failed, mut error) = (0, false, None);
            for hash in &hashes {
                let (status, e) = if local { ("done", None) } else { job_state(blob.query_row([hash, &target], |r| Ok((r.get(0)?, r.get(1)?))).optional()?) };
                if status == "done" { done += 1; }
                failed |= status == "failed";
                if error.is_none() { error = e; }
            }
            let status = if failed { "failed" } else if done < hashes.len() { "pending" } else { "done" };
            server_rows.push(serde_json::json!({ "target": target, "status": status, "done": done, "total": hashes.len(), "error": error }));
        }
        Ok((Value::Array(relay_rows), Value::Array(server_rows)))
    }).await
}

impl Nsite {
    pub fn open(data: &Path) -> Result<Self, String> {
        let path = data.join("relay.sqlite");
        let conn = crate::relay::connect(&path).map_err(|e| e.to_string())?;
        conn.execute_batch("CREATE TABLE IF NOT EXISTS nsite_state (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL)").map_err(|e| e.to_string())?;
        use rusqlite::OptionalExtension;
        let json: Option<String> = conn.query_row("SELECT json FROM nsite_state WHERE id=1", [], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
        let state = json.map(|s| serde_json::from_str(&s)).transpose().map_err(|e| format!("nsite ledger: {e}"))?.unwrap_or_default();
        Ok(Self { path, state: Arc::new(tokio::sync::Mutex::new(state)) })
    }
    fn save(&self, state: &State) -> Result<(), String> {
        let conn = crate::relay::connect(&self.path).map_err(|e| e.to_string())?;
        conn.execute("INSERT INTO nsite_state(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json", [serde_json::to_string(state).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub async fn request(&self, public: &[u8]) -> Result<(), String> {
        let public: Value = serde_json::from_slice(public).map_err(|e| e.to_string())?;
        let mut state = self.state.lock().await;
        state.enabled = enabled(&public);
        state.dirty = state.enabled.then(millis);
        state.error = None;
        self.save(&state)
    }
    pub async fn disable(&self, delete: bool, outbox: &Outbox) -> Result<(), String> {
        let mut state = self.state.lock().await;
        state.enabled = false;
        state.dirty = None;
        // Persist intent first: after a crash reconciliation still cancels the pending manifest.
        state.deleting = delete;
        state.retained = !delete && (!state.ledger.is_empty() || state.current.is_some());
        self.save(&state)?;
        if let Some(event) = state.pending.as_ref().and_then(|v| v.event.as_ref()) { outbox.cancel_event(event.id).await?; }
        state.pending = None;
        self.save(&state)
    }
    pub async fn status(&self, public: &[u8], keys: &signer::Shared, outbox: &Outbox) -> Result<Value, String> {
        let public: Value = serde_json::from_slice(public).map_err(|e| e.to_string())?;
        let state = self.state.lock().await;
        let (key, signer_error) = match keys.lock().clone() {
            Some(Ok(key)) => (Some(key), None),
            Some(Err(error)) => (None, Some(error)),
            None => (None, None),
        };
        let active = enabled(&public);
        let mut error = state.error.clone();
        if active && key.is_none() { error = signer_error.or_else(|| Some("nsite needs the managed signing key".into())); }
        if state.pending.is_some() {
            for hash in &state.pending.as_ref().expect("pending").hashes {
                if let Some(problem) = outbox.blob_problems(hash.clone()).await? { error = Some(problem); break; }
            }
        }
        let event = state.pending.as_ref().and_then(|v| v.event.as_ref()).or(state.deletion.as_ref()).map(|e| e.id.to_hex());
        // A job the outbox still retries (e.g. a relay's transient 503) is pending, not failed;
        // its last error stays visible. Only exhausted jobs (`failed`) fail the publication.
        let mut retrying = None;
        if let Some(event) = event {
            let failure: Option<(String, String)> = outbox.db(move |conn| {
                use rusqlite::OptionalExtension;
                conn.query_row("SELECT status,last_error FROM outbox WHERE kind='event' AND ref_id=? AND status!='done' AND last_error IS NOT NULL ORDER BY status='failed' DESC, updated_at DESC LIMIT 1", [event], |r| Ok((r.get(0)?, r.get(1)?))).optional()
            }).await?;
            match failure {
                Some((status, failure)) if status == "failed" => error = Some(failure),
                Some((_, failure)) => retrying = Some(failure),
                None => {}
            }
        }
        let status = if !active { "disabled" } else if error.is_some() { "failed" }
            else if retrying.is_some() || state.dirty.is_some() || state.pending.is_some() || state.current.is_none() { "pending" } else { "published" };
        let error = error.or(retrying);
        let shown = if let Some(deletion) = state.deletion.as_ref() {
            Some((Some(deletion.id), state.relays.iter().cloned().collect(), vec![], vec![]))
        } else if active {
            state.pending.as_ref().or(state.current.as_ref()).map(|v| (
                v.event.as_ref().map(|e| e.id), v.relays.clone(),
                v.tags.iter().filter(|t| t.first().is_some_and(|k| k == "server")).filter_map(|t| t.get(1).cloned()).collect(),
                v.hashes.clone(),
            ))
        } else { None };
        let (relays, servers) = match shown {
            Some((event, relays, servers, hashes)) => {
                let own = (public["originIsPublic"] == true).then(|| public["origin"].as_str().unwrap_or_default().to_owned());
                deliveries(outbox, event, relays, servers, hashes, own).await?
            }
            None => (Value::Array(vec![]), Value::Array(vec![])),
        };
        Ok(serde_json::json!({
            "url": key.and_then(|key| url(&public, key.public_key()).ok()),
            "aggregate": state.current.as_ref().map(|v| &v.aggregate),
            "publishedAt": state.current.as_ref().and_then(|v| v.event.as_ref()).map(|e| e.created_at.as_secs()),
            "status": status, "error": error, "retained": state.retained,
            "relays": relays, "servers": servers,
        }))
    }
    async fn cleanup(&self, state: &mut State, keep: Vec<String>, owner: &str, outbox: &Outbox) -> Result<(), String> {
        // Reference protection is shared with video/schedule/profile cleanup in the outbox.
        outbox.retain("nsite", keep.clone()).await?;
        let obsolete: Vec<_> = state.ledger.keys().filter(|hash| !keep.contains(hash)).cloned().collect();
        for hash in obsolete {
            let servers = state.ledger.get(&hash).cloned().unwrap_or_default();
            outbox.delete_blobs(hash.clone(), owner.into(), servers).await?;
            state.ledger.remove(&hash);
            self.save(state)?;
        }
        Ok(())
    }
    async fn reconcile(&self, relay: &Relay, branding: &Branding, outbox: &Outbox, keys: &signer::Shared) -> Result<(), String> {
        let public: Value = serde_json::from_slice(&branding.public_config()).map_err(|e| e.to_string())?;
        let mut state = self.state.lock().await;
        let key = keys.lock().clone().transpose()?;
        if !state.deleting {
            if let Some(event) = state.deletion.as_ref() {
                outbox.cancel_event(event.id).await?;
                state.deletion = None;
                self.save(&state)?;
            }
        }
        if !state.enabled || !enabled(&public) || state.deleting {
            if let Some(event) = state.pending.as_ref().and_then(|v| v.event.as_ref()) { outbox.cancel_event(event.id).await?; }
            if !state.deleting { return Ok(()); }
            let key = key.ok_or("nsite deletion needs the managed signing key")?;
            if state.deletion.is_none() {
                let coordinate = format!("15128:{}:", key.public_key().to_hex());
                let at = newer(state.last_timestamp, Timestamp::now().as_secs());
                let event = EventBuilder::new(Kind::EventDeletion, "nsite disabled")
                    .tags([Tag::parse(["a", &coordinate]).map_err(|e| e.to_string())?, Tag::parse(["k", "15128"]).map_err(|e| e.to_string())?])
                    .custom_created_at(Timestamp::from(at)).finalize(&key).map_err(|e| e.to_string())?;
                state.last_timestamp = at;
                state.deletion = Some(event);
                self.save(&state)?;
            }
            let event = state.deletion.clone().expect("deletion");
            outbox.require_blobs(event.id, vec![]).await?;
            ingest(relay, event.clone()).await?;
            outbox.deliver(state.relays.iter().cloned().collect(), vec![event.id]).await?;
            self.cleanup(&mut state, vec![], &key.public_key().to_hex(), outbox).await?;
            if outbox.event_delivery(event.id).await? {
                state.current = None;
                state.pending = None;
                state.deleting = false;
                state.retained = false;
                state.deletion = None;
                state.error = None;
                self.save(&state)?;
            }
            return Ok(());
        }
        let key = key.ok_or("nsite needs the managed signing key")?;
        if state.dirty.is_some_and(|at| millis().saturating_sub(at) >= DEBOUNCE_MS) {
            let origin = url(&public, key.public_key())?;
            let files = files(relay, branding, &public, &origin).await?;
            let paths: Vec<_> = files.iter().map(|f| (f.path.clone(), hash(&f.bytes))).collect();
            let aggregate = aggregate(&paths);
            if state.pending.as_ref().is_some_and(|v| v.aggregate == aggregate && v.relays == targets(&public)) {
                state.dirty = None;
                self.save(&state)?;
            } else {
                if let Some(event) = state.pending.as_ref().and_then(|v| v.event.as_ref()) { outbox.cancel_event(event.id).await?; }
                state.pending = None;
            let latest = relay.stored(Filter::new().author(key.public_key()).kind(Kind::Custom(15128)).limit(1)).await.map_err(|e| e.to_string())?;
            if state.current.as_ref().is_some_and(|v| v.aggregate == aggregate && v.event.as_ref().map(|e| e.id) == latest.first().map(|e| e.id)) {
                state.dirty = None;
                state.error = None;
                state.retained = false;
                self.save(&state)?;
                return Ok(());
            }
            let hashes = unique(paths.iter().map(|(_, hash)| hash.clone()));
            let mut retained: Vec<_> = state.ledger.keys().cloned().collect();
            retained.extend(hashes.clone());
            outbox.retain("nsite", retained).await?;
            // Record all attempted targets before the upload is queued, including removed mirrors.
            let attempted = outbox.mirror().blossom;
            let mut stored_hashes = BTreeSet::new();
            for (file, (_, expected)) in files.into_iter().zip(paths.iter()) {
                if !stored_hashes.insert(expected) { continue; }
                let ext = Path::new(&file.path).extension().and_then(|s| s.to_str()).unwrap_or("");
                let (stored, size) = outbox.store_local(&file.bytes, &file.mime, ext, &key.public_key().to_hex()).await?;
                if &stored != expected { return Err("nsite local storage hash mismatch".into()); }
                let recorded = state.ledger.entry(stored.clone()).or_default();
                *recorded = unique(recorded.iter().cloned().chain(attempted.iter().cloned()));
                self.save(&state)?;
                outbox.queue_blob(stored.clone(), size, format!("{}/{stored}", public["origin"].as_str().unwrap_or_default())).await?;
            }
            let tags = manifest_tags(&paths, &public, &aggregate);
            state.pending = Some(Version { aggregate, url: origin, hashes, tags, relays: targets(&public), event: None });
            state.dirty = None;
            state.retained = false;
            self.save(&state)?;
            }
        }
        if let Some(mut pending) = state.pending.clone() {
            if pending.event.is_none() {
                // In S2 not even a locally stored manifest announces unavailable files.
                if public["originIsPublic"] != true {
                    let public_servers = servers(&public);
                    for hash in &pending.hashes {
                        if !outbox.blob_copies(hash.clone()).await?.iter().any(|url| public_servers.iter().any(|server| server.trim_end_matches('/') == url.trim_end_matches('/'))) { return Ok(()); }
                    }
                }
                let stored = relay.stored(Filter::new().author(key.public_key()).kind(Kind::Custom(15128)).limit(1)).await.map_err(|e| e.to_string())?;
                let previous = stored.first().map(|e| e.created_at.as_secs()).unwrap_or(0).max(state.last_timestamp);
                let at = newer(previous, Timestamp::now().as_secs());
                let tags = pending.tags.iter().map(|t| Tag::parse(t.clone()).map_err(|e| e.to_string())).collect::<Result<Vec<_>,_>>()?;
                let event = EventBuilder::new(Kind::Custom(15128), "").tags(tags).custom_created_at(Timestamp::from(at)).finalize(&key).map_err(|e| e.to_string())?;
                // Files are already public; optional mirror failures must not block the manifest.
                outbox.require_blobs(event.id, vec![]).await?;
                state.last_timestamp = at;
                state.relays.extend(pending.relays.iter().cloned());
                pending.event = Some(event);
                state.pending = Some(pending.clone());
                self.save(&state)?;
            }
            let event = pending.event.as_ref().expect("manifest");
            outbox.require_blobs(event.id, vec![]).await?;
            ingest(relay, event.clone()).await?;
            outbox.deliver(pending.relays.clone(), vec![event.id]).await?;
            if outbox.event_delivery(event.id).await? {
                state.current = Some(pending.clone());
                state.pending = None;
                state.error = None;
                self.save(&state)?;
                self.cleanup(&mut state, pending.hashes, &key.public_key().to_hex(), outbox).await?;
            }
        }
        // Resume cleanup after a crash between the delivered-state write and queuing deletions.
        if state.pending.is_none() && state.dirty.is_none() {
            if let Some(current) = state.current.as_ref() {
                let keep = current.hashes.clone();
                self.cleanup(&mut state, keep, &key.public_key().to_hex(), outbox).await?;
            }
        }
        Ok(())
    }
}
async fn ingest(relay: &Relay, event: Event) -> Result<(), String> {
    // Duplicate local ingestion is normal when resuming a persisted delivery.
    match relay.ingest(event).await {
        RelayMessage::Ok { status: true, .. } => Ok(()),
        RelayMessage::Ok { message, .. } if message.starts_with("duplicate") => Ok(()),
        RelayMessage::Ok { message, .. } => Err(message.into_owned()),
        _ => Err("nsite relay returned an unexpected response".into()),
    }
}

pub fn spawn(nsite: Nsite, relay: Relay, branding: Arc<Branding>, outbox: Outbox, keys: signer::Shared) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(error) = nsite.request(&branding.public_config()).await { tracing::error!("nsite startup: {error}"); }
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        let mut tick = 0u8;
        loop {
            interval.tick().await;
            if tick % 5 == 0 { crate::profile::sync(&relay, &branding, &outbox, &keys).await; }
            tick = tick.wrapping_add(1);
            if let Err(error) = nsite.reconcile(&relay, &branding, &outbox, &keys).await {
                let mut state = nsite.state.lock().await;
                if state.error.as_deref() != Some(&error) { tracing::warn!("nsite: {error}"); }
                state.error = Some(error);
                if let Err(error) = nsite.save(&state) { tracing::error!("nsite status: {error}"); }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Config, Mirror, Reach, SiteHosting};
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn dir() -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!("nostube-nsite-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    async fn fixture() -> (PathBuf, Config, Keys, Relay, Branding, Outbox, Nsite, almond::AppState) {
        let dir = dir();
        let keys = Keys::generate();
        let mut cfg = Config::default_for_proxy("https://instance.example", 8080).unwrap();
        cfg.reach = Reach::Public;
        cfg.site_hosting = SiteHosting::Nsite;
        cfg.creators = vec![keys.public_key()];
        cfg.allowed_writers = vec![keys.public_key()];
        let relay = Relay::open(&dir.join("relay.sqlite"), crate::relay::RelayConfig {
            writers: vec![keys.public_key()], name: "nsite test".into(), description: String::new(), mirror_relays: vec![],
        }).unwrap();
        let mut almond = almond::Config::defaults();
        almond.storage_path = dir.join("blossom");
        almond.public_url = Some(cfg.origin.clone());
        almond.storage_min_free = 0;
        let storage = almond::build_state(&almond.validate().unwrap()).await.unwrap();
        let outbox = Outbox::open(&dir.join("relay.sqlite"), Mirror::default()).unwrap();
        outbox.attach_storage(storage.clone());
        let branding = Branding::open(&dir, cfg.public_json());
        let nsite = Nsite::open(&dir).unwrap();
        (dir, cfg, keys, relay, branding, outbox, nsite, storage)
    }
    fn shared(keys: &Keys) -> signer::Shared {
        Arc::new(parking_lot::Mutex::new(Some(Ok(keys.clone()))))
    }
    async fn due(nsite: &Nsite) {
        nsite.state.lock().await.dirty = Some(millis().saturating_sub(DEBOUNCE_MS + 1));
    }
    async fn acknowledge(outbox: &Outbox) {
        outbox.db(|conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='event'", []).map(|_| ())).await.unwrap();
    }

    #[test]
    fn nip5a_aggregate_sorts_hash_first_and_root_has_no_d_tag() {
        let paths = vec![("/a".into(), "f".repeat(64)), ("/z".into(), "0".repeat(64))];
        let expected = "b637c16f187c13cdbb664bd0ddfa7f35fab2fdcfb8f475f2435cbeffa4452b1e".to_owned();
        assert_eq!(aggregate(&paths), expected);
        let mut reversed = paths.clone();
        reversed.reverse();
        assert_eq!(aggregate(&reversed), expected);
        let cfg = serde_json::json!({"origin":"https://home.local","originIsPublic":false,"mirror":{"blossom":["https://mirror.example","http://127.0.0.1"]},"title":"Title","site":{"tagline":"Description"}});
        let tags = manifest_tags(&paths, &cfg, &expected);
        assert!(tags.contains(&vec!["x".into(), expected, "aggregate".into()]));
        assert!(tags.contains(&vec!["server".into(), "https://mirror.example".into()]));
        assert!(!tags.iter().any(|t| t[0] == "d" || t.iter().any(|v| v.contains("home.local") || v.contains("127.0.0.1"))));
        assert_eq!(newer(100, 1), 101);
        assert_eq!(newer(1, 100), 100);
    }

    #[test]
    fn baked_public_relays_and_revision_are_stable_across_unrelated_saves() {
        let mut public = serde_json::json!({"origin":"https://instance.example","originIsPublic":false,"revision":1,
            "videoSources":["wss://instance.example","wss://source.example","ws://192.168.1.2"],
            "interactionRelays":["wss://instance.example","wss://source.example"],
            "profileRelays":["wss://profile.example"],"mirror":{"relays":["wss://mirror.example"]}});
        let baked = baked_config(public.clone(), "https://site.example");
        assert_eq!(baked["origin"], "https://site.example");
        assert_eq!(baked["videoSources"], serde_json::json!(["wss://source.example","wss://mirror.example"]));
        assert_eq!(baked["interactionRelays"], serde_json::json!(["wss://source.example","wss://mirror.example"]));
        public["revision"] = 999.into();
        assert_eq!(baked, baked_config(public.clone(), "https://site.example"));
        public["originIsPublic"] = true.into();
        assert_eq!(baked_config(public, "https://site.example")["videoSources"][0], "wss://instance.example");
    }

    #[test]
    fn redirects_preserve_exact_path_query_and_leave_all_infrastructure() {
        let keys = Keys::generate();
        let public = serde_json::json!({"reach":"public","siteHosting":"nsite","nsite":{"gateway":"nsite.lol","domain":"video.example"}});
        let bytes = serde_json::to_vec(&public).unwrap();
        for path in ["/", "/v/a%2Fb", "/t/hello", "/search", "/about", "/imprint", "/privacy"] {
            assert_eq!(redirect(&bytes, Some(keys.public_key()), path, Some("q=a%2Bb&x=1")).unwrap(), format!("https://video.example{path}?q=a%2Bb&x=1"));
        }
        for path in ["/api/config", "/studio/", "/admin", "/branding/logo", "/embed.html", "/.well-known/nostr.json", "/feed.xml", "/v", "/t", "/about/extra"] {
            assert!(redirect(&bytes, Some(keys.public_key()), path, None).is_none(), "{path}");
        }
        assert!(redirect(&bytes, None, "/", None).is_none());
        let gateway = serde_json::json!({"nsite":{"gateway":"gateway.example","domain":""}});
        assert_eq!(url(&gateway, keys.public_key()).unwrap(), format!("https://{}.gateway.example", keys.public_key().to_bech32().unwrap()));
        let mut private = public;
        private["reach"] = "private".into();
        assert!(redirect(&serde_json::to_vec(&private).unwrap(), Some(keys.public_key()), "/", None).is_none());
    }

    #[tokio::test]
    async fn full_file_set_inlines_index_fallback_and_standalone_player_without_studio_or_snapshots() {
        let (_dir, _cfg, _key, relay, branding, _outbox, _nsite, _storage) = fixture().await;
        let logo = axum::body::Bytes::from_static(b"\x89PNG\r\n\x1a\nxx");
        branding.store(crate::branding::Slot::Logo, crate::branding::Kind::Png, logo.clone()).unwrap();
        let public: Value = serde_json::from_slice(&branding.public_config()).unwrap();
        let files = files(&relay, &branding, &public, "https://site.example").await.unwrap();
        let names: BTreeSet<_> = files.iter().map(|f| f.path.as_str()).collect();
        for required in ["/index.html","/404.html","/embed.html","/sw.js","/registerSW.js","/manifest.webmanifest","/nostube.png","/nostube.svg"] {
            assert!(names.contains(required), "{required}");
        }
        assert!(names.iter().any(|p| p.starts_with("/assets/")));
        assert!(names.iter().any(|p| p.starts_with("/workbox-")));
        assert_eq!(files.iter().find(|file| file.path == "/branding/logo").unwrap().bytes.as_ref(), logo.as_ref());
        assert!(!names.iter().any(|p| p.starts_with("/studio") || matches!(*p, "/sitemap.xml" | "/feed.xml" | "/atom.xml")));
        for path in ["/index.html", "/404.html", "/embed.html"] {
            let html = std::str::from_utf8(&files.iter().find(|f| f.path == path).unwrap().bytes).unwrap();
            assert!(html.contains("id=\"nostube-config\""), "{path}");
            assert!(html.contains("https://site.example"), "{path}");
        }
        assert_eq!(files.iter().find(|f| f.path == "/index.html").unwrap().bytes, files.iter().find(|f| f.path == "/404.html").unwrap().bytes);
        let escaped = inline("<head></head>", &serde_json::json!({"title":"</script><script>alert(1)</script>"})).unwrap();
        assert!(!escaped.contains("</script><script>"));
    }

    #[tokio::test]
    async fn debounced_publication_survives_restart_and_skips_unchanged_file_set() {
        let (dir, mut cfg, keys, relay, branding, outbox, nsite, _storage) = fixture().await;
        let signer = shared(&keys);
        nsite.request(&branding.public_config()).await.unwrap();
        nsite.request(&branding.public_config()).await.unwrap();
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert!(nsite.state.lock().await.pending.is_none(), "debounce must not publish immediately");
        due(&nsite).await;
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let first = nsite.state.lock().await.pending.as_ref().unwrap().event.clone().unwrap();
        let resumed = Nsite::open(&dir).unwrap();
        assert_eq!(resumed.state.lock().await.pending.as_ref().unwrap().event.as_ref().unwrap().id, first.id);
        assert_eq!(resumed.status(&branding.public_config(), &signer, &outbox).await.unwrap()["status"], "pending");
        acknowledge(&outbox).await;
        resumed.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert_eq!(resumed.status(&branding.public_config(), &signer, &outbox).await.unwrap()["status"], "published");
        cfg.revision += 1;
        branding.set_base(cfg.public_json());
        resumed.request(&branding.public_config()).await.unwrap();
        due(&resumed).await;
        resumed.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert_eq!(resumed.state.lock().await.current.as_ref().unwrap().event.as_ref().unwrap().id, first.id);
        cfg.title = "Changed title".into();
        branding.set_base(cfg.public_json());
        resumed.request(&branding.public_config()).await.unwrap();
        resumed.request(&branding.public_config()).await.unwrap();
        due(&resumed).await;
        resumed.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let second = resumed.state.lock().await.pending.as_ref().unwrap().event.clone().unwrap();
        assert!(second.created_at > first.created_at);
        assert_ne!(second.id, first.id);
        let current_blobs = resumed.state.lock().await.current.as_ref().unwrap().hashes.clone();
        assert!(current_blobs.iter().all(|hash| resumed.state.try_lock().unwrap().ledger.contains_key(hash)), "no cleanup before delivery");
        acknowledge(&outbox).await;
        resumed.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let state = resumed.state.lock().await;
        assert!(state.ledger.keys().all(|hash| state.current.as_ref().unwrap().hashes.contains(hash)));
    }

    #[tokio::test]
    async fn reverting_an_ingested_pending_version_restores_the_delivered_settings() {
        let (dir, mut cfg, keys, relay, branding, outbox, nsite, _storage) = fixture().await;
        let signer = shared(&keys);
        let original = cfg.clone();
        nsite.request(&branding.public_config()).await.unwrap();
        due(&nsite).await;
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        acknowledge(&outbox).await;
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let first = relay.stored(Filter::new().kind(Kind::Custom(15128))).await.unwrap().remove(0);
        cfg.title = "Pending edit".into();
        branding.set_base(cfg.public_json());
        nsite.request(&branding.public_config()).await.unwrap();
        due(&nsite).await;
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let pending = relay.stored(Filter::new().kind(Kind::Custom(15128))).await.unwrap().remove(0);
        branding.set_base(original.public_json());
        nsite.request(&branding.public_config()).await.unwrap();
        due(&nsite).await;
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let restored = relay.stored(Filter::new().kind(Kind::Custom(15128))).await.unwrap().remove(0);
        assert_eq!(restored.tags, first.tags);
        assert!(restored.created_at > pending.created_at);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn delete_uses_root_coordinate_historical_targets_and_spares_shared_blobs_keep_deletes_nothing() {
        let (dir, mut cfg, keys, relay, branding, outbox, nsite, storage) = fixture().await;
        let signer = shared(&keys);
        let (old, _) = outbox.store_local(b"superseded", "text/plain", "txt", &keys.public_key().to_hex()).await.unwrap();
        let (shared_hash, _) = outbox.store_local(b"profile picture", "image/png", "png", &keys.public_key().to_hex()).await.unwrap();
        outbox.retain("profile", vec![shared_hash.clone()]).await.unwrap();
        {
            let mut state = nsite.state.lock().await;
            state.enabled = true;
            state.ledger.insert(old.clone(), vec!["https://removed-mirror.example".into()]);
            state.ledger.insert(shared_hash.clone(), vec!["https://removed-mirror.example".into()]);
            state.relays.insert("wss://historical-relay.example".into());
            nsite.save(&state).unwrap();
        }
        nsite.disable(false, &outbox).await.unwrap();
        let reopened = Nsite::open(&dir).unwrap();
        assert!(reopened.state.lock().await.retained);
        assert_eq!(outbox.status().await.unwrap()["problems"].as_array().map(Vec::len).unwrap_or(0), 0);
        assert!(storage.file_index.get(&old).await.is_some());
        reopened.disable(true, &outbox).await.unwrap();
        cfg.site_hosting = SiteHosting::Instance;
        cfg.reach = Reach::Private;
        branding.set_base(cfg.public_json());
        reopened.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        let deletion = reopened.state.lock().await.deletion.clone().unwrap();
        assert_eq!(deletion.kind, Kind::EventDeletion);
        assert!(deletion.tags.iter().any(|t| t.as_slice() == ["a", &format!("15128:{}:", keys.public_key().to_hex())]));
        assert!(deletion.tags.iter().any(|t| t.as_slice() == ["k", "15128"]));
        assert!(reopened.state.lock().await.ledger.is_empty());
        let conn = crate::relay::connect(&dir.join("relay.sqlite")).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM outbox WHERE kind='event' AND target='wss://historical-relay.example'", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        acknowledge(&outbox).await;
        crate::outbox::run_due_for_test(&outbox, &signer).await;
        assert!(storage.file_index.get(&old).await.is_none());
        assert!(storage.file_index.get(&shared_hash).await.is_some());
        let targets: Vec<String> = conn.prepare("SELECT target FROM outbox WHERE kind='blob-delete' AND ref_id=?").unwrap()
            .query_map([&old], |r| r.get(0)).unwrap().collect::<rusqlite::Result<_>>().unwrap();
        assert!(targets.contains(&"https://removed-mirror.example".into()));
        reopened.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert!(!reopened.state.lock().await.deleting);
    }

    #[tokio::test]
    async fn s2_never_signs_until_each_file_has_a_public_copy_and_reports_delivery_failure() {
        let (dir, mut cfg, keys, relay, branding, _old_outbox, nsite, storage) = fixture().await;
        cfg.origin = "https://home.local".into();
        cfg.origin_host = "home.local".into();
        cfg.mirror = Mirror { relays: vec!["wss://mirror.example".into()], blossom: vec!["https://blossom.example".into()] };
        branding.set_base(cfg.public_json());
        let outbox = Outbox::open(&dir.join("relay.sqlite"), cfg.mirror.clone()).unwrap();
        outbox.attach_storage(storage);
        outbox.set_origin_public(false);
        let hashes = vec![hash(b"first"), hash(b"second")];
        for hash in &hashes { outbox.queue_blob(hash.clone(), 5, format!("https://home.local/{hash}")).await.unwrap(); }
        {
            let public = cfg.public_json();
            let mut state = nsite.state.lock().await;
            state.enabled = true;
            state.pending = Some(Version { aggregate: "a".repeat(64), url: "https://site.example".into(), hashes: hashes.clone(),
                tags: manifest_tags(&[("/index.html".into(), hashes[0].clone()), ("/embed.html".into(), hashes[1].clone())], &public, &"a".repeat(64)),
                relays: targets(&public), event: None });
            nsite.save(&state).unwrap();
        }
        let signer = shared(&keys);
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert!(relay.stored(Filter::new().kind(Kind::Custom(15128))).await.unwrap().is_empty());
        let first = hashes[0].clone();
        outbox.db(move |conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='blob' AND ref_id=?", [first]).map(|_| ())).await.unwrap();
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert!(relay.stored(Filter::new().kind(Kind::Custom(15128))).await.unwrap().is_empty());
        // Per-server file count and per-relay state before the manifest is signed.
        let status = nsite.status(&branding.public_config(), &signer, &outbox).await.unwrap();
        assert_eq!(status["servers"], serde_json::json!([{ "target": "https://blossom.example", "status": "pending", "done": 1, "total": 2, "error": null }]));
        assert!(status["relays"].as_array().unwrap().iter().all(|r| r["status"] == "pending"));
        assert!(status["relays"].as_array().unwrap().iter().any(|r| r["target"] == "wss://mirror.example"));
        outbox.db(|conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='blob'", []).map(|_| ())).await.unwrap();
        nsite.reconcile(&relay, &branding, &outbox, &signer).await.unwrap();
        assert_eq!(relay.stored(Filter::new().kind(Kind::Custom(15128))).await.unwrap().len(), 1);
        // A relay's transient refusal is still retried: pending, with the error visible.
        outbox.db(|conn| conn.execute("UPDATE outbox SET last_error='cannot connect: HTTP error: 503 Service Unavailable' WHERE kind='event' AND target='wss://mirror.example'", []).map(|_| ())).await.unwrap();
        outbox.db(|conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='event' AND target!='wss://mirror.example'", []).map(|_| ())).await.unwrap();
        let status = nsite.status(&branding.public_config(), &signer, &outbox).await.unwrap();
        assert_eq!((status["status"].as_str(), status["error"].as_str()), (Some("pending"), Some("cannot connect: HTTP error: 503 Service Unavailable")));
        assert_eq!(status["servers"][0]["status"], "done");
        for relay in status["relays"].as_array().unwrap() {
            let mirror = relay["target"] == "wss://mirror.example";
            assert_eq!(relay["status"], if mirror { "pending" } else { "done" }, "{relay}");
            assert_eq!(relay["error"].is_null(), !mirror, "{relay}");
        }
        outbox.db(|conn| conn.execute("UPDATE outbox SET status='failed',last_error='relay refused manifest' WHERE kind='event'", []).map(|_| ())).await.unwrap();
        let status = nsite.status(&branding.public_config(), &signer, &outbox).await.unwrap();
        assert_eq!(status["status"], "failed");
        assert_eq!(status["error"], "relay refused manifest");
    }
}
