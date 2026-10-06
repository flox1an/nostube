//! Relay stub for the build check: proves axum ws + nostr 0.45 + rusqlite
//! in one binary. Not the port: no SQL filter generation, no replaceable or
//! deletion handling (ticket #4 / #11 scope).

use std::{borrow::Cow, collections::HashMap, path::Path, sync::Arc};

use parking_lot::Mutex;

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
    prelude::{ClientMessage, Event, Filter, PublicKey, RelayMessage, SubscriptionId},
};
use rusqlite::{params, Connection};
use tokio::sync::broadcast;

const MAX_MESSAGE_BYTES: usize = 128 * 1024;
const MAX_SUBSCRIPTIONS: usize = 32;

#[derive(Clone)]
pub struct Relay {
    db: Arc<Mutex<Connection>>,
    writers: Arc<Vec<PublicKey>>,
    live: broadcast::Sender<Event>,
}

impl Relay {
    pub fn open(path: &Path, writers: Vec<PublicKey>) -> rusqlite::Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS event (
               id BLOB PRIMARY KEY, author BLOB NOT NULL, kind INTEGER NOT NULL,
               created_at INTEGER NOT NULL, content TEXT NOT NULL);",
        )?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            writers: Arc::new(writers),
            live: broadcast::channel(1024).0,
        })
    }

    async fn ingest(&self, ev: Event) -> RelayMessage<'static> {
        if ev.verify().is_err() {
            return RelayMessage::ok(ev.id, false, "invalid: bad id or signature");
        }
        if !self.writers.contains(&ev.pubkey) {
            return RelayMessage::ok(ev.id, false, "restricted: not an allowed writer");
        }
        if !ev.kind.is_ephemeral() {
            let db = self.db.clone();
            let row = ev.clone();
            let inserted = tokio::task::spawn_blocking(move || {
                db.lock().execute(
                    "INSERT OR IGNORE INTO event (id, author, kind, created_at, content) VALUES (?, ?, ?, ?, ?)",
                    params![
                        row.id.as_bytes(),
                        row.pubkey.to_bytes(),
                        row.kind.as_u16(),
                        row.created_at.as_secs() as i64,
                        row.as_json()
                    ],
                )
            })
            .await
            .expect("db task");
            match inserted {
                Ok(0) => return RelayMessage::ok(ev.id, true, "duplicate: already have this event"),
                Ok(_) => {}
                Err(e) => return RelayMessage::ok(ev.id, false, format!("error: {e}")),
            }
        }
        let id = ev.id;
        let _ = self.live.send(ev);
        RelayMessage::ok(id, true, "")
    }

    async fn query(&self, id: SubscriptionId, filters: Vec<Filter>) -> Vec<RelayMessage<'static>> {
        let db = self.db.clone();
        // ponytail: full scan + match_event; the port generates SQL from the filter.
        let events: Vec<Event> = tokio::task::spawn_blocking(move || {
            let db = db.lock();
            let mut stmt = db.prepare("SELECT content FROM event ORDER BY created_at DESC").unwrap();
            stmt.query_map([], |r| r.get::<_, String>(0))
                .unwrap()
                .filter_map(|r| Event::from_json(r.ok()?).ok())
                .collect()
        })
        .await
        .expect("db task");
        let limit = filters.iter().filter_map(|f| f.limit).max().unwrap_or(usize::MAX);
        let mut out: Vec<_> = events
            .into_iter()
            .filter(|ev| filters.iter().any(|f| f.match_event(ev, MatchEventOptions::new())))
            .take(limit)
            .map(|ev| RelayMessage::event(id.clone(), ev))
            .collect();
        out.push(RelayMessage::eose(id));
        out
    }

    async fn on_text(&self, text: &str, subs: &mut HashMap<SubscriptionId, Vec<Filter>>) -> Vec<RelayMessage<'static>> {
        match ClientMessage::from_json(text) {
            Ok(ClientMessage::Event(ev)) => vec![self.ingest(ev.into_owned()).await],
            Ok(ClientMessage::Req { subscription_id, filters }) => {
                let id = subscription_id.into_owned();
                if subs.len() >= MAX_SUBSCRIPTIONS && !subs.contains_key(&id) {
                    return vec![RelayMessage::closed(id, "error: too many subscriptions")];
                }
                let filters: Vec<Filter> = filters.into_iter().map(Cow::into_owned).collect();
                subs.insert(id.clone(), filters.clone());
                self.query(id, filters).await
            }
            Ok(ClientMessage::Close(id)) => {
                subs.remove(id.as_ref());
                vec![]
            }
            Ok(_) => vec![RelayMessage::notice("unsupported message")],
            Err(e) => vec![RelayMessage::notice(format!("invalid: {e}"))],
        }
    }

    async fn session(self, mut ws: WebSocket) {
        let mut live = self.live.subscribe();
        let mut subs = HashMap::new();
        loop {
            let out = tokio::select! {
                msg = ws.recv() => match msg {
                    Some(Ok(Message::Text(text))) => self.on_text(text.as_str(), &mut subs).await,
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => return,
                    Some(Ok(_)) => continue,
                },
                ev = live.recv() => match ev {
                    Ok(ev) => subs
                        .iter()
                        .filter(|(_, fs)| fs.iter().any(|f| f.match_event(&ev, MatchEventOptions::new())))
                        .map(|(id, _)| RelayMessage::event(id.clone(), ev.clone()))
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
    if wants_nip11(&req) {
        return nip11();
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

fn nip11() -> Response {
    let doc = RelayInformationDocument {
        name: Some("nostube-server build check".into()),
        supported_nips: Some(vec![1, 9, 11, 40]),
        software: Some("nostube-server".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        limitation: Some(Limitation {
            max_message_length: Some(MAX_MESSAGE_BYTES as i32),
            max_subscriptions: Some(MAX_SUBSCRIPTIONS as i32),
            restricted_writes: Some(true),
            auth_required: Some(false),
            ..Default::default()
        }),
        ..Default::default()
    };
    (
        [
            (header::CONTENT_TYPE, "application/nostr+json"),
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
        ],
        doc.as_json(),
    )
        .into_response()
}
