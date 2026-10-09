//! Admin area (/admin, ADR 0002): one admin with a mandatory password (argon2id),
//! an optional bound NIP-07 key, one server-side session; setup via the one-time
//! setup token. The registered admin may edit the config (#17) and apply it:
//! validate + preflight, config.prev, then the process exits so the supervisor
//! (launchd) restarts it (#7).

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2, PasswordHash, PasswordVerifier,
};
use axum::{
    extract::{Form, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use hmac::{Hmac, Mac};
use nostr::prelude::{Event, PublicKey};
use serde::Deserialize;
use sha2::Sha256;

use crate::config::{self, Config, Edited, Search, Storage};

const SESSION_TTL: Duration = Duration::from_secs(7 * 24 * 3600);
/// Freshness window for NIP-98 login/bind events (clock skew included).
const NIP98_MAX_AGE: u64 = 300;
const COOKIE: &str = "admin_session";

type BoxError = Box<dyn std::error::Error + Send + Sync>;

// ── Secrets store ───────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Secrets {
    session_secret: String,
    /// argon2id PHC string; present once the admin registered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    password_hash: Option<String>,
    /// Bound NIP-07 key (hex); logs in like the password (ADR 0002).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    nostr_pubkey: Option<String>,
    /// One-time token; exists only while no admin is registered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    setup_token: Option<String>,
}

impl Secrets {
    fn path(data: &Path) -> PathBuf {
        data.join("secrets.toml")
    }

    fn load(data: &Path) -> Result<Secrets, BoxError> {
        let text = std::fs::read_to_string(Self::path(data))
            .map_err(|e| format!("cannot read {}: {e}", Self::path(data).display()))?;
        // A secrets file we cannot trust only disables the admin area (#7).
        toml::from_str(&text).map_err(|e| format!("broken secrets file: {e}").into())
    }

    fn create(data: &Path) -> Result<Secrets, BoxError> {
        let s = Secrets {
            session_secret: random_hex(32),
            setup_token: Some(random_hex(32)),
            ..Secrets::default()
        };
        s.save(data)?;
        Ok(s)
    }

    fn save(&self, data: &Path) -> Result<(), BoxError> {
        write_private(&Self::path(data), &toml::to_string_pretty(self)?)
    }

    fn registered(&self) -> bool {
        self.password_hash.is_some()
    }
}

/// Admin state shared with the axum router.
pub struct AdminState {
    data: PathBuf,
    secrets: Arc<Mutex<Secrets>>,
    origin_host: String,
    /// Every host the TLS leaf covers; admin NIP-98 events may target any of them.
    covered_hosts: Vec<String>,
    boot_id: String,
    handle: Arc<axum_server::Handle<std::net::SocketAddr>>,
}

impl AdminState {
    /// Opens (or creates) the secrets store. `Err` means the admin area stays
    /// disabled and the server keeps serving everything else (#7).
    pub fn open(
        data: &Path,
        origin_host: &str,
        covered_hosts: Vec<String>,
        setup_origin: &str,
        boot_id: String,
        handle: Arc<axum_server::Handle<std::net::SocketAddr>>,
    ) -> Result<AdminState, BoxError> {
        let secrets = if Secrets::path(data).exists() {
            Secrets::load(data)?
        } else {
            Secrets::create(data)?
        };
        if secrets.registered() {
            tracing::info!("admin area enabled");
        } else {
            let token = secrets.setup_token.as_deref().ok_or("unregistered admin has no setup token")?;
            // Fragments stay out of HTTP access logs and Referrer headers.
            let link = format!("{setup_origin}/admin/setup#token={token}");
            let code = qrcode::QrCode::new(link.as_bytes())?;
            let qr = code.render::<qrcode::render::unicode::Dense1x2>()
                .light_color(qrcode::render::unicode::Dense1x2::Dark)
                .dark_color(qrcode::render::unicode::Dense1x2::Light)
                .build();
            tracing::info!("admin setup (one-time secret; do not share): {link}\n{qr}");
        }
        Ok(AdminState {
            data: data.to_owned(),
            secrets: Arc::new(Mutex::new(secrets)),
            origin_host: origin_host.to_owned(),
            covered_hosts,
            boot_id,
            handle,
        })
    }

    /// `nostube-server admin reset`: forget password and bound key, issue a new
    /// setup token and print it (ADR 0002).
    pub fn reset(data: &Path) -> Result<(), BoxError> {
        let mut s = if Secrets::path(data).exists() { Secrets::load(data)? } else { Secrets::default() };
        s.password_hash = None;
        s.nostr_pubkey = None;
        s.session_secret = random_hex(32); // invalidates all sessions
        s.setup_token = Some(random_hex(32));
        s.save(data)?;
        println!(
            "admin reset: setup token (one-time, use at /admin/setup):\n{}",
            s.setup_token.as_deref().unwrap_or_default()
        );
        Ok(())
    }
}

// ── Sessions (HMAC-signed expiry, no server-side store) ─────────────────────

fn sign_session(secret_hex: &str, expires: u64) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_hex.as_bytes()).expect("hmac key");
    mac.update(expires.to_string().as_bytes());
    format!("{expires:x}.{:x}", mac.finalize().into_bytes())
}

/// Ok(()) if the cookie is a valid, unexpired session for this secrets store.
fn verify_session(secret_hex: &str, cookie: &str) -> Result<(), ()> {
    let (exp, _) = cookie.split_once('.').ok_or(())?;
    let expires = u64::from_str_radix(exp, 16).map_err(|_| ())?;
    if sign_session(secret_hex, expires) != cookie {
        return Err(());
    }
    if now_secs() >= expires {
        return Err(());
    }
    Ok(())
}

fn session_cookie(secret_hex: &str) -> String {
    let expires = now_secs() + SESSION_TTL.as_secs();
    format!(
        "{COOKIE}={}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age={}",
        sign_session(secret_hex, expires),
        SESSION_TTL.as_secs()
    )
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn random_hex(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// Fresh ID per process start; the admin UI polls `/api/health` for it after apply.
pub fn random_boot_id() -> String {
    random_hex(8)
}

fn write_private(path: &Path, text: &str) -> Result<(), BoxError> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut f =
        std::fs::OpenOptions::new().create(true).truncate(true).write(true).mode(0o600).open(path)?;
    f.write_all(text.as_bytes())?;
    Ok(())
}

// ── Auth helpers ────────────────────────────────────────────────────────────

/// The logged-in check for every admin page: session cookie wins, else redirect.
enum Auth {
    Ok,
    Redirect(Redirect),
}

fn authed(state: &AdminState, headers: &HeaderMap) -> Auth {
    let Some(cookie) = headers.get(header::COOKIE).and_then(|v| v.to_str().ok()) else {
        return Auth::Redirect(Redirect::to("/admin/login"));
    };
    let secrets = state.secrets.lock().unwrap();
    for pair in cookie.split("; ") {
        if let Some(value) = pair.strip_prefix(&format!("{COOKIE}=")) {
            if verify_session(&secrets.session_secret, value).is_ok() {
                return Auth::Ok;
            }
        }
    }
    Auth::Redirect(Redirect::to("/admin/login"))
}

/// Verify a NIP-98 `Authorization: Nostr <base64>` header against the endpoint
/// this handler serves, tolerating every name the certificate covers (aliases).
fn verify_nip98(state: &AdminState, headers: &HeaderMap, path: &str) -> Result<PublicKey, Response> {
    use base64::Engine;
    let bad = |msg: &'static str| (StatusCode::UNAUTHORIZED, msg).into_response();
    let auth = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).ok_or_else(|| bad("missing Authorization header"))?;
    let b64 = auth.strip_prefix("Nostr ").map(str::trim).filter(|s| !s.is_empty()).ok_or_else(|| bad("not a NIP-98 header"))?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|_| bad("authorization event is not base64"))?;
    let json = String::from_utf8(raw).map_err(|_| bad("authorization event is not utf-8"))?;
    let event = Event::from_json(json.as_str()).map_err(|_| bad("authorization event is not a valid event"))?;
    event.verify().map_err(|_| bad("authorization event signature invalid"))?;
    if event.kind != nostr::prelude::Kind::HttpAuth {
        return Err(bad("wrong event kind"));
    }
    let created = event.created_at.as_secs();
    let now = now_secs();
    if created > now || now - created > NIP98_MAX_AGE {
        return Err(bad("authorization event too old"));
    }
    let (u, method) = event
        .tags
        .iter()
        .filter_map(|t| t.as_slice().split_first().map(|(k, v)| (k.as_str(), v.first())))
        .fold((None, None), |acc, (k, v)| match (k, v) {
            ("u", Some(v)) => (Some(v.to_owned()), acc.1),
            ("method", Some(v)) => (acc.0, Some(v.to_owned())),
            _ => acc,
        });
    let (Some(u), Some(method)) = (u, method) else {
        return Err(bad("missing u/method tag"));
    };
    if !method.eq_ignore_ascii_case("POST") {
        return Err(bad("method tag mismatch"));
    }
    let url = nostr::prelude::Url::parse(&u).map_err(|_| bad("bad u tag"))?;
    if url.path() != path {
        return Err(bad("u path mismatch"));
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if host != state.origin_host && !state.covered_hosts.iter().any(|h| h.eq_ignore_ascii_case(&host)) {
        return Err(bad("u host is not this instance"));
    }
    Ok(event.pubkey)
}

fn password_hash(pw: &str) -> Result<String, BoxError> {
    Ok(Argon2::default()
        .hash_password(pw.as_bytes(), &SaltString::generate(&mut OsRng))?
        .to_string())
}

fn password_ok(hash: &str, pw: &str) -> bool {
    PasswordHash::new(hash)
        .is_ok_and(|parsed| Argon2::default().verify_password(pw.as_bytes(), &parsed).is_ok())
}

// ── Router ──────────────────────────────────────────────────────────────────

pub fn router(state: AdminState) -> Router {
    let state = Arc::new(state);
    // Full paths: the dispatcher forwards the original request unchanged.
    Router::new()
        .route("/admin", get(index))
        .route("/admin/", get(index))
        .route("/admin/setup", get(setup_page).post(setup_post))
        .route("/admin/login", get(login_page).post(login_post))
        .route("/admin/login/nostr", post(login_nostr))
        .route("/admin/bind-nostr", post(bind_nostr))
        .route("/admin/unbind-nostr", post(unbind_nostr))
        .route("/admin/logout", post(logout))
        .route("/api/admin/config", get(config_get).put(config_put))
        .with_state(state)
}

// ── Pages ───────────────────────────────────────────────────────────────────

/// The studio is the admin interface; this server-rendered part keeps only setup and login,
/// which have to work without the studio bundle.
async fn index(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !state.secrets.lock().unwrap().registered() {
        return Redirect::to("/admin/setup").into_response();
    }
    match authed(&state, &headers) {
        Auth::Redirect(r) => r.into_response(),
        Auth::Ok => Redirect::to("/studio/").into_response(),
    }
}

async fn setup_page(State(state): State<Arc<AdminState>>) -> Response {
    if state.secrets.lock().unwrap().registered() {
        return Redirect::to("/admin").into_response();
    }
    page("Setup", &setup_form(None)).into_response()
}

#[derive(Deserialize)]
struct SetupForm {
    token: String,
    password: String,
    password2: String,
}

async fn setup_post(State(state): State<Arc<AdminState>>, Form(f): Form<SetupForm>) -> Response {
    let mut secrets = state.secrets.lock().unwrap();
    if secrets.registered() {
        return Redirect::to("/admin").into_response();
    }
    let ok = secrets.setup_token.as_deref().is_some_and(|t| constant_eq(t, f.token.trim()));
    if !ok {
        return page("Setup", &setup_form(Some("Setup token is wrong."))).into_response();
    }
    if f.password.len() < 8 {
        return page("Setup", &setup_form(Some("Password must be at least 8 characters.")))
            .into_response();
    }
    if f.password != f.password2 {
        return page("Setup", &setup_form(Some("Passwords do not match."))).into_response();
    }
    match password_hash(&f.password) {
        Ok(h) => secrets.password_hash = Some(h),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
    secrets.setup_token = None;
    let secret = secrets.session_secret.clone();
    if let Err(e) = secrets.save(&state.data) {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    drop(secrets);
    tracing::info!("admin setup: admin registered");
    set_cookie_redirect(&secret, "/admin").into_response()
}

async fn login_page(State(state): State<Arc<AdminState>>) -> Response {
    let secrets = state.secrets.lock().unwrap();
    if !secrets.registered() {
        return Redirect::to("/admin/setup").into_response();
    }
    let nostr = secrets.nostr_pubkey.is_some();
    drop(secrets);
    page("Log in", &login_form(None, nostr)).into_response()
}

#[derive(Deserialize)]
struct LoginForm {
    password: String,
}

async fn login_post(State(state): State<Arc<AdminState>>, Form(f): Form<LoginForm>) -> Response {
    let secrets = state.secrets.lock().unwrap();
    let ok = secrets.password_hash.as_deref().is_some_and(|h| password_ok(h, &f.password));
    if !ok {
        drop(secrets);
        // Same page for wrong passwords; no detail for guessing.
        return page("Log in", &login_form(Some("Wrong password."), false)).into_response();
    }
    let secret = secrets.session_secret.clone();
    drop(secrets);
    set_cookie_redirect(&secret, "/admin").into_response()
}

/// NIP-07 login: the page JS signs a NIP-98 event and sends its Authorization header.
async fn login_nostr(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    let pubkey = match verify_nip98(&state, &headers, "/admin/login/nostr") {
        Ok(p) => p,
        Err(r) => return r,
    };
    let secrets = state.secrets.lock().unwrap();
    let bound = secrets.nostr_pubkey.as_deref().is_some_and(|b| b == pubkey.to_hex());
    if !bound {
        return (StatusCode::UNAUTHORIZED, "this key is not bound to the admin").into_response();
    }
    let secret = secrets.session_secret.clone();
    drop(secrets);
    set_cookie_redirect(&secret, "/admin").into_response()
}

/// Bind a NIP-07 key to the admin (requires a live session).
async fn bind_nostr(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if let Auth::Redirect(r) = authed(&state, &headers) {
        return r.into_response();
    }
    let pubkey = match verify_nip98(&state, &headers, "/admin/bind-nostr") {
        Ok(p) => p,
        Err(r) => return r,
    };
    let mut secrets = state.secrets.lock().unwrap();
    secrets.nostr_pubkey = Some(pubkey.to_hex());
    match secrets.save(&state.data) {
        Ok(()) => (StatusCode::OK, "bound").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn unbind_nostr(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if let Auth::Redirect(r) = authed(&state, &headers) {
        return r.into_response();
    }
    let mut secrets = state.secrets.lock().unwrap();
    secrets.nostr_pubkey = None;
    match secrets.save(&state.data) {
        Ok(()) => (StatusCode::OK, "unbound").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn logout() -> Response {
    (
        [
            (header::SET_COOKIE, format!("{COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0")),
            (header::LOCATION, "/admin/login".to_owned()),
        ],
        StatusCode::SEE_OTHER,
    )
        .into_response()
}

// ── Studio API ──────────────────────────────────────────────────────────────

fn is_authed(state: &AdminState, headers: &HeaderMap) -> bool {
    matches!(authed(state, headers), Auth::Ok)
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

/// Everything the studio edits, in the camelCase shape of the public contract.
fn editable_json(cfg: &Config) -> serde_json::Value {
    let keys = |v: &[nostr::prelude::PublicKey]| v.iter().map(|k| k.to_hex()).collect::<Vec<_>>();
    serde_json::json!({
        "title": cfg.title,
        "creators": keys(&cfg.creators),
        "allowedWriters": keys(&cfg.allowed_writers),
        "videoSources": cfg.video_sources,
        "interactionRelays": cfg.interaction_relays,
        "search": cfg.search,
        "storage": { "quotaGib": cfg.storage.quota_gib, "freeSpaceReserveGib": cfg.storage.free_space_reserve_gib },
        "site": cfg.public_json()["site"],
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ConfigPut {
    title: String,
    creators: Vec<String>,
    allowed_writers: Vec<String>,
    video_sources: Vec<String>,
    interaction_relays: Vec<String>,
    search: Search,
    storage: StorageBody,
    site: SiteBody,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct StorageBody {
    quota_gib: u64,
    free_space_reserve_gib: u64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SiteBody {
    tagline: String,
    theme: ThemeBody,
    videos: VideosBody,
    links: LinksBody,
}

/// All three are required: an empty `links` object must not silently mean the defaults.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LinksBody {
    profile: String,
    video: String,
    note: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ThemeBody {
    accent: String,
    font: config::Font,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VideosBody {
    hidden: Vec<String>,
}

/// The config for the studio plus what it shows read-only (origin, TLS, boot id, bound key).
async fn config_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    let cfg = match Config::load(&state.data.join("config.toml")) {
        Ok(c) => c,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let tls = match &cfg.tls {
        config::Tls::LocalCa { router_name, https_port, http_port } => format!(
            "local-ca · https :{https_port} · http :{http_port} · router name {}",
            router_name.as_deref().unwrap_or("—")
        ),
        config::Tls::Proxy { port } => format!("proxy · plain HTTP :{port}, TLS at the reverse proxy"),
    };
    let tls_mode = match &cfg.tls {
        config::Tls::LocalCa { .. } => "local-ca",
        config::Tls::Proxy { .. } => "proxy",
    };
    let nostr = state.secrets.lock().unwrap().nostr_pubkey.clone();
    Json(serde_json::json!({
        "revision": cfg.revision,
        "origin": cfg.origin,
        "tls": tls,
        "tlsMode": tls_mode,
        "bootId": state.boot_id,
        "nostrPubkey": nostr,
        "config": editable_json(&cfg),
    }))
    .into_response()
}

/// Saves the edited config: validates everything, keeps `config.prev`, restarts the instance.
/// The body must be JSON (a cross-site form post cannot send that), and the session cookie is
/// SameSite=Strict. Origin, TLS and the revision are not editable.
async fn config_put(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    let is_json = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"));
    if !is_json {
        return json_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, "content-type must be application/json");
    }
    let put: ConfigPut = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {e}")),
    };
    let current = match Config::load(&state.data.join("config.toml")) {
        Ok(c) => c,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let edited = Edited {
        title: put.title,
        creators: put.creators,
        allowed_writers: put.allowed_writers,
        video_sources: put.video_sources,
        interaction_relays: put.interaction_relays,
        search: put.search,
        storage: Storage {
            quota_gib: put.storage.quota_gib,
            free_space_reserve_gib: put.storage.free_space_reserve_gib,
        },
        site: config::Site {
            tagline: put.site.tagline,
            accent: put.site.theme.accent,
            font: put.site.theme.font,
            hidden_videos: put.site.videos.hidden,
            links: config::Links {
                profile: put.site.links.profile,
                video: put.site.links.video,
                note: put.site.links.note,
            },
        },
    };
    // Validate first; nothing is written unless the whole edit checks out (#7).
    let next = match current.with_edits(&edited) {
        Ok(c) => c,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &e.to_string()),
    };
    if let Err(e) = apply(&state, &next) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }
    Json(serde_json::json!({ "ok": true, "revision": next.revision })).into_response()
}

// ── Config apply ────────────────────────────────────────────────────────────

/// Writes the validated config (keeping `config.prev`) and stops the listener so the supervisor
/// restarts the process on it. Used by the studio endpoint.
fn apply(state: &AdminState, next: &Config) -> Result<(), String> {
    if let Some(e) = preflight(state, &next.tls) {
        return Err(format!("preflight failed: {e}"));
    }
    let path = state.data.join("config.toml");
    std::fs::copy(&path, state.data.join("config.prev")).map_err(|e| format!("cannot keep config.prev: {e}"))?;
    let text = next.to_toml().map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("cannot write config: {e}"))?;
    tracing::info!("admin: config revision {} applied; restarting", next.revision);
    // The response must reach the browser before the listener stops accepting.
    let handle = state.handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        // New connections are refused immediately; in-flight uploads keep up to 30 s (#7).
        handle.graceful_shutdown(Some(Duration::from_secs(30)));
    });
    Ok(())
}

/// The studio cannot change listeners; startup validates their bind addresses.
/// Preflight checks TLS material (local CA only) and writable storage before a config is applied.
fn preflight(state: &AdminState, tls: &config::Tls) -> Option<String> {
    // Only the local CA keeps TLS material in the data dir; behind a proxy there is none.
    if matches!(tls, config::Tls::LocalCa { .. }) {
        for file in ["ca.pem", "ca-key.pem", "leaf.pem"] {
            let p = state.data.join("tls").join(file);
            if std::fs::File::open(&p).is_err() {
                return Some(format!("cannot read {}", p.display()));
            }
        }
    }
    let probe = state.data.join(".preflight");
    match std::fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            None
        }
        Err(e) => Some(format!("data dir not writable: {e}")),
    }
}

/// `nostube-server config rollback` (#7): put `config.prev` back in place.
pub fn rollback(data: &Path) -> Result<(), BoxError> {
    let toml_path = data.join("config.toml");
    let prev = data.join("config.prev");
    if !prev.exists() {
        return Err(format!("no {} to roll back to", prev.display()).into());
    }
    std::fs::copy(&prev, &toml_path)?;
    std::fs::remove_file(&prev)?;
    println!("config restored from config.prev; restart the service to apply");
    Ok(())
}

// ── HTML helpers ────────────────────────────────────────────────────────────

fn set_cookie_redirect(secret: &str, to: &str) -> Response {
    (
        [(header::SET_COOKIE, session_cookie(secret)), (header::LOCATION, to.to_owned())],
        StatusCode::SEE_OTHER,
    )
        .into_response()
}

fn constant_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn page(title: &str, body: &str) -> Html<String> {
    Html(format!(
        r#"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{title} · nostube admin</title><style>
body{{font:16px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:44rem;padding:0 1rem;color:#111}}
h1,h2{{font-size:1.25rem}} h2{{margin-top:2rem}}
label{{display:block;margin:1rem 0}} input,textarea,select{{display:block;width:100%;max-width:28rem;margin-top:.25rem;padding:.4rem;font:inherit;border:1px solid #bbb;border-radius:4px}}
button{{padding:.45rem 1rem;font:inherit;border:1px solid #333;border-radius:6px;background:#4f46e5;color:#fff;cursor:pointer}}
code{{background:#f3f3f3;padding:.1rem .3rem;border-radius:3px}} .error{{color:#b91c1c}}
</style></head><body>{body}</body></html>"#,
        title = esc(title),
    ))
}

fn setup_form(error: Option<&str>) -> String {
    let error = error.map(|e| format!("<p class=error>{}</p>", esc(e))).unwrap_or_default();
    format!(
        r#"{error}<h1>Register the admin</h1>
<p>One-time setup. The token is in the instance log (or came from <code>nostube-server admin reset</code>).</p>
<form method=post action=/admin/setup>
  <label>Setup token <input name=token required></label>
  <label>Password <small>(at least 8 characters)</small> <input name=password type=password required></label>
  <label>Repeat password <input name=password2 type=password required></label>
  <button>Register</button>
</form>
<script>
const token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) {{
  document.querySelector('input[name=token]').value = token;
  history.replaceState(null, '', location.pathname);
}}
</script>"#
    )
}

fn login_form(error: Option<&str>, nostr: bool) -> String {
    let error = error.map(|e| format!("<p class=error>{}</p>", esc(e))).unwrap_or_default();
    let nostr = if nostr {
        r#"<p>or <button onclick="bindNostr('/admin/login/nostr')">Log in with NIP-07</button></p>
<script>
async function bindNostr(path) {{
  const ev = await window.nostr.signEvent({{
    kind: 27235, created_at: Math.floor(Date.now() / 1000), tags: [['u', location.origin + path], ['method', 'POST']], content: '',
  }});
  const res = await fetch(path, {{ method: 'POST', headers: {{ Authorization: 'Nostr ' + btoa(JSON.stringify(ev)) }} }});
  if (res.ok) location.href = '/admin'; else alert(await res.text());
}}
</script>"#
    } else {
        ""
    };
    format!(
        r#"{error}<h1>Admin log in</h1>
<form method=post action=/admin/login>
  <label>Password <input name=password type=password required></label>
  <button>Log in</button>
</form>{nostr}"#
    )
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_tokens_sign_verify_and_expire() {
        let secret = "abcdef";
        let cookie = sign_session(secret, 1000);
        assert!(verify_session(secret, &cookie).is_err()); // expired
        let cookie = sign_session(secret, now_secs() + 3600);
        assert!(verify_session(secret, &cookie).is_ok());
        assert!(verify_session(secret, &format!("{cookie}x")).is_err());
        assert!(verify_session("other", &cookie).is_err());
    }

    #[test]
    fn setup_login_and_bind_flow() {
        let dir = std::env::temp_dir().join(format!("nss-admin-test-{}", random_hex(4)));
        std::fs::create_dir_all(&dir).unwrap();
        let mut s = Secrets::create(&dir).unwrap();
        assert!(!s.registered());
        let token = s.setup_token.clone().unwrap();
        s.password_hash = Some(password_hash("correct horse").unwrap());
        s.setup_token = None;
        s.save(&dir).unwrap();
        let reloaded = Secrets::load(&dir).unwrap();
        assert!(reloaded.registered());
        assert!(reloaded.setup_token.is_none());
        assert!(password_ok(reloaded.password_hash.as_deref().unwrap(), "correct horse"));
        assert!(!password_ok(reloaded.password_hash.as_deref().unwrap(), "wrong"));
        assert!(constant_eq(&token, &token));
        assert!(!constant_eq(&token, "nope"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn broken_secrets_disable_admin() {
        let dir = std::env::temp_dir().join(format!("nss-admin-test-{}", random_hex(4)));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(Secrets::path(&dir), "not [ valid toml").unwrap();
        assert!(Secrets::load(&dir).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rollback_swaps_prev_back() {
        let dir = std::env::temp_dir().join(format!("nss-admin-test-{}", random_hex(4)));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("config.toml"), "bad = true").unwrap();
        assert!(rollback(&dir).is_err()); // no prev yet
        std::fs::write(dir.join("config.prev"), "revision = 1\n").unwrap();
        rollback(&dir).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("config.toml")).unwrap(), "revision = 1\n");
        assert!(!dir.join("config.prev").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn nip98_events_must_match_instance_path_and_host() {
        use nostr::prelude::*;
        let dir = std::env::temp_dir().join(format!("nss-admin-test-{}", random_hex(4)));
        std::fs::create_dir_all(&dir).unwrap();
        let state = AdminState::open(
            &dir,
            "macbook-2.local",
            vec!["macbook-2.local".into(), "192.168.0.32".into()],
            "https://macbook-2.local",
            "boot".into(),
            Arc::new(axum_server::Handle::new()),
        )
        .unwrap();
        let keys = Keys::generate();
        use base64::Engine;
        let auth = |path: &str, host: &str| {
            let event = EventBuilder::new(Kind::HttpAuth, "")
                .tag(Tag::custom("u", [format!("https://{host}{path}")]))
                .tag(Tag::custom("method", ["POST"]))
                .finalize(&keys)
                .unwrap();
            format!("Nostr {}", base64::engine::general_purpose::STANDARD.encode(event.as_json()))
        };
        let headers = |v: String| HeaderMap::from_iter([(header::AUTHORIZATION, v.parse().unwrap())]);
        assert_eq!(
            verify_nip98(&state, &headers(auth("/admin/login/nostr", "macbook-2.local")), "/admin/login/nostr").unwrap(),
            keys.public_key()
        );
        // The LAN IP is a covered alias.
        assert!(verify_nip98(&state, &headers(auth("/admin/login/nostr", "192.168.0.32")), "/admin/login/nostr").is_ok());
        // Wrong path, foreign host, and missing header are all refused.
        assert!(verify_nip98(&state, &headers(auth("/admin/config", "macbook-2.local")), "/admin/login/nostr").is_err());
        assert!(verify_nip98(&state, &headers(auth("/admin/login/nostr", "evil.example")), "/admin/login/nostr").is_err());
        assert!(verify_nip98(&state, &HeaderMap::new(), "/admin/login/nostr").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    // ── studio API ──

    const PK: &str = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";

    /// A data dir with a valid config, TLS placeholder files and a registered admin; returns the
    /// router and a valid session cookie.
    fn studio_fixture() -> (Router, PathBuf, String) {
        studio_fixture_for("{ mode = \"local-ca\" }", true)
    }

    /// `tls` is the TOML value of `tls`; `tls_files` writes the placeholder CA files.
    fn studio_fixture_for(tls: &str, tls_files: bool) -> (Router, PathBuf, String) {
        let dir = std::env::temp_dir().join(format!("nss-studio-test-{}", random_hex(4)));
        std::fs::create_dir_all(dir.join("tls")).unwrap();
        if tls_files {
            for f in ["ca.pem", "ca-key.pem", "leaf.pem"] {
                std::fs::write(dir.join("tls").join(f), "x").unwrap();
            }
        }
        std::fs::write(
            dir.join("config.toml"),
            format!(
                "revision = 4\norigin = \"https://flox-mac.local\"\ntitle = \"Flox\"\ncreators = [\"{PK}\"]\nallowed_writers = [\"{PK}\"]\nvideo_sources = [\"wss://flox-mac.local\"]\ninteraction_relays = []\nsearch = {{ mode = \"off\" }}\ntls = {tls}\n[storage]\nquota_gib = 7\nfree_space_reserve_gib = 2\n"
            ),
        )
        .unwrap();
        let mut s = Secrets::create(&dir).unwrap();
        s.password_hash = Some(password_hash("correct horse").unwrap());
        s.setup_token = None;
        s.save(&dir).unwrap();
        let secret = s.session_secret.clone();
        let state = AdminState::open(
            &dir,
            "flox-mac.local",
            vec!["flox-mac.local".into()],
            "https://flox-mac.local",
            "boot".into(),
            Arc::new(axum_server::Handle::new()),
        )
        .unwrap();
        let cookie = session_cookie(&secret).split(';').next().unwrap().to_owned();
        (router(state), dir, cookie)
    }

    async fn call(app: &Router, method: &str, cookie: Option<&str>, content_type: Option<&str>, body: &str) -> (StatusCode, serde_json::Value) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().method(method).uri("/api/admin/config");
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        if let Some(t) = content_type {
            req = req.header(header::CONTENT_TYPE, t);
        }
        let res = app.clone().oneshot(req.body(axum::body::Body::from(body.to_owned())).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    fn put_value(accent: &str) -> serde_json::Value {
        serde_json::json!({
            "title": "Renamed",
            "creators": [PK],
            "allowedWriters": [PK],
            "videoSources": ["wss://flox-mac.local", "wss://relay.example"],
            "interactionRelays": ["wss://relay.example"],
            "search": { "mode": "external", "url": "https://search.example" },
            "storage": { "quotaGib": 100, "freeSpaceReserveGib": 3 },
            "site": { "tagline": "Hi", "theme": { "accent": accent, "font": "mono" }, "videos": { "hidden": [format!("34235:{PK}:intro")] }, "links": { "profile": "https://example.org/p/{nip19}", "video": "https://example.org/v/{nip19}", "note": "https://example.org/n/{nip19}" } }
        })
    }

    fn put_body(accent: &str) -> String {
        put_value(accent).to_string()
    }

    #[tokio::test]
    async fn studio_api_needs_a_session_and_answers_json() {
        let (app, dir, _cookie) = studio_fixture();
        let (status, body) = call(&app, "GET", None, None, "").await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"], "not logged in");
        let (status, _) = call(&app, "PUT", None, Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn studio_api_reads_the_site_settings() {
        let (app, dir, cookie) = studio_fixture();
        let (status, body) = call(&app, "GET", Some(&cookie), None, "").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["revision"], 4);
        assert_eq!(body["origin"], "https://flox-mac.local");
        assert_eq!(body["bootId"], "boot");
        assert!(body["nostrPubkey"].is_null());
        assert_eq!(body["config"]["title"], "Flox");
        assert_eq!(body["config"]["creators"][0], PK);
        assert_eq!(body["config"]["storage"]["quotaGib"], 7);
        assert_eq!(body["config"]["site"]["theme"]["font"], "sans");
        // What the studio reads is accepted as it is when saved back.
        let (status, _) = call(&app, "PUT", Some(&cookie), Some("application/json"), &body["config"].to_string()).await;
        assert_eq!(status, StatusCode::OK);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn studio_api_rejects_bad_requests_without_touching_the_config() {
        let (app, dir, cookie) = studio_fixture();
        let before = std::fs::read(dir.join("config.toml")).unwrap();
        let json = Some("application/json");
        for (ct, body) in [
            (json, put_body("red")),
            (json, put_body("#12345")),
            (json, "not json".to_owned()),
            (json, put_body("#112233").replace("\"title\"", "\"extra\":1,\"title\"")),
            (json, put_body("#112233").replace("mono", "comic")),
            (json, put_body("#112233").replace("Renamed", "  ")),
            (json, {
                let mut v = put_value("#112233");
                v["site"]["links"] = serde_json::json!({});
                v.to_string()
            }),
            (json, put_body("#112233").replace("https://example.org/p/{nip19}", "http://example.org/p/{nip19}")),
            (json, put_body("#112233").replace("https://example.org/n/{nip19}", "https://example.org/n/")),
            (json, {
                let mut v = put_value("#112233");
                v.as_object_mut().unwrap().remove("storage");
                v.to_string()
            }),
            (json, put_body("#112233").replace("wss://relay.example", "https://relay.example")),
            (json, put_body("#112233").replace(&format!("\"creators\":[\"{PK}\"]"), "\"creators\":[\"nope\"]")),
            (Some("text/plain"), put_body("#112233")),
            (None, put_body("#112233")),
        ] {
            let (status, _) = call(&app, "PUT", Some(&cookie), ct, &body).await;
            assert!(status.is_client_error(), "{ct:?} {body}");
        }
        assert_eq!(std::fs::read(dir.join("config.toml")).unwrap(), before);
        assert!(!dir.join("config.prev").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn studio_api_applies_the_edit_and_keeps_origin_and_tls() {
        let (app, dir, cookie) = studio_fixture();
        let before = Config::load(&dir.join("config.toml")).unwrap();
        let (status, body) = call(&app, "PUT", Some(&cookie), Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["revision"], 5);
        assert!(dir.join("config.prev").exists());
        let after = Config::load(&dir.join("config.toml")).unwrap();
        assert_eq!((after.revision, after.title.as_str()), (5, "Renamed"));
        assert_eq!((after.site.accent.as_str(), after.site.tagline.as_str()), ("#112233", "Hi"));
        assert_eq!(after.site.hidden_videos, vec![format!("34235:{PK}:intro")]);
        assert_eq!(after.site.links.video, "https://example.org/v/{nip19}");
        assert_eq!(after.video_sources, vec!["wss://flox-mac.local", "wss://relay.example"]);
        assert_eq!(after.interaction_relays, vec!["wss://relay.example"]);
        assert_eq!(after.search, Search::External { url: "https://search.example".into() });
        assert_eq!((after.storage.quota_gib, after.storage.free_space_reserve_gib), (100, 3));
        // Not editable: origin and TLS.
        assert_eq!(after.origin, before.origin);
        assert!(matches!(after.tls, config::Tls::LocalCa { .. }));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn behind_a_proxy_saving_needs_no_tls_files() {
        let (app, dir, cookie) = studio_fixture_for("{ mode = \"proxy\", port = 8080 }", false);
        assert!(!dir.join("tls").join("ca.pem").exists());
        let (status, body) = call(&app, "GET", Some(&cookie), None, "").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["tlsMode"], "proxy");
        assert!(body["tls"].as_str().unwrap().contains("proxy"));
        let (status, body) = call(&app, "PUT", Some(&cookie), Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(dir.join("config.prev").exists());
        let after = Config::load(&dir.join("config.toml")).unwrap();
        assert!(matches!(after.tls, config::Tls::Proxy { port: 8080 }));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn with_a_local_ca_missing_tls_files_still_block_saving() {
        let (app, dir, cookie) = studio_fixture_for("{ mode = \"local-ca\" }", false);
        let (status, _) = call(&app, "PUT", Some(&cookie), Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        std::fs::remove_dir_all(&dir).ok();
    }
}
