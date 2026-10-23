//! Admin area (/admin, ADR 0002): one admin with a mandatory password (argon2id),
//! an optional bound NIP-07 key, one server-side session; setup via the one-time
//! setup token. The registered admin may edit the config (#17) and apply it:
//! validate + preflight, config.prev, then the public config and the relay's name change
//! while running; writers, storage and mirror changes exit the process so the supervisor
//! restarts it (#7).

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2, PasswordHash, PasswordVerifier,
};
use axum::{
    extract::{Form, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use hmac::{Hmac, Mac};
use nostr::prelude::{Event, Keys, PublicKey};
use serde::Deserialize;
use sha2::Sha256;

use crate::config::{self, Config, Edited, Search, Storage};
use crate::login_guard::{self, LoginGuard};
use crate::relay::Relay;

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
    /// The managed signer's key as a NIP-49 `ncryptsec` (ADR 0007); its password is in
    /// `signer.key`. An admin reset keeps it: the identity outlives a forgotten password.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    managed_key: Option<String>,
    /// The S3 secret access key of `storage.s3` (#171); write-only from the studio.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    s3_secret_access_key: Option<String>,
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
        let path = Self::path(data);
        let temp = path.with_extension("toml.tmp");
        write_private(&temp, &toml::to_string_pretty(self)?)?;
        std::fs::rename(temp, path)?;
        Ok(())
    }

    fn registered(&self) -> bool {
        self.password_hash.is_some()
    }
}

/// The stored S3 secret access key for `main`'s Almond settings; `None` without a secrets file.
pub fn s3_secret(data: &Path) -> Result<Option<String>, BoxError> {
    if !Secrets::path(data).exists() {
        return Ok(None);
    }
    Ok(Secrets::load(data)?.s3_secret_access_key)
}

/// The running relay and Blossom, read (never changed) by the stats endpoint, and the branding
/// the studio replaces while the instance runs.
pub struct Stores {
    pub relay: Relay,
    /// Its `public_url` is the canonical origin (`main` sets it so).
    pub blossom: almond::AppState,
    /// Shared with `main`, which serves the images and the public config from it.
    pub branding: Arc<crate::branding::Branding>,
    /// Mirror status and retries (ADR 0009).
    pub outbox: crate::outbox::Outbox,
    pub nsite: crate::nsite::Nsite,
    /// Moves local uploads into the bucket (#174).
    pub migration: Arc<crate::storage_move::Migration>,
}

/// Admin state shared with the axum router.
pub struct AdminState {
    data: PathBuf,
    secrets: Arc<Mutex<Secrets>>,
    /// Serialize probe + apply: a concurrent save must not pair another edit with this secret.
    config_edit: tokio::sync::Mutex<()>,
    origin_host: String,
    /// Every host the TLS leaf covers; admin NIP-98 events may target any of them.
    covered_hosts: Vec<String>,
    boot_id: String,
    handle: Arc<axum_server::Handle<std::net::SocketAddr>>,
    /// Slows down password guessing; one count for the whole instance (see `login_guard`).
    login_guard: Mutex<LoginGuard>,
    stores: Stores,
    /// The unlocked managed key; shared with the outbox, which signs mirror requests with it.
    managed: crate::signer::Shared,
    /// Session cookies carry `Secure` unless the canonical origin is plain `http://` (FIPS mesh).
    secure_cookies: bool,
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
        stores: Stores,
    ) -> Result<AdminState, BoxError> {
        let secrets = if Secrets::path(data).exists() {
            Secrets::load(data)?
        } else {
            Secrets::create(data)?
        };
        let managed = secrets.managed_key.as_deref().map(|ncryptsec| {
            let keys = signer_password(data, false).and_then(|pw| crate::signer::decrypt(ncryptsec, &pw));
            if let Err(e) = &keys {
                // Signing and the export fail with this; everything else keeps working.
                tracing::error!("managed signer: {e}");
            }
            keys
        });
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
            config_edit: tokio::sync::Mutex::new(()),
            origin_host: origin_host.to_owned(),
            covered_hosts,
            boot_id,
            handle,
            login_guard: Mutex::new(LoginGuard::default()),
            stores,
            managed: Arc::new(parking_lot::Mutex::new(managed)),
            secure_cookies: !setup_origin.starts_with("http://"),
        })
    }

    /// The managed key holder, for the outbox; a key created later in the studio shows up there.
    pub fn signer(&self) -> crate::signer::Shared {
        self.managed.clone()
    }

    /// Rebuilds the channel profile (and in public reach the relay list) from the settings (#129,
    /// ADR 0012); signs nothing in own identity.
    async fn sync_profile(&self) {
        crate::profile::sync(&self.stores.relay, &self.stores.branding, &self.stores.outbox, &self.managed).await;
        if let Err(error) = self.stores.nsite.request(&self.stores.branding.public_config()).await {
            tracing::warn!("nsite: cannot request rebuild: {error}");
        }
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

/// The session cookie; `Secure` only drops for an explicit `http://` origin, where browsers
/// would refuse to store it.
fn cookie(secure: bool, value: &str, max_age: u64) -> String {
    let secure = if secure { " Secure;" } else { "" };
    format!("{COOKIE}={value}; HttpOnly;{secure} SameSite=Strict; Path=/; Max-Age={max_age}")
}

fn session_cookie(secret_hex: &str, secure: bool) -> String {
    let expires = now_secs() + SESSION_TTL.as_secs();
    cookie(secure, &sign_session(secret_hex, expires), SESSION_TTL.as_secs())
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

/// The password of the managed key's ncryptsec: 256 random bits in `<data>/signer.key`, kept
/// apart from `secrets.toml` so that a copy of that file alone does not hold the identity
/// (ADR 0007). `create` makes the file when there is none.
fn signer_password(data: &Path, create: bool) -> Result<String, String> {
    let path = data.join("signer.key");
    match std::fs::read_to_string(&path) {
        Ok(text) if !text.trim().is_empty() => Ok(text.trim().to_owned()),
        Ok(_) => Err(format!("{} is empty", path.display())),
        Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => {
            let password = random_hex(32);
            write_private(&path, &password).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
            Ok(password)
        }
        Err(e) => Err(format!("cannot read {}: {e}", path.display())),
    }
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
        .route("/api/admin/stats", get(stats_get))
        .route("/api/admin/plays", get(plays_get))
        .route("/api/admin/signer", get(signer_get).post(signer_create))
        .route("/api/admin/signer/sign", post(signer_sign))
        .route("/api/admin/signer/export", post(signer_export))
        .route("/api/admin/branding/{slot}", axum::routing::put(branding_put).delete(branding_delete))
        .route("/api/admin/outbox", get(outbox_get))
        .route("/api/admin/outbox/retry", post(outbox_retry))
        .route("/api/admin/nsite", get(nsite_get))
        .route("/api/admin/nsite/publish", post(nsite_publish))
        .route("/api/admin/media/mirrors", post(media_mirrors))
        .route("/api/admin/schedule", get(schedule_get).post(schedule_post))
        .route("/api/admin/schedule/cancel", post(schedule_cancel))
        .route("/api/admin/storage", get(storage_get))
        .route("/api/admin/storage/test", post(storage_test))
        .route("/api/admin/storage/move", post(storage_move))
        .with_state(state)
        .layer(axum::middleware::map_response(no_store))
}

/// Admin answers belong to one session: a shared cache (a CDN in front of the instance) must
/// neither keep them nor hand them to another visitor.
async fn no_store(mut res: Response) -> Response {
    res.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("private, no-store"));
    res
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
    set_cookie_redirect(&state, &secret, "/admin").into_response()
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
    // One attempt at a time, from the check to the bookkeeping: if the check and the count were
    // separate steps, a burst of parallel requests would all pass the check before the first
    // wrong password was counted. Nothing in here waits (no `.await`), so the lock is short.
    let mut guard = state.login_guard.lock().unwrap();
    let now = Instant::now();
    if let Err(wait) = guard.check(now) {
        let nostr = state.secrets.lock().unwrap().nostr_pubkey.is_some();
        drop(guard);
        return too_many_attempts(wait, nostr);
    }
    let secrets = state.secrets.lock().unwrap();
    let ok = secrets.password_hash.as_deref().is_some_and(|h| password_ok(h, &f.password));
    if !ok {
        let nostr = secrets.nostr_pubkey.is_some();
        drop(secrets);
        let wait = guard.record_failure(now);
        let failures = guard.failures();
        drop(guard);
        tracing::warn!("admin login: wrong password ({failures} in a row)");
        // Same page for wrong passwords; no detail for guessing.
        let message = match wait {
            Some(wait) => format!("Wrong password. Wait {} before the next try.", login_guard::describe(wait)),
            None => "Wrong password.".to_owned(),
        };
        return page("Log in", &login_form(Some(&message), nostr)).into_response();
    }
    guard.record_success();
    drop(guard);
    let secret = secrets.session_secret.clone();
    drop(secrets);
    set_cookie_redirect(&state, &secret, "/admin").into_response()
}

/// 429 with `Retry-After`; the password was not looked at.
fn too_many_attempts(wait: std::time::Duration, nostr: bool) -> Response {
    let message = format!(
        "Too many wrong passwords. Try again in {}.{}",
        login_guard::describe(wait),
        if nostr { " Logging in with your Nostr key still works." } else { "" }
    );
    (
        StatusCode::TOO_MANY_REQUESTS,
        [(header::RETRY_AFTER, wait.as_secs_f64().ceil().to_string())],
        page("Log in", &login_form(Some(&message), nostr)),
    )
        .into_response()
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
    set_cookie_redirect(&state, &secret, "/admin").into_response()
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

async fn logout(State(state): State<Arc<AdminState>>) -> Response {
    (
        [
            (header::SET_COOKIE, cookie(state.secure_cookies, "", 0)),
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

/// The gate of every studio write: a live session, and a JSON body (a cross-site form post cannot
/// send that; the session cookie is SameSite=Strict as well). `Some` is the refusal.
fn refuse_write(state: &AdminState, headers: &HeaderMap) -> Option<Response> {
    refuse_write_as(state, headers, "application/json")
}

/// `refuse_write` for a body of another type (`image/*`: any image type). A cross-site form can
/// only send form and text types, so these keep the same guarantee.
fn refuse_write_as(state: &AdminState, headers: &HeaderMap, content_type: &str) -> Option<Response> {
    if !is_authed(state, headers) {
        return Some(json_error(StatusCode::UNAUTHORIZED, "not logged in"));
    }
    let accepted = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with(content_type.trim_end_matches('*')));
    (!accepted).then(|| json_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, &format!("content-type must be {content_type}")))
}

/// Everything the studio edits, in the camelCase shape of the public contract. The S3 secret
/// never leaves the server: `secretSet` says whether one is stored.
fn editable_json(cfg: &Config, secret_set: bool) -> serde_json::Value {
    let keys = |v: &[nostr::prelude::PublicKey]| v.iter().map(|k| k.to_hex()).collect::<Vec<_>>();
    let s3 = cfg.storage.s3.as_ref().map(|s3| {
        serde_json::json!({
            "endpoint": s3.endpoint,
            "bucket": s3.bucket,
            "region": s3.region,
            "forcePathStyle": s3.force_path_style,
            "accessKeyId": s3.access_key_id,
            "secretSet": secret_set,
        })
    });
    serde_json::json!({
        "title": cfg.title,
        "reach": cfg.reach,
        "creators": keys(&cfg.creators),
        "allowedWriters": keys(&cfg.allowed_writers),
        "videoSources": cfg.video_sources,
        "interactionRelays": cfg.interaction_relays,
        "profileRelays": cfg.profile_relays,
        "search": cfg.search,
        "storage": {
            "quotaGib": cfg.storage.quota_gib,
            "freeSpaceReserveGib": cfg.storage.free_space_reserve_gib,
            "s3": s3,
        },
        "site": cfg.public_json()["site"],
        "mirror": cfg.mirror,
        "siteHosting": cfg.site_hosting,
        "nsite": cfg.nsite,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ConfigPut {
    title: String,
    reach: config::Reach,
    creators: Vec<String>,
    allowed_writers: Vec<String>,
    video_sources: Vec<String>,
    interaction_relays: Vec<String>,
    profile_relays: Vec<String>,
    search: Search,
    storage: StorageBody,
    site: SiteBody,
    mirror: config::Mirror,
    site_hosting: config::SiteHosting,
    nsite: config::NsiteSettings,
    delete_nsite: Option<bool>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct StorageBody {
    quota_gib: u64,
    free_space_reserve_gib: u64,
    /// Absent or null: this machine only (studios from before S3 send neither).
    #[serde(default)]
    s3: Option<S3Body>,
}

/// `storage.s3` of a config save, and the body of the connection test.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct S3Body {
    endpoint: String,
    bucket: String,
    #[serde(default = "config::s3_region")]
    region: String,
    #[serde(default)]
    force_path_style: bool,
    access_key_id: String,
    /// Write-only; absent keeps the stored secret, empty is refused.
    #[serde(default)]
    secret_access_key: Option<String>,
    /// Read-only (what GET answers); a studio may send its draft back unchanged.
    #[serde(default, rename = "secretSet")]
    _secret_set: Option<serde::de::IgnoredAny>,
}

impl S3Body {
    fn config(&self) -> config::S3Config {
        config::S3Config {
            endpoint: self.endpoint.clone(),
            bucket: self.bucket.clone(),
            region: self.region.clone(),
            force_path_style: self.force_path_style,
            access_key_id: self.access_key_id.clone(),
        }
    }

    /// The given secret, else the stored one. `Err` is the refusal (empty, or none at all).
    fn secret(&self, state: &AdminState) -> Result<String, String> {
        match self.secret_access_key.as_deref() {
            Some("") => Err("secretAccessKey must not be empty".into()),
            Some(secret) => Ok(secret.to_owned()),
            None => state.secrets.lock().unwrap().s3_secret_access_key.clone()
                .ok_or_else(|| "secretAccessKey is required: none is stored yet".into()),
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SiteBody {
    tagline: String,
    theme: ThemeBody,
    videos: VideosBody,
    links: LinksBody,
    /// Required like `links`: a PUT without it must not silently erase the pages.
    pages: config::Pages,
    /// Required too: a PUT without it must not silently drop the lightning address.
    lightning: String,
    /// Optional for studios from before the play counter: absent keeps counting off.
    #[serde(default, rename = "countPlays")]
    count_plays: bool,
    /// Optional for studios from before it (no curation then); given, every field is required.
    #[serde(default)]
    homepage: HomepageBody,
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HomepageBody {
    intro: String,
    featured: String,
    featured_text: String,
    selected: Vec<String>,
    links: Vec<config::HomepageLink>,
    /// Required (may be null), not implied by omission.
    #[serde(deserialize_with = "Option::deserialize")]
    action: Option<config::HomepageLink>,
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

/// The config for the studio plus what it shows read-only (origin, TLS, boot id, bound key, and
/// whether the origin allows public reach).
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
    let (nostr, secret_set) = {
        let secrets = state.secrets.lock().unwrap();
        (secrets.nostr_pubkey.clone(), secrets.s3_secret_access_key.is_some())
    };
    Json(serde_json::json!({
        "revision": cfg.revision,
        "origin": cfg.origin,
        "tls": tls,
        "canBePublic": cfg.can_be_public(),
        "originIsPublic": cfg.origin_is_public(),
        "tlsMode": tls_mode,
        "bootId": state.boot_id,
        "nostrPubkey": nostr,
        "config": editable_json(&cfg, secret_set),
        "branding": state.stores.branding.urls(),
    }))
    .into_response()
}

/// What the relay and Blossom hold, for the studio overview. Admin only: no public diagnostics.
/// Failures answer 500 rather than zeros. Blossom's upload/download/served counters come from
/// Almond's metrics and count since this process started.
async fn stats_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    let relay = match state.stores.relay.stats().await {
        Ok(r) => r,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("relay stats: {e}")),
    };
    let blossom = &state.stores.blossom;
    let free = match free_disk_bytes(&blossom.storage.root) {
        Ok(f) => f,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("free disk space: {e}")),
    };
    let index = blossom.file_index.stats().await;
    let metrics = &blossom.metrics;
    let origin = &blossom.public_url;
    Json(serde_json::json!({
        "relay": {
            "url": config::relay_url(origin),
            "totalEvents": relay.by_kind.iter().map(|(_, n)| n).sum::<u64>(),
            "eventsByKind": relay.by_kind.iter().map(|(kind, count)| serde_json::json!({ "kind": kind, "count": count })).collect::<Vec<_>>(),
            "databaseBytes": relay.database_bytes,
        },
        "blossom": {
            "url": origin,
            "files": index.count,
            "storageBytes": index.total_bytes,
            "quotaBytes": blossom.max_total_size,
            "freeDiskBytes": free,
            "freeSpaceReserveBytes": blossom.min_free_disk_bytes,
            "uploads": metrics.files_uploaded.get(),
            "downloads": metrics.files_downloaded.get(),
            "servedBytes": metrics.served_bytes.get(),
        },
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PlaysQuery {
    days: Option<u16>,
}

/// Plays per video event (`GET /api/admin/plays?days=N`): the counter the operator switched on
/// (`site.countPlays`), as `{ "<event id>": plays }` over the last `days` UTC days (1..=365,
/// default 365). The counter holds no visitor data — no IP address, no user agent, no cookie —
/// so this says how often files were requested, never who.
async fn plays_get(
    State(state): State<Arc<AdminState>>,
    headers: HeaderMap,
    Query(query): Query<PlaysQuery>,
) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    let days = query.days.filter(|days| (1..=365).contains(days)).unwrap_or(365);
    match state.stores.relay.plays(days).await {
        Ok(plays) => Json(plays).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("play counts: {e}")),
    }
}

/// Space available to unprivileged writers on the filesystem holding `path`: the figure Almond
/// checks the free-space reserve against (`fs4::available_space`, also statvfs).
pub(crate) fn free_disk_bytes(path: &Path) -> std::io::Result<u64> {
    use std::os::unix::ffi::OsStrExt;
    let path = std::ffi::CString::new(path.as_os_str().as_bytes())?;
    // SAFETY: statvfs only writes into the zeroed struct we own; `path` is a valid C string.
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(path.as_ptr(), &mut s) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    // `as`: the field types differ per platform (u32 blocks on macOS, u64 on Linux).
    Ok(s.f_bavail as u64 * s.f_frsize as u64)
}

/// Saves the edited config: validates everything, keeps `config.prev`, applies it (`restart` in
/// the answer says whether the instance restarts for it, see `Config::needs_restart`).
/// The body must be JSON (see `refuse_write`). Origin, TLS and the revision are not editable.
async fn config_put(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let put: ConfigPut = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {e}")),
    };
    let _edit = state.config_edit.lock().await;
    let current = match Config::load(&state.data.join("config.toml")) {
        Ok(c) => c,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    let edited = Edited {
        title: put.title,
        reach: put.reach,
        site_hosting: put.site_hosting,
        nsite: put.nsite,
        creators: put.creators,
        allowed_writers: put.allowed_writers,
        video_sources: put.video_sources,
        interaction_relays: put.interaction_relays,
        profile_relays: put.profile_relays,
        search: put.search,
        storage: Storage {
            quota_gib: put.storage.quota_gib,
            free_space_reserve_gib: put.storage.free_space_reserve_gib,
            s3: put.storage.s3.as_ref().map(S3Body::config),
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
            pages: put.site.pages,
            lightning: put.site.lightning,
            count_plays: put.site.count_plays,
            homepage: config::SiteHomepage {
                intro: put.site.homepage.intro,
                featured: put.site.homepage.featured,
                featured_text: put.site.homepage.featured_text,
                selected: put.site.homepage.selected,
                links: put.site.homepage.links,
                action: put.site.homepage.action,
            },
        },
        mirror: put.mirror,
    };
    // Validate first; nothing is written unless the whole edit checks out (#7).
    let next = match current.with_edits(&edited) {
        Ok(c) => c,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &e.to_string()),
    };
    if next.site_hosting == config::SiteHosting::Nsite {
        match managed_keys(&state) {
            Ok(Some(_)) => {}
            Ok(None) => return json_error(StatusCode::BAD_REQUEST, "nsite needs the managed signing key"),
            Err(error) => return json_error(StatusCode::BAD_REQUEST, &error),
        }
    }
    let disabling = current.site_hosting == config::SiteHosting::Nsite && next.site_hosting != config::SiteHosting::Nsite;
    if disabling && put.delete_nsite.is_none() {
        return json_error(StatusCode::BAD_REQUEST, "choose deleteNsite explicitly: true deletes the nsite, false keeps public copies");
    }
    // S3 preflight (#171): new or changed settings, or a new secret, must pass Almond's probe
    // before anything is written. Unchanged settings save without one, so the rest of the config
    // stays editable while the bucket is unavailable (#173).
    let s3_secret = match (&next.storage.s3, &put.storage.s3) {
        (Some(s3), Some(body)) => {
            let secret = match body.secret(&state) {
                Ok(secret) => secret,
                Err(e) => return json_error(StatusCode::BAD_REQUEST, &e),
            };
            if current.storage.s3.as_ref() != Some(s3) || body.secret_access_key.is_some() {
                if let Err((step, error)) = probe_s3(s3.settings(secret.clone())).await {
                    let message = format!("preflight failed: S3 connection test failed at {step}: {error}");
                    return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": message, "step": step }))).into_response();
                }
            }
            body.secret_access_key.is_some().then_some(secret)
        }
        _ => None,
    };
    let restart = match apply(&state, &current, &next, s3_secret.as_deref()) {
        Ok(restart) => restart,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    if disabling {
        if let Err(error) = state.stores.nsite.disable(put.delete_nsite == Some(true), &state.stores.outbox).await {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error);
        }
    }
    // A restart syncs at startup.
    if !restart {
        state.sync_profile().await;
    }
    Json(serde_json::json!({ "ok": true, "revision": next.revision, "restart": restart })).into_response()
}

async fn nsite_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !is_authed(&state, &headers) { return json_error(StatusCode::UNAUTHORIZED, "not logged in"); }
    match state.stores.nsite.status(&state.stores.branding.public_config(), &state.managed, &state.stores.outbox).await {
        Ok(status) => Json(status).into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyBody {}

async fn nsite_publish(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) { return refusal; }
    if let Err(error) = serde_json::from_slice::<EmptyBody>(&body) { return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {error}")); }
    match managed_keys(&state) {
        Ok(Some(_)) => {}
        Ok(None) => return json_error(StatusCode::BAD_REQUEST, "nsite needs the managed signing key"),
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &error),
    }
    let cfg = match Config::load(&state.data.join("config.toml")) {
        Ok(cfg) => cfg,
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error.to_string()),
    };
    if cfg.site_hosting != config::SiteHosting::Nsite || cfg.reach != config::Reach::Public {
        return json_error(StatusCode::BAD_REQUEST, "save site hosting nsite in public reach before publishing");
    }
    match state.stores.nsite.request(&state.stores.branding.public_config()).await {
        Ok(()) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &error),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MirrorsBody { hashes: Vec<String> }

async fn media_mirrors(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) { return refusal; }
    let put: MirrorsBody = match serde_json::from_slice(&body) {
        Ok(put) => put,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {error}")),
    };
    if put.hashes.iter().any(|h| almond::services::file_storage::validate_sha256_format(h).is_err()) {
        return json_error(StatusCode::BAD_REQUEST, "hashes must be Blossom sha256 values");
    }
    let cfg = match Config::load(&state.data.join("config.toml")) {
        Ok(cfg) => cfg,
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error.to_string()),
    };
    let _guard = crate::outbox::MEDIA_LIFECYCLE.lock().await;
    let mut urls = serde_json::Map::new();
    let mut ready = true;
    let mut problem: Option<String> = None;
    let public_servers = cfg.public_mirror().blossom;
    for hash in put.hashes {
        let Some(metadata) = state.stores.blossom.file_index.get(&hash).await else {
            return json_error(StatusCode::NOT_FOUND, &format!("required output is not on this instance: {hash}"));
        };
        let name = format!("{hash}{}", metadata.extension.as_ref().filter(|e| !e.is_empty()).map(|e| format!(".{e}")).unwrap_or_default());
        if cfg.origin_is_public() {
            urls.insert(hash, format!("{}/{name}", cfg.origin).into());
            continue;
        }
        if cfg.public_mirror().blossom.is_empty() {
            ready = false;
            problem = Some("publishing from a private origin requires a publicly reachable mirror Blossom server".into());
            continue;
        }
        if let Err(error) = state.stores.outbox.queue_blob(hash.clone(), metadata.size, format!("{}/{name}", cfg.origin)).await {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error);
        }
        match state.stores.outbox.blob_copies(hash.clone()).await {
            Ok(copies) => match copies.into_iter().find(|url| public_servers.iter().any(|server| server.trim_end_matches('/') == url.trim_end_matches('/'))) {
                Some(server) => { urls.insert(hash.clone(), format!("{}/{name}", server.trim_end_matches('/')).into()); }
                None => { ready = false; }
            },
            Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error),
        }
        if !urls.contains_key(&hash) {
            match state.stores.outbox.blob_problems(hash).await {
                Ok(Some(error)) => problem = Some(error),
                Ok(None) => {}
                Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &error),
            }
        }
    }
    Json(serde_json::json!({ "ready": ready, "urls": urls, "error": problem })).into_response()
}

// ── Storage (#170) ──────────────────────────────────────────────────────────

/// Almond's credential probe (put, get, list, delete of one `.almond-probe/` object), as the
/// failing step and the provider's error.
async fn probe_s3(settings: almond::services::native_storage::S3Settings) -> Result<(), (&'static str, String)> {
    use almond::services::native_storage::{probe, ProbeStep};
    tokio::time::timeout(Duration::from_secs(30), probe(&settings)).await
        .map_err(|_| ("probe", "S3 connection test timed out after 30 seconds".to_owned()))?
        .map_err(|failure| {
        let step = match failure.step {
            ProbeStep::Put => "put",
            ProbeStep::Get => "get",
            ProbeStep::List => "list",
            ProbeStep::Delete => "delete",
        };
        let error = match failure.code {
            Some(code) => format!("{code}: {}", failure.message),
            None => failure.message,
        };
        (step, error)
    })
}

/// Tests S3 settings without saving them: `{ok: true}` or `{ok: false, step, error}`. An
/// omitted secret means the stored one.
async fn storage_test(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) { return refusal; }
    let body: S3Body = match serde_json::from_slice(&body) {
        Ok(body) => body,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {e}")),
    };
    let s3 = body.config();
    if let Err(e) = s3.check() { return json_error(StatusCode::BAD_REQUEST, &e.to_string()); }
    let secret = match body.secret(&state) {
        Ok(secret) => secret,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &e),
    };
    match probe_s3(s3.settings(secret)).await {
        Ok(()) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err((step, error)) => Json(serde_json::json!({ "ok": false, "step": step, "error": error })).into_response(),
    }
}

/// What Almond reports about the bucket (`s3: null` without S3) and the move job's progress.
/// `lastAttempt` is in Unix seconds.
async fn storage_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    use almond::services::native_storage::S3Status;
    if !is_authed(&state, &headers) { return json_error(StatusCode::UNAUTHORIZED, "not logged in"); }
    let s3 = state.stores.blossom.s3_status().map(|status| match status {
        S3Status::Available => serde_json::json!({ "available": true, "lastError": null, "lastAttempt": null }),
        S3Status::Unavailable { error, last_attempt } => {
            serde_json::json!({ "available": false, "lastError": error, "lastAttempt": last_attempt })
        }
    });
    Json(serde_json::json!({ "s3": s3, "move": state.stores.migration.status().await })).into_response()
}

/// Starts (or resumes) moving local uploads into the bucket (#174). Body `{}`.
async fn storage_move(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) { return refusal; }
    if let Err(error) = serde_json::from_slice::<EmptyBody>(&body) { return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {error}")); }
    match state.stores.migration.start().await {
        Ok(status) => Json(status).into_response(),
        Err(error) => json_error(StatusCode::BAD_REQUEST, &error),
    }
}

// ── Branding ────────────────────────────────────────────────────────────────

/// Replaces a branding image with a raw image (favicon) or `{ "sha256": "<Blossom hash>" }`
/// stored locally or in S3 (#172).
/// Takes effect at once: the public config is rebuilt, nothing restarts.
async fn branding_put(
    State(state): State<Arc<AdminState>>,
    axum::extract::Path(name): axum::extract::Path<String>,
    headers: HeaderMap,
    body: axum::body::Body,
) -> Response {
    use crate::branding::{Kind, Slot};
    let from_blossom = headers.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(';').next().unwrap_or("").trim() == "application/json");
    let refusal = if from_blossom { refuse_write(&state, &headers) } else { refuse_write_as(&state, &headers, "image/*") };
    if let Some(refusal) = refusal { return refusal; }
    let Some(slot) = Slot::parse(&name) else {
        return json_error(StatusCode::NOT_FOUND, "no such branding slot");
    };
    let max = slot.max_bytes();
    let too_big = || json_error(StatusCode::PAYLOAD_TOO_LARGE, &format!("the {} may be at most {} KiB", slot.name(), max / 1024));
    // Order activation against video cleanup; only indexed blobs (local or S3) can become branding.
    let _media_guard = if from_blossom { Some(crate::outbox::MEDIA_LIFECYCLE.lock().await) } else { None };
    let bytes = if from_blossom {
        use almond::services::file_storage;
        use tokio::io::AsyncReadExt;
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct BlobBody { sha256: String }
        let Ok(body) = axum::body::to_bytes(body, 256).await else {
            return json_error(StatusCode::BAD_REQUEST, "invalid branding blob reference");
        };
        let Ok(BlobBody { sha256 }) = serde_json::from_slice(&body) else {
            return json_error(StatusCode::BAD_REQUEST, "expected a Blossom sha256");
        };
        if file_storage::validate_sha256_format(&sha256).is_err() {
            return json_error(StatusCode::BAD_REQUEST, "invalid Blossom sha256");
        }
        let _location_read = crate::storage_move::local_read(&state.stores.blossom, &sha256).await;
        let Some(metadata) = file_storage::get_file_metadata(&state.stores.blossom, &sha256).await else {
            return json_error(StatusCode::NOT_FOUND, "branding blob is not on this instance");
        };
        if metadata.size > max as u64 { return too_big(); }
        let bytes = match &metadata.location {
            almond::models::FileLocation::Local(path) => {
                let mut bytes = Vec::with_capacity(metadata.size as usize);
                let Ok(file) = tokio::fs::File::open(path).await else {
                    return json_error(StatusCode::NOT_FOUND, "branding blob is missing");
                };
                if file.take((max + 1) as u64).read_to_end(&mut bytes).await.is_err() {
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, "cannot read branding blob");
                }
                axum::body::Bytes::from(bytes)
            }
            // Bound the actual stream too: bucket contents may have changed since indexing.
            almond::models::FileLocation::S3 { key } => {
                let Some(s3) = state.stores.blossom.native_s3.as_ref() else {
                    return json_error(StatusCode::SERVICE_UNAVAILABLE, "S3 storage is not configured");
                };
                let read = async {
                    let output = s3.get(key, None).await?;
                    let mut bytes = Vec::with_capacity(metadata.size as usize);
                    output.body.into_async_read().take((max + 1) as u64).read_to_end(&mut bytes).await
                        .map_err(|e| almond::error::AppError::ServiceUnavailable(format!("S3 body read failed: {e}")))?;
                    Ok::<_, almond::error::AppError>(axum::body::Bytes::from(bytes))
                };
                match read.await {
                    Ok(bytes) => bytes,
                    Err(e) => return json_error(StatusCode::SERVICE_UNAVAILABLE, &format!("cannot read branding blob: {e}")),
                }
            }
        };
        if bytes.len() > max { return too_big(); }
        bytes
    } else {
        let declared = headers.get(header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()?.parse::<usize>().ok());
        if declared.is_some_and(|n| n > max) { return too_big(); }
        // Stops reading at the limit. A broken connection also lands here.
        let Ok(bytes) = axum::body::to_bytes(body, max).await else { return too_big(); };
        bytes
    };
    // Profile publication ingests through the relay, which also takes MEDIA_LIFECYCLE.
    drop(_media_guard);
    let Some(kind) = Kind::sniff(&bytes).filter(|k| slot.accepts(*k)) else {
        let message = format!("the {} must be a {} image", slot.name(), slot.types());
        return json_error(StatusCode::UNSUPPORTED_MEDIA_TYPE, &message);
    };
    if slot == Slot::Icon && crate::branding::icon_size(&bytes).is_none() {
        return json_error(StatusCode::UNPROCESSABLE_ENTITY, crate::branding::ICON_REFUSAL);
    }
    match state.stores.branding.store(slot, kind, bytes) {
        Ok(url) => {
            tracing::info!("branding: {} replaced", slot.name());
            state.sync_profile().await;
            Json(serde_json::json!({ "url": url })).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("cannot store the {}: {e}", slot.name())),
    }
}

/// Empties a slot (`DELETE /api/admin/branding/<slot>`); the site falls back to its defaults.
async fn branding_delete(
    State(state): State<Arc<AdminState>>,
    axum::extract::Path(name): axum::extract::Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let Some(slot) = crate::branding::Slot::parse(&name) else {
        return json_error(StatusCode::NOT_FOUND, "no such branding slot");
    };
    match state.stores.branding.remove(slot) {
        Ok(()) => {
            tracing::info!("branding: {} removed", slot.name());
            state.sync_profile().await;
            Json(serde_json::json!({ "ok": true })).into_response()
        }
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("cannot remove the {}: {e}", slot.name())),
    }
}

// ── Outbox (ADR 0009) ───────────────────────────────────────────────────────

/// Mirror targets, job counts per target and the recent problems.
async fn outbox_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    match state.stores.outbox.status().await {
        Ok(status) => Json(status).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RetryBody {
    /// Only this target's failed jobs; all failed jobs when absent.
    #[serde(default)]
    target: Option<String>,
}

/// Failed jobs get a fresh set of attempts, due now. Body `{}` or `{"target": "<url>"}`.
async fn outbox_retry(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let RetryBody { target } = match serde_json::from_slice(&body) {
        Ok(b) => b,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {e}")),
    };
    match state.stores.outbox.retry(target).await {
        Ok(n) => Json(serde_json::json!({ "retried": n })).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

// ── Scheduled publishing (spec "Geplante Veröffentlichung") ─────────────────

fn schedule_error(e: crate::schedule::Error) -> Response {
    match e {
        crate::schedule::Error::Rejected(why) => json_error(StatusCode::BAD_REQUEST, &why),
        crate::schedule::Error::Failed(why) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &why),
    }
}

/// Scheduled videos (pending first by due date) with their state.
async fn schedule_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    match crate::schedule::list(&state.stores.outbox).await {
        Ok(list) => Json(list).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

/// Takes a signed video event whose `published_at` is in the future and holds it until then.
/// Body: the event JSON. The same `d` tag as a pending video replaces it.
async fn schedule_post(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let cfg = match Config::load(&state.data.join("config.toml")) {
        Ok(cfg) => cfg,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    match crate::schedule::submit(&state.stores.outbox, &cfg.creators, &cfg.allowed_writers, &body).await {
        Ok(accepted) => Json(accepted).into_response(),
        Err(e) => schedule_error(e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CancelBody {
    id: String,
}

/// Drops a pending video and removes its blobs. Body `{"id": "<event id>"}`.
async fn schedule_cancel(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let CancelBody { id } = match serde_json::from_slice(&body) {
        Ok(b) => b,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {e}")),
    };
    match crate::schedule::cancel(&state.stores.outbox, id).await {
        Ok(()) => Json(serde_json::json!({ "cancelled": true })).into_response(),
        Err(e) => schedule_error(e),
    }
}

// ── Managed signer (ADR 0007) ───────────────────────────────────────────────

/// The managed key, `Ok(None)` when there is none, `Err` when it cannot be unlocked.
fn managed_keys(state: &AdminState) -> Result<Option<Keys>, String> {
    state.managed.lock().clone().transpose()
}

/// The key the server holds (`managed`, or the error when it cannot be unlocked), else `none` or
/// `own`. `own`: the instance has creators and the server holds none of their keys, so they sign
/// themselves (NIP-07); the server cannot tell which of them is the owner, so no pubkey.
async fn signer_get(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if !is_authed(&state, &headers) {
        return json_error(StatusCode::UNAUTHORIZED, "not logged in");
    }
    match managed_keys(&state) {
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
        Ok(Some(keys)) => managed_json(&keys),
        Ok(None) => match Config::load(&state.data.join("config.toml")) {
            Ok(cfg) => {
                let mode = if cfg.creators.is_empty() { "none" } else { "own" };
                Json(serde_json::json!({ "mode": mode, "pubkey": null })).into_response()
            }
            Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        },
    }
}

fn managed_json(keys: &Keys) -> Response {
    Json(serde_json::json!({ "mode": "managed", "pubkey": keys.public_key().to_hex() })).into_response()
}

/// Generates the managed key and stores it encrypted. Once only: replacing it would throw away
/// the identity (switching keys is not part of the first cut, see the studio spec). A key that
/// exists already is answered as it is, so an onboarding that failed after this step can simply
/// be finished again. Adding the key to `creators` and `allowed_writers` is the studio's config
/// save, as for a NIP-07 key.
async fn signer_create(State(state): State<Arc<AdminState>>, headers: HeaderMap) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    // Under the secrets lock, so two parallel requests cannot both create a key.
    let mut secrets = state.secrets.lock().unwrap();
    if secrets.managed_key.is_some() {
        drop(secrets);
        return match managed_keys(&state) {
            Ok(Some(keys)) => managed_json(&keys),
            Ok(None) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "the managed key is stored but not loaded"),
            Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
        };
    }
    let keys = Keys::generate();
    let ncryptsec = match signer_password(&state.data, true).and_then(|pw| crate::signer::encrypt(keys.secret_key(), &pw)) {
        Ok(n) => n,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    secrets.managed_key = Some(ncryptsec);
    if let Err(e) = secrets.save(&state.data) {
        secrets.managed_key = None;
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
    }
    *state.managed.lock() = Some(Ok(keys.clone()));
    drop(secrets);
    tracing::info!("managed signer: key {} created", keys.public_key().to_hex());
    managed_json(&keys)
}

/// Signs `{kind, created_at, tags, content}` with the managed key and answers the signed event.
async fn signer_sign(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let keys = match managed_keys(&state) {
        Ok(Some(k)) => k,
        Ok(None) => return json_error(StatusCode::CONFLICT, "there is no managed key"),
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    match crate::signer::sign(&keys, &body) {
        Ok(event) => Json(event).into_response(),
        Err(e) => json_error(StatusCode::BAD_REQUEST, &e),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportBody {
    password: String,
}

/// The managed key as `nsec`, only with the admin password. Wrong passwords count towards the
/// login throttle (ADR 0002 addendum): the export is as good a place to guess as the login.
async fn signer_export(State(state): State<Arc<AdminState>>, headers: HeaderMap, body: axum::body::Bytes) -> Response {
    use nostr::prelude::ToBech32;
    if let Some(refusal) = refuse_write(&state, &headers) {
        return refusal;
    }
    let password = match serde_json::from_slice::<ExportBody>(&body) {
        Ok(b) => b.password,
        Err(e) => return json_error(StatusCode::BAD_REQUEST, &format!("invalid body: {e}")),
    };
    let keys = match managed_keys(&state) {
        Ok(Some(k)) => k,
        Ok(None) => return json_error(StatusCode::CONFLICT, "there is no managed key"),
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    // Check, verify and count in one step, as `login_post` does.
    let mut guard = state.login_guard.lock().unwrap();
    let now = Instant::now();
    if let Err(wait) = guard.check(now) {
        let message = format!("Too many wrong passwords. Try again in {}.", login_guard::describe(wait));
        let retry = [(header::RETRY_AFTER, wait.as_secs_f64().ceil().to_string())];
        return (retry, json_error(StatusCode::TOO_MANY_REQUESTS, &message)).into_response();
    }
    let ok = state.secrets.lock().unwrap().password_hash.as_deref().is_some_and(|h| password_ok(h, &password));
    if !ok {
        guard.record_failure(now);
        let failures = guard.failures();
        drop(guard);
        tracing::warn!("managed key export: wrong password ({failures} in a row)");
        return json_error(StatusCode::FORBIDDEN, "Wrong password.");
    }
    guard.record_success();
    drop(guard);
    tracing::warn!("managed key exported");
    let nsec = match keys.secret_key().to_bech32() {
        Ok(n) => n,
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    Json(serde_json::json!({ "nsec": nsec })).into_response()
}

// ── Config apply ────────────────────────────────────────────────────────────

/// Writes the validated config (keeping `config.prev`) and applies it: while running when only
/// the public config and the title change, else by stopping the listener so the supervisor
/// restarts the process on it. Answers whether it restarts. Used by the studio endpoint.
/// `s3_secret` is a secret the studio sent: it goes to the secrets store (never the config) and,
/// when it differs from the stored one, restarts the instance like any storage change.
fn apply(state: &AdminState, current: &Config, next: &Config, s3_secret: Option<&str>) -> Result<bool, String> {
    if let Some(e) = preflight(state, &next.tls) {
        return Err(format!("preflight failed: {e}"));
    }
    let path = state.data.join("config.toml");
    let temp = path.with_extension("toml.tmp");
    let text = next.to_toml().map_err(|e| e.to_string())?;
    std::fs::copy(&path, state.data.join("config.prev")).map_err(|e| format!("cannot keep config.prev: {e}"))?;
    write_private(&temp, &text).map_err(|e| format!("cannot stage config: {e}"))?;
    let mut secrets = state.secrets.lock().unwrap();
    let previous = secrets.s3_secret_access_key.clone();
    let secret_changed = s3_secret.is_some_and(|s| Some(s) != previous.as_deref());
    if secret_changed {
        secrets.s3_secret_access_key = s3_secret.map(str::to_owned);
        if let Err(e) = secrets.save(&state.data) {
            secrets.s3_secret_access_key = previous;
            return Err(format!("cannot store the S3 secret: {e}"));
        }
    }
    if let Err(error) = std::fs::rename(&temp, &path) {
        if secret_changed {
            secrets.s3_secret_access_key = previous;
            secrets.save(&state.data).map_err(|e| format!("cannot apply config ({error}) or restore the S3 secret ({e})"))?;
        }
        return Err(format!("cannot apply config: {error}"));
    }
    drop(secrets);
    state.stores.outbox.set_origin_public(next.origin_is_public());
    // Hosting/private transitions stop redirects immediately; other restart-only edits stay staged.
    if current.site_hosting != next.site_hosting || current.reach != next.reach {
        state.stores.branding.set_base(next.public_json());
    }
    if !current.needs_restart(next) && !secret_changed {
        state.stores.branding.set_base(next.public_json());
        state.stores.relay.set_title(&next.title);
        state.stores.relay.set_count_plays(next.site.count_plays);
        tracing::info!("admin: config revision {} applied while running", next.revision);
        return Ok(false);
    }
    tracing::info!("admin: config revision {} applied; restarting", next.revision);
    // The response must reach the browser before the listener stops accepting.
    let handle = state.handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        // New connections are refused immediately; in-flight uploads keep up to 30 s (#7).
        handle.graceful_shutdown(Some(Duration::from_secs(30)));
    });
    Ok(true)
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

fn set_cookie_redirect(state: &AdminState, secret: &str, to: &str) -> Response {
    (
        [(header::SET_COOKIE, session_cookie(secret, state.secure_cookies)), (header::LOCATION, to.to_owned())],
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

/// The stylesheet of the pages the server renders itself (setup and login). It follows the
/// system's light or dark setting and uses the colours of the studio's theme (`theme.css` of
/// `@nostube/widgets`), so a visitor does not leave one look for another.
const PAGE_CSS: &str = r#"
:root{color-scheme:light dark;
--background:oklch(0.982 0.002 286);--foreground:oklch(0.205 0.006 286);--card:oklch(1 0 0);
--muted:oklch(0.49 0.012 286);--border:oklch(0.89 0.006 286);--input:oklch(0.89 0.006 286);
--primary:oklch(0.48 0.2 293);--primary-foreground:oklch(0.969 0.016 293.756);--ring:oklch(0.55 0.17 293);
--destructive:oklch(0.577 0.245 27.325);--code:oklch(0.952 0.004 286)}
@media (prefers-color-scheme:dark){:root{
--background:oklch(0.16 0.006 286);--foreground:oklch(0.96 0.003 286);--card:oklch(0.205 0.007 286);
--muted:oklch(0.7 0.01 286);--border:oklch(1 0 0/12%);--input:oklch(1 0 0/16%);
--ring:oklch(0.68 0.16 293);--destructive:oklch(0.704 0.191 22.216);--code:oklch(0.245 0.008 286)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;
font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
background:var(--background);color:var(--foreground)}
main{width:100%;max-width:26rem;background:var(--card);border:1px solid var(--border);
border-radius:.75rem;padding:1.75rem}
.brand{display:flex;align-items:center;gap:.6rem;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:0 0 .75rem}
.brand img{display:block}
h1{font-size:1.4rem;line-height:1.3;margin:0 0 .75rem}
p{margin:.5rem 0;color:var(--muted)} p.error{color:var(--destructive);background:color-mix(in oklab,var(--destructive) 10%,transparent);
border:1px solid color-mix(in oklab,var(--destructive) 40%,transparent);border-radius:.5rem;padding:.6rem .75rem}
label{display:block;margin:1rem 0 0;font-size:.875rem;font-weight:500}
label small{font-weight:400;color:var(--muted)}
input{display:block;width:100%;height:2.5rem;margin-top:.35rem;padding:.5rem .75rem;font:inherit;
color:var(--foreground);background:transparent;border:1px solid var(--input);border-radius:.5rem}
input:focus-visible,button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
button{display:block;width:100%;height:2.5rem;margin-top:1.25rem;padding:0 1rem;font:inherit;font-weight:500;
cursor:pointer;border:0;border-radius:.5rem;background:var(--primary);color:var(--primary-foreground)}
button:hover{filter:brightness(1.1)} button.secondary{margin-top:.75rem;background:transparent;color:var(--foreground);border:1px solid var(--input)}
code{background:var(--code);padding:.1rem .3rem;border-radius:.25rem;font-size:.85em}
.or{text-align:center;margin:1rem 0 0;font-size:.875rem}
.hint{margin:1.25rem 0 0;font-size:.875rem}
"#;

fn page(title: &str, body: &str) -> Html<String> {
    Html(format!(
        r#"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<meta name=color-scheme content="light dark"><meta name=robots content=noindex>
<title>{title} · Nostube Studio</title><style>{css}</style></head><body><main><p class=brand><img src="/studio/nostube.svg" alt="" width=28 height=28>Nostube Studio</p>{body}</main></body></html>"#,
        title = esc(title),
        css = PAGE_CSS,
    ))
}

fn setup_form(error: Option<&str>) -> String {
    let error = error.map(|e| format!("<p class=error role=alert>{}</p>", esc(e))).unwrap_or_default();
    format!(
        r#"<h1>Register the admin</h1>{error}
<p>One-time setup. The token is in the instance log (or came from <code>nostube-server admin reset</code>).</p>
<form method=post action=/admin/setup>
  <label>Setup token <input name=token autocomplete=off required></label>
  <label>Password <small>(at least 8 characters)</small> <input name=password type=password autocomplete=new-password required></label>
  <label>Repeat password <input name=password2 type=password autocomplete=new-password required></label>
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

/// `nostr`: a Nostr key is bound, so the page also offers the NIP-07 login.
fn login_form(error: Option<&str>, nostr: bool) -> String {
    let error = error.map(|e| format!("<p class=error role=alert>{}</p>", esc(e))).unwrap_or_default();
    // Not a format string: these are single braces on purpose (they are only inserted below).
    let nostr = if nostr {
        r#"<p class=or>or</p>
<button type=button class=secondary id=nostr-login hidden>Log in with a Nostr key</button>
<script>
const nostrButton = document.getElementById('nostr-login');
// Extensions inject window.nostr a moment after the page loads: wait up to 2 s for it.
let waited = 0;
const lookForSigner = setInterval(() => {
  if (window.nostr) { nostrButton.hidden = false; clearInterval(lookForSigner); }
  else if ((waited += 100) >= 2000) clearInterval(lookForSigner);
}, 100);
nostrButton.addEventListener('click', async () => {
  const path = '/admin/login/nostr';
  try {
    const ev = await window.nostr.signEvent({
      kind: 27235, created_at: Math.floor(Date.now() / 1000), tags: [['u', location.origin + path], ['method', 'POST']], content: '',
    });
    const res = await fetch(path, { method: 'POST', headers: { Authorization: 'Nostr ' + btoa(JSON.stringify(ev)) } });
    if (res.ok) location.href = '/admin'; else alert(await res.text());
  } catch (e) { alert(e && e.message ? e.message : String(e)); }
});
</script>"#
    } else {
        ""
    };
    format!(
        r#"<h1>Log in</h1>{error}
<form method=post action=/admin/login>
  <label>Password <input name=password type=password autocomplete=current-password autofocus required></label>
  <button>Log in</button>
</form>{nostr}
<p class=hint>Forgot the password? Run <code>nostube-server admin reset</code> on the server and register again with the setup token it prints.</p>"#
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

    #[tokio::test]
    async fn nip98_events_must_match_instance_path_and_host() {
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
            stores(&dir).await,
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

    /// Relay, Blossom and branding in `dir`, opened like `main` does (quota 7 GiB, reserve 2 GiB).
    async fn stores(dir: &Path) -> Stores {
        stores_with(dir, None).await
    }

    /// Almond's settings of `stores`; with `s3`, new uploads go to that bucket.
    fn almond_config(dir: &Path, s3: Option<almond::services::native_storage::S3Settings>) -> almond::Config {
        let mut cfg = almond::Config::defaults();
        cfg.storage_path = dir.join("blossom");
        cfg.public_url = Some("https://flox-mac.local".into());
        cfg.homepage_enabled = false;
        cfg.storage_max_size = 7 * config::GIB;
        cfg.storage_min_free = 2 * config::GIB;
        if let Some(s3) = s3 {
            cfg.s3_endpoint = Some(s3.endpoint);
            cfg.s3_bucket = Some(s3.bucket);
            cfg.s3_access_key_id = Some(s3.access_key_id);
            cfg.s3_secret_access_key = Some(s3.secret_access_key);
            cfg.s3_region = s3.region;
            cfg.s3_force_path_style = s3.force_path_style;
        }
        cfg.validate().unwrap()
    }

    async fn stores_with(dir: &Path, s3: Option<almond::services::native_storage::S3Settings>) -> Stores {
        let blossom = almond::build_state(&almond_config(dir, s3)).await.unwrap();
        let relay = crate::relay::RelayConfig { writers: vec![], name: "t".into(), description: "t".into(), mirror_relays: vec![] };
        let public = Config::load(&dir.join("config.toml")).map_or(serde_json::json!({ "site": {} }), |c| c.public_json());
        let branding = Arc::new(crate::branding::Branding::open(dir, public));
        let relay = Relay::open(&dir.join("relay.sqlite"), relay).unwrap();
        let outbox = crate::outbox::Outbox::open(&dir.join("relay.sqlite"), config::Mirror::default()).unwrap();
        outbox.attach_storage(blossom.clone());
        let nsite = crate::nsite::Nsite::open(dir).unwrap();
        let migration = crate::storage_move::open(dir, blossom.clone()).unwrap();
        outbox.attach_migration(migration.clone());
        Stores { relay, blossom, branding, outbox, nsite, migration }
    }

    /// A data dir with a valid config, TLS placeholder files and a registered admin; returns the
    /// router and a valid session cookie.
    async fn studio_fixture() -> (Router, PathBuf, String) {
        studio_fixture_for("{ mode = \"local-ca\" }", true).await
    }

    /// `tls` is the TOML value of `tls`; `tls_files` writes the placeholder CA files.
    async fn studio_fixture_for(tls: &str, tls_files: bool) -> (Router, PathBuf, String) {
        let (app, dir, cookie, _, _) = studio_fixture_with_stores(tls, tls_files).await;
        (app, dir, cookie)
    }

    /// Also hands back the live Blossom state and the branding the router reads.
    async fn studio_fixture_with_stores(
        tls: &str,
        tls_files: bool,
    ) -> (Router, PathBuf, String, almond::AppState, Arc<crate::branding::Branding>) {
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
        let stores = stores(&dir).await;
        let blossom = stores.blossom.clone();
        let branding = stores.branding.clone();
        let state = AdminState::open(
            &dir,
            "flox-mac.local",
            vec!["flox-mac.local".into()],
            "https://flox-mac.local",
            "boot".into(),
            Arc::new(axum_server::Handle::new()),
            stores,
        )
        .unwrap();
        let cookie = session_cookie(&secret, true).split(';').next().unwrap().to_owned();
        (router(state), dir, cookie, blossom, branding)
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

    async fn api_call(app: &Router, method: &str, path: &str, cookie: Option<&str>, body: serde_json::Value) -> (StatusCode, serde_json::Value) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().method(method).uri(path).header(header::CONTENT_TYPE, "application/json");
        if let Some(cookie) = cookie { req = req.header(header::COOKIE, cookie); }
        let res = app.clone().oneshot(req.body(axum::body::Body::from(body.to_string())).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn nsite_endpoints_require_auth_managed_key_saved_settings_and_explicit_disable_choice() {
        let (app, dir, cookie) = studio_fixture_for("{ mode = \"proxy\", port = 8080 }", false).await;
        let c = Some(cookie.as_str());
        let empty = serde_json::json!({});
        assert_eq!(api_call(&app, "GET", "/api/admin/nsite", None, empty.clone()).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(api_call(&app, "POST", "/api/admin/nsite/publish", None, empty.clone()).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(api_call(&app, "POST", "/api/admin/nsite/publish", c, empty.clone()).await.0, StatusCode::BAD_REQUEST);
        let mut edit = put_value("#112233");
        edit["reach"] = "public".into();
        edit["siteHosting"] = "nsite".into();
        let (status, body) = call(&app, "PUT", c, Some("application/json"), &edit.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert!(body["error"].as_str().unwrap().contains("managed"));

        let state = AdminState::open(&dir, "flox-mac.local", vec!["flox-mac.local".into()], "https://flox-mac.local",
            "test".into(), Arc::new(axum_server::Handle::new()), stores(&dir).await).unwrap();
        *state.managed.lock() = Some(Ok(Keys::generate()));
        let app = router(state);
        assert_eq!(api_call(&app, "POST", "/api/admin/nsite/publish", c, empty.clone()).await.0, StatusCode::BAD_REQUEST, "only saved nsite settings may publish");
        // Keep mirror targets unchanged in this test so a config apply does not schedule a restart.
        let mut cfg = Config::load(&dir.join("config.toml")).unwrap();
        cfg.mirror = config::Mirror { relays: vec!["wss://mirror.example".into()], blossom: vec!["https://blossom.example".into()] };
        cfg.reach = config::Reach::Public;
        cfg.site_hosting = config::SiteHosting::Nsite;
        std::fs::write(dir.join("config.toml"), cfg.to_toml().unwrap()).unwrap();
        edit = editable_json(&cfg, false);
        edit["reach"] = "private".into();
        let (status, body) = call(&app, "PUT", c, Some("application/json"), &edit.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert!(body["error"].as_str().unwrap().contains("deleteNsite"));
        assert_eq!(Config::load(&dir.join("config.toml")).unwrap().site_hosting, config::SiteHosting::Nsite);
        edit["deleteNsite"] = false.into();
        assert_eq!(call(&app, "PUT", c, Some("application/json"), &edit.to_string()).await.0, StatusCode::OK);
        assert_eq!(Config::load(&dir.join("config.toml")).unwrap().site_hosting, config::SiteHosting::Instance);
    }

    #[tokio::test]
    async fn mirror_readiness_requires_every_output_and_returns_only_confirmed_public_urls() {
        let (_, dir, cookie) = studio_fixture_for("{ mode = \"proxy\", port = 8080 }", false).await;
        let mut cfg = Config::load(&dir.join("config.toml")).unwrap();
        cfg.origin = "https://home.example".into();
        cfg.origin_host = "home.example".into();
        cfg.tls = config::Tls::LocalCa { router_name: None, https_port: 443, http_port: 80 };
        cfg.reach = config::Reach::Public;
        cfg.mirror = config::Mirror { relays: vec!["wss://mirror.example".into()], blossom: vec![cfg.origin.clone(), "https://blossom.example".into(), "https://optional.example".into()] };
        std::fs::write(dir.join("config.toml"), cfg.to_toml().unwrap()).unwrap();
        let mut live = stores(&dir).await;
        live.outbox = crate::outbox::Outbox::open(&dir.join("relay.sqlite"), cfg.mirror.clone()).unwrap();
        live.outbox.attach_storage(live.blossom.clone());
        live.outbox.set_origin_public(false);
        let owner = Keys::generate().public_key().to_hex();
        let (video, _) = live.outbox.store_local(b"video bytes", "video/mp4", "mp4", &owner).await.unwrap();
        let (thumbnail, _) = live.outbox.store_local(b"thumbnail bytes", "image/png", "png", &owner).await.unwrap();
        let outbox = live.outbox.clone();
        let state = AdminState::open(&dir, "flox-mac.local", vec!["flox-mac.local".into()], "https://flox-mac.local",
            "test".into(), Arc::new(axum_server::Handle::new()), live).unwrap();
        let app = router(state);
        let path = "/api/admin/media/mirrors";
        let body = serde_json::json!({"hashes":[video,thumbnail]});
        assert_eq!(api_call(&app, "POST", path, None, body.clone()).await.0, StatusCode::UNAUTHORIZED);
        let c = Some(cookie.as_str());
        let (status, response) = api_call(&app, "POST", path, c, body.clone()).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(response["ready"], false);
        outbox.db(|conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='blob' AND target='https://home.example'", []).map(|_| ())).await.unwrap();
        let (_, response) = api_call(&app, "POST", path, c, body.clone()).await;
        assert_eq!(response["ready"], false, "a local-ca self-copy is not publicly available");
        assert_eq!(response["urls"], serde_json::json!({}));
        let confirmed = video.clone();
        outbox.db(move |conn| conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='blob' AND target='https://blossom.example' AND ref_id=?", [confirmed]).map(|_| ())).await.unwrap();
        let (_, response) = api_call(&app, "POST", path, c, body.clone()).await;
        assert_eq!(response["ready"], false, "thumbnail is required too");
        assert_eq!(response["urls"][&video], format!("https://blossom.example/{video}.mp4"));
        outbox.db(|conn| {
            conn.execute("UPDATE outbox SET status='done',last_error=NULL WHERE kind='blob' AND target='https://blossom.example'", [])?;
            conn.execute("UPDATE outbox SET status='pending',last_error='offline' WHERE kind='blob' AND target='https://optional.example'", []).map(|_| ())
        }).await.unwrap();
        let (_, response) = api_call(&app, "POST", path, c, body.clone()).await;
        assert_eq!(response["ready"], true);
        assert!(response["error"].is_null(), "optional mirror failures cannot block confirmed media");
        assert_eq!(response["urls"][&thumbnail], format!("https://blossom.example/{thumbnail}.png"));
        assert_eq!(api_call(&app, "POST", path, c, serde_json::json!({"hashes":["../secrets"]})).await.0, StatusCode::BAD_REQUEST);
        assert_eq!(api_call(&app, "POST", path, c, serde_json::json!({"hashes":["00".repeat(32)]})).await.0, StatusCode::NOT_FOUND);
        cfg.origin = "https://instance.example".into();
        cfg.origin_host = "instance.example".into();
        cfg.tls = config::Tls::Proxy { port: 8080 };
        std::fs::write(dir.join("config.toml"), cfg.to_toml().unwrap()).unwrap();
        let (_, response) = api_call(&app, "POST", path, c, body).await;
        assert_eq!(response["ready"], true);
        assert_eq!(response["urls"][&video], format!("https://instance.example/{video}.mp4"));
    }

    fn put_value(accent: &str) -> serde_json::Value {
        serde_json::json!({
            "title": "Renamed",
            "reach": "private",
            "siteHosting": "instance",
            "nsite": { "gateway": "nsite.lol", "domain": "" },
            "creators": [PK],
            "allowedWriters": [PK],
            "videoSources": ["wss://flox-mac.local", "wss://relay.example"],
            "interactionRelays": ["wss://relay.example"],
            "profileRelays": [],
            "search": { "mode": "local" },
            "storage": { "quotaGib": 100, "freeSpaceReserveGib": 3 },
            "site": { "tagline": "Hi", "lightning": "", "theme": { "accent": accent, "font": "mono" }, "videos": { "hidden": [format!("34235:{PK}:intro")] }, "links": { "profile": "https://example.org/p/{nip19}", "video": "https://example.org/v/{nip19}", "note": "https://example.org/n/{nip19}" }, "pages": { "about": { "de": "Über uns", "en": "About" }, "imprint": { "en": "Imprint" }, "privacy": {} },
                "homepage": { "intro": "Welcome", "featured": format!("34235:{PK}:clip"), "featuredText": "Start here", "selected": [format!("34236:{PK}:short")], "links": [{ "label": "Shop", "url": "https://shop.example/" }], "action": { "label": "Support", "url": "https://support.example/" } } },
            "mirror": { "relays": ["wss://mirror.example"], "blossom": ["https://blossom.example"] }
        })
    }

    fn put_body(accent: &str) -> String {
        put_value(accent).to_string()
    }

    // ── S3 storage (#171-#173) ──

    use crate::fake_s3::{FakeS3, ACCESS_KEY, BUCKET, SECRET_KEY};

    /// The studio's `storage.s3` for the fake bucket, with its secret.
    fn s3_json(fake: &FakeS3) -> serde_json::Value {
        serde_json::json!({
            "endpoint": fake.url(), "bucket": BUCKET, "region": "auto", "forcePathStyle": true,
            "accessKeyId": ACCESS_KEY, "secretAccessKey": SECRET_KEY,
        })
    }

    /// A second router on `dir` whose Blossom was started with `s3` (an instance after restart).
    async fn router_with_s3(dir: &Path, s3: almond::services::native_storage::S3Settings) -> (Router, almond::AppState, Arc<crate::branding::Branding>) {
        let stores = stores_with(dir, Some(s3)).await;
        let (blossom, branding) = (stores.blossom.clone(), stores.branding.clone());
        let state = AdminState::open(dir, "flox-mac.local", vec!["flox-mac.local".into()], "https://flox-mac.local",
            "boot".into(), Arc::new(axum_server::Handle::new()), stores).unwrap();
        (router(state), blossom, branding)
    }

    /// `GET /<name>` from Blossom: status and body.
    async fn blob(blossom: &almond::AppState, name: &str, range: Option<&str>) -> (StatusCode, Vec<u8>) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().uri(format!("/{name}"));
        if let Some(range) = range { req = req.header(header::RANGE, range); }
        let res = almond::create_app(blossom.clone()).oneshot(req.body(axum::body::Body::empty()).unwrap()).await.unwrap();
        let status = res.status();
        (status, axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap().to_vec())
    }

    /// The fan-out key Almond gives an uploaded blob.
    fn s3_key(hash: &str, ext: &str) -> String {
        format!("{}/{}/{hash}.{ext}", &hash[..1], &hash[1..2])
    }

    #[tokio::test]
    async fn s3_settings_round_trip_with_a_write_only_secret() {
        let fake = FakeS3::start().await;
        let (app, dir, cookie) = studio_fixture().await;
        let (c, json) = (Some(cookie.as_str()), Some("application/json"));
        let (_, read) = call(&app, "GET", c, None, "").await;
        assert!(read["config"]["storage"]["s3"].is_null(), "{read}");
        let mut edit = put_value("#112233");
        edit["storage"]["s3"] = s3_json(&fake);
        let (status, body) = call(&app, "PUT", c, json, &edit.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &true.into()), "{body}");
        assert!(fake.keys().is_empty(), "the preflight probe leaves no object: {:?}", fake.keys());
        // The secret goes to the secrets store, never the config file or a GET.
        let file = std::fs::read_to_string(dir.join("config.toml")).unwrap();
        assert!(file.contains("[storage.s3]") && !file.contains(SECRET_KEY), "{file}");
        assert_eq!(Secrets::load(&dir).unwrap().s3_secret_access_key.as_deref(), Some(SECRET_KEY));
        let (_, read) = call(&app, "GET", c, None, "").await;
        assert!(!read.to_string().contains(SECRET_KEY));
        assert_eq!(read["config"]["storage"]["s3"], serde_json::json!({
            "endpoint": fake.url(), "bucket": BUCKET, "region": "auto", "forcePathStyle": true,
            "accessKeyId": ACCESS_KEY, "secretSet": true,
        }));
        // Saved back as read (secretSet, no secret): the stored secret stays and a title edit
        // neither probes nor restarts.
        let mut again = read["config"].clone();
        again["title"] = "Again".into();
        let (status, body) = call(&app, "PUT", c, json, &again.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &false.into()), "{body}");
        assert_eq!(Secrets::load(&dir).unwrap().s3_secret_access_key.as_deref(), Some(SECRET_KEY));
        // An empty secret is refused, and so is turning S3 off.
        let before = std::fs::read(dir.join("config.toml")).unwrap();
        again["storage"]["s3"]["secretAccessKey"] = "".into();
        let (status, body) = call(&app, "PUT", c, json, &again.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        again["storage"]["s3"] = serde_json::Value::Null;
        let (status, body) = call(&app, "PUT", c, json, &again.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().contains("cannot be turned off"), "{body}");
        assert_eq!(std::fs::read(dir.join("config.toml")).unwrap(), before);
        // A new secret alone restarts the instance.
        again["storage"]["s3"] = read["config"]["storage"]["s3"].clone();
        again["storage"]["s3"]["secretAccessKey"] = "rotated".into();
        let (status, body) = call(&app, "PUT", c, json, &again.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &true.into()), "{body}");
        assert_eq!(Secrets::load(&dir).unwrap().s3_secret_access_key.as_deref(), Some("rotated"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_failed_save_keeps_the_old_secret_and_a_retry_still_restarts() {
        let fake = FakeS3::start().await;
        let (app, dir, cookie) = studio_fixture().await;
        let mut edit = put_value("#112233");
        edit["storage"]["s3"] = s3_json(&fake);
        let c = Some(cookie.as_str());
        assert_eq!(call(&app, "PUT", c, Some("application/json"), &edit.to_string()).await.0, StatusCode::OK);
        let before = std::fs::read(dir.join("config.toml")).unwrap();
        std::fs::create_dir(dir.join("config.toml.tmp")).unwrap();
        edit["storage"]["s3"]["secretAccessKey"] = "rotated".into();
        assert_eq!(call(&app, "PUT", c, Some("application/json"), &edit.to_string()).await.0, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(std::fs::read(dir.join("config.toml")).unwrap(), before);
        assert_eq!(Secrets::load(&dir).unwrap().s3_secret_access_key.as_deref(), Some(SECRET_KEY));
        std::fs::remove_dir(dir.join("config.toml.tmp")).unwrap();
        let (status, body) = call(&app, "PUT", c, Some("application/json"), &edit.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &true.into()), "{body}");
        assert_eq!(Secrets::load(&dir).unwrap().s3_secret_access_key.as_deref(), Some("rotated"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn the_connection_test_names_the_failing_step_and_leaves_no_object() {
        let fake = FakeS3::start().await;
        let (app, dir, cookie) = studio_fixture().await;
        let c = Some(cookie.as_str());
        const TEST: &str = "/api/admin/storage/test";
        assert_eq!(api_call(&app, "POST", TEST, None, s3_json(&fake)).await.0, StatusCode::UNAUTHORIZED);
        let (status, body) = api_call(&app, "POST", TEST, c, s3_json(&fake)).await;
        assert_eq!((status, body), (StatusCode::OK, serde_json::json!({ "ok": true })));
        assert!(fake.keys().is_empty(), "{:?}", fake.keys());
        let gone = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            format!("http://{}", l.local_addr().unwrap())
        };
        for (field, value, code) in [
            ("bucket", "missing-bucket".to_owned(), Some("NoSuchBucket")),
            ("accessKeyId", "wrong-key".to_owned(), Some("InvalidAccessKeyId")),
            ("endpoint", gone, None),
        ] {
            let mut body = s3_json(&fake);
            body[field] = value.into();
            let (status, answer) = api_call(&app, "POST", TEST, c, body).await;
            assert_eq!((status, &answer["ok"], &answer["step"]), (StatusCode::OK, &false.into(), &"put".into()), "{field}: {answer}");
            let error = answer["error"].as_str().unwrap();
            assert!(!error.is_empty() && code.is_none_or(|code| error.contains(code)), "{field}: {error}");
        }
        // Invalid input is a 400; without a stored secret one is required, and never empty.
        let mut body = s3_json(&fake);
        body["endpoint"] = "s3.example".into();
        assert_eq!(api_call(&app, "POST", TEST, c, body).await.0, StatusCode::BAD_REQUEST);
        let mut body = s3_json(&fake);
        body.as_object_mut().unwrap().remove("secretAccessKey");
        assert_eq!(api_call(&app, "POST", TEST, c, body).await.0, StatusCode::BAD_REQUEST);
        let mut body = s3_json(&fake);
        body["secretAccessKey"] = "".into();
        assert_eq!(api_call(&app, "POST", TEST, c, body).await.0, StatusCode::BAD_REQUEST);
        // With a stored secret, an omitted one means that one.
        let mut s = Secrets::load(&dir).unwrap();
        s.s3_secret_access_key = Some(SECRET_KEY.into());
        s.save(&dir).unwrap();
        let app = router(AdminState::open(&dir, "flox-mac.local", vec!["flox-mac.local".into()], "https://flox-mac.local",
            "boot".into(), Arc::new(axum_server::Handle::new()), stores(&dir).await).unwrap());
        let mut body = s3_json(&fake);
        body.as_object_mut().unwrap().remove("secretAccessKey");
        body["secretSet"] = true.into();
        let (status, answer) = api_call(&app, "POST", "/api/admin/storage/test", c, body).await;
        assert_eq!((status, answer), (StatusCode::OK, serde_json::json!({ "ok": true })));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn saving_settings_that_fail_the_probe_writes_nothing() {
        let fake = FakeS3::start().await;
        let (app, dir, cookie) = studio_fixture().await;
        let before = std::fs::read(dir.join("config.toml")).unwrap();
        let mut edit = put_value("#112233");
        edit["storage"]["s3"] = s3_json(&fake);
        edit["storage"]["s3"]["bucket"] = "missing-bucket".into();
        let (status, body) = call(&app, "PUT", Some(&cookie), Some("application/json"), &edit.to_string()).await;
        assert_eq!((status, &body["step"]), (StatusCode::BAD_REQUEST, &"put".into()), "{body}");
        assert!(body["error"].as_str().unwrap().contains("NoSuchBucket"), "{body}");
        assert_eq!(std::fs::read(dir.join("config.toml")).unwrap(), before);
        assert!(!dir.join("config.prev").exists());
        assert_eq!(Secrets::load(&dir).unwrap().s3_secret_access_key, None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn branding_reads_blobs_stored_in_s3_with_the_same_limits() {
        use sha2::{Digest, Sha256};
        let fake = FakeS3::start().await;
        let (_, dir, cookie) = studio_fixture().await;
        let mut big = PNG.to_vec();
        big.resize(512 * 1024 + 1, 0);
        let html = b"<!doctype html>".to_vec();
        let hashes: Vec<String> = [PNG.to_vec(), big, html].into_iter().map(|bytes| {
            let hash = format!("{:x}", Sha256::digest(&bytes));
            fake.insert(&s3_key(&hash, "png"), &bytes);
            hash
        }).collect();
        // Started with S3: Almond indexes the bucket's blobs.
        let (app, blossom, branding) = router_with_s3(&dir, fake.settings()).await;
        let indexed = blossom.file_index.get(&hashes[0]).await.unwrap();
        assert!(matches!(indexed.location, almond::models::FileLocation::S3 { .. }), "{:?}", indexed.location);
        let (c, json) = (Some(cookie.as_str()), Some("application/json"));
        let reference = |hash: &str| serde_json::json!({ "sha256": hash }).to_string().into_bytes();
        let (status, body) = branding_call(&app, "PUT", "logo", c, json, reference(&hashes[0])).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(public_site(&branding)["logo"], body["url"]);
        assert_eq!(std::fs::read(dir.join("branding/logo.png")).unwrap(), PNG);
        assert_eq!(branding_call(&app, "PUT", "banner", c, json, reference(&hashes[2])).await.0, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        assert_eq!(branding_call(&app, "PUT", "logo", c, json, reference(&hashes[1])).await.0, StatusCode::PAYLOAD_TOO_LARGE);
        // A bucket object can grow after listing; the streamed read must still enforce the limit.
        fake.insert(&s3_key(&hashes[0], "png"), &vec![0; 512 * 1024 + 1]);
        assert_eq!(branding_call(&app, "PUT", "logo", c, json, reference(&hashes[0])).await.0, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(std::fs::read(dir.join("branding/logo.png")).unwrap(), PNG);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn an_unreachable_bucket_degrades_the_instance_until_it_answers_again() {
        use sha2::{Digest, Sha256};
        let fake = FakeS3::start().await;
        let (_, dir, cookie) = studio_fixture().await;
        let c = Some(cookie.as_str());
        let in_s3 = b"a video stored in the bucket".to_vec();
        let s3_hash = format!("{:x}", Sha256::digest(&in_s3));
        fake.insert(&s3_key(&s3_hash, "mp4"), &in_s3);
        fake.stop().await;
        // The instance starts with the bucket down.
        let (app, blossom, _) = router_with_s3(&dir, fake.settings()).await;
        let _tasks = almond::spawn_background_tasks(&blossom, &almond_config(&dir, Some(fake.settings())));
        assert_eq!(send(&app, "/api/admin/storage", None, None).await.0, StatusCode::UNAUTHORIZED);
        let (status, _, body) = send(&app, "/api/admin/storage", c, None).await;
        assert_eq!((status, &body["s3"]["available"]), (StatusCode::OK, &false.into()), "{body}");
        assert!(body["s3"]["lastError"].as_str().is_some_and(|e| !e.is_empty()), "{body}");
        assert!(body["s3"]["lastAttempt"].as_u64().is_some(), "{body}");
        assert!(body["move"]["state"].is_string(), "{body}");
        // Local blobs keep playing; a blob that may be in S3 answers 503, not 404.
        let local = b"a video stored on this machine".to_vec();
        let local_hash = format!("{:x}", Sha256::digest(&local));
        let path = blossom.storage.uploads.join(format!("{local_hash}.mp4"));
        tokio::fs::create_dir_all(&blossom.storage.uploads).await.unwrap();
        tokio::fs::write(&path, &local).await.unwrap();
        blossom.file_index.insert(local_hash.clone(), almond::models::FileMetadata {
            location: almond::models::FileLocation::Local(path), extension: Some("mp4".into()),
            mime_type: Some("video/mp4".into()), size: local.len() as u64, created_at: 1, pubkey: None,
            expiration: None, origin: Default::default(),
        }).await;
        assert_eq!(blob(&blossom, &format!("{local_hash}.mp4"), None).await, (StatusCode::OK, local.clone()));
        assert_eq!(blob(&blossom, &format!("{local_hash}.mp4"), Some("bytes=2-5")).await, (StatusCode::PARTIAL_CONTENT, local[2..=5].to_vec()));
        assert_eq!(blob(&blossom, &format!("{s3_hash}.mp4"), None).await.0, StatusCode::SERVICE_UNAVAILABLE);
        // Back up: Almond's retry finds the bucket, the status flips and the S3 blob plays.
        fake.resume().await;
        let mut available = false;
        for _ in 0..120 {
            let (_, _, body) = send(&app, "/api/admin/storage", c, None).await;
            if body["s3"]["available"] == true {
                assert!(body["s3"]["lastError"].is_null(), "{body}");
                available = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        assert!(available, "S3 never became available again");
        assert_eq!(blob(&blossom, &format!("{s3_hash}.mp4"), None).await, (StatusCode::OK, in_s3.clone()));
        assert_eq!(blob(&blossom, &format!("{s3_hash}.mp4"), Some("bytes=2-5")).await, (StatusCode::PARTIAL_CONTENT, in_s3[2..=5].to_vec()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn studio_api_needs_a_session_and_answers_json() {
        let (app, dir, _cookie) = studio_fixture().await;
        let (status, body) = call(&app, "GET", None, None, "").await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["error"], "not logged in");
        let (status, _) = call(&app, "PUT", None, Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn studio_api_reads_the_site_settings() {
        let (app, dir, cookie) = studio_fixture().await;
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
        let (app, dir, cookie) = studio_fixture().await;
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
                v["site"].as_object_mut().unwrap().remove("pages");
                v.to_string()
            }),
            (json, put_body("#112233").replace("\"de\"", "\"deu\"")),
            (json, put_body("#112233").replace("\"Imprint\"", "\"  \"")),
            (json, put_body("#112233").replace("\"about\"", "\"unknown\"")),
            (json, {
                let mut v = put_value("#112233");
                v.as_object_mut().unwrap().remove("storage");
                v.to_string()
            }),
            (json, put_body("#112233").replace("wss://relay.example", "https://relay.example")),
            (json, put_body("#112233").replace("https://blossom.example", "ftp://blossom.example")),
            (json, put_body("#112233").replace(&format!("\"creators\":[\"{PK}\"]"), "\"creators\":[\"nope\"]")),
            (json, put_body("#112233").replace("https://shop.example/", "javascript:alert(1)")),
            (json, put_body("#112233").replace("https://support.example/", "https://user:pw@support.example/")),
            (json, put_body("#112233").replace(&format!("34236:{PK}:short"), "not-a-video")),
            (json, put_body("#112233").replace("\"featuredText\"", "\"featured_text\"")),
            (json, {
                let mut v = put_value("#112233");
                v["site"]["homepage"].as_object_mut().unwrap().remove("action");
                v.to_string()
            }),
            (json, {
                let mut v = put_value("#112233");
                v["site"]["homepage"] = serde_json::Value::Null;
                v.to_string()
            }),
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
        let (app, dir, cookie) = studio_fixture().await;
        let before = Config::load(&dir.join("config.toml")).unwrap();
        let (status, body) = call(&app, "PUT", Some(&cookie), Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["revision"], 5);
        // Writers stay, but storage and mirror change: the instance restarts for it.
        assert_eq!(body["restart"], true);
        assert!(dir.join("config.prev").exists());
        let after = Config::load(&dir.join("config.toml")).unwrap();
        assert_eq!((after.revision, after.title.as_str()), (5, "Renamed"));
        assert_eq!((after.site.accent.as_str(), after.site.tagline.as_str()), ("#112233", "Hi"));
        assert_eq!(after.site.hidden_videos, vec![format!("34235:{PK}:intro")]);
        assert_eq!(after.site.links.video, "https://example.org/v/{nip19}");
        assert_eq!(after.site.pages.about.get("de").map(String::as_str), Some("Über uns"));
        assert_eq!(after.site.pages.imprint.get("en").map(String::as_str), Some("Imprint"));
        assert!(after.site.pages.privacy.is_empty());
        assert_eq!(after.site.homepage.featured, format!("34235:{PK}:clip"));
        assert_eq!(after.site.homepage.selected, vec![format!("34236:{PK}:short")]);
        assert_eq!(after.site.homepage.action.as_ref().map(|a| a.url.as_str()), Some("https://support.example/"));
        let (_, read) = call(&app, "GET", Some(&cookie), None, "").await;
        assert_eq!(read["config"]["site"]["homepage"], put_value("#112233")["site"]["homepage"], "the studio reads back what it saved");
        assert_eq!(after.video_sources, vec!["wss://flox-mac.local", "wss://relay.example"]);
        assert_eq!(after.interaction_relays, vec!["wss://relay.example"]);
        assert!(after.profile_relays.is_empty());
        assert_eq!(after.search, Search::Local);
        assert_eq!((after.storage.quota_gib, after.storage.free_space_reserve_gib), (100, 3));
        assert_eq!(after.mirror.relays, vec!["wss://mirror.example"]);
        assert_eq!(after.mirror.blossom, vec!["https://blossom.example"]);
        // Not editable: origin and TLS.
        assert_eq!(after.origin, before.origin);
        assert!(matches!(after.tls, config::Tls::LocalCa { .. }));
        // A studio from before the homepage omits it: that saves as no curation.
        let mut legacy = put_value("#112233");
        legacy["site"].as_object_mut().unwrap().remove("homepage");
        assert_eq!(call(&app, "PUT", Some(&cookie), Some("application/json"), &legacy.to_string()).await.0, StatusCode::OK);
        assert_eq!(Config::load(&dir.join("config.toml")).unwrap().site.homepage, config::SiteHomepage::default());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_public_only_edit_applies_while_running_and_a_storage_change_restarts() {
        let (app, dir, cookie, _, branding) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let json = Some("application/json");
        let public = || serde_json::from_slice::<serde_json::Value>(&branding.public_config()).unwrap();
        let (_, read) = call(&app, "GET", Some(&cookie), None, "").await;
        let mut edit = read["config"].clone();
        edit["title"] = "Live".into();
        edit["site"]["tagline"] = "Now".into();
        edit["videoSources"] = serde_json::json!(["wss://other.example"]);
        assert_eq!(edit["reach"], "private");
        let (status, body) = call(&app, "PUT", Some(&cookie), json, &edit.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &serde_json::Value::Bool(false)), "{body}");
        let live = public();
        assert_eq!((&live["revision"], &live["title"], &live["site"]["tagline"]), (&5.into(), &"Live".into(), &"Now".into()));
        // Private reach: the site gets the instance relay only; the studio keeps the stored list.
        assert_eq!(live["videoSources"], serde_json::json!(["wss://flox-mac.local"]));
        assert_eq!(call(&app, "GET", Some(&cookie), None, "").await.1["config"]["videoSources"], serde_json::json!(["wss://other.example"]));

        edit["storage"]["quotaGib"] = 8.into();
        let (status, body) = call(&app, "PUT", Some(&cookie), json, &edit.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &serde_json::Value::Bool(true)), "{body}");
        // Saved for the next start; the running instance keeps serving the last live revision.
        assert_eq!(Config::load(&dir.join("config.toml")).unwrap().revision, 6);
        assert_eq!(public()["revision"], 5);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn outbox_status_and_retry_need_the_session_and_retry_needs_json() {
        let (app, dir, cookie) = studio_fixture().await;
        let c = Some(cookie.as_str());
        assert_eq!(send(&app, "/api/admin/outbox", None, None).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(send(&app, "/api/admin/outbox/retry", None, Some("{}")).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call_raw(&app, "/api/admin/outbox/retry", c).await, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        assert_eq!(send(&app, "/api/admin/outbox/retry", c, Some(r#"{"all":true}"#)).await.0, StatusCode::BAD_REQUEST);
        let (status, _, body) = send(&app, "/api/admin/outbox/retry", c, Some(r#"{"target":"wss://a.example"}"#)).await;
        assert_eq!((status, body), (StatusCode::OK, serde_json::json!({ "retried": 0 })));
        let (status, _, body) = send(&app, "/api/admin/outbox", c, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, serde_json::json!({ "relays": [], "blossom": [], "counts": [], "problems": [] }));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn behind_a_proxy_saving_needs_no_tls_files() {
        let (app, dir, cookie) = studio_fixture_for("{ mode = \"proxy\", port = 8080 }", false).await;
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
    async fn a_local_origin_needs_both_public_mirrors_to_switch_to_public() {
        let (app, dir, cookie) = studio_fixture_for("{ mode = \"proxy\", port = 8080 }", false).await;
        let (_, read) = call(&app, "GET", Some(&cookie), None, "").await;
        assert_eq!(read["canBePublic"], false, "flox-mac.local is not reachable from the network");
        assert_eq!(read["config"]["reach"], "private");
        let mut edit = put_value("#112233");
        edit["reach"] = "public".into();
        edit["mirror"] = serde_json::json!({"relays": [], "blossom": []});
        let (status, body) = call(&app, "PUT", Some(&cookie), Some("application/json"), &edit.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(Config::load(&dir.join("config.toml")).unwrap().reach, config::Reach::Private);
        edit["mirror"] = serde_json::json!({"relays":["wss://mirror.example"],"blossom":["https://blossom.example"]});
        let (status, body) = call(&app, "PUT", Some(&cookie), Some("application/json"), &edit.to_string()).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(Config::load(&dir.join("config.toml")).unwrap().reach, config::Reach::Public);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn with_a_local_ca_missing_tls_files_still_block_saving() {
        let (app, dir, cookie) = studio_fixture_for("{ mode = \"local-ca\" }", false).await;
        let (status, _) = call(&app, "PUT", Some(&cookie), Some("application/json"), &put_body("#112233")).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        std::fs::remove_dir_all(&dir).ok();
    }

    async fn get_stats(app: &Router, cookie: Option<&str>) -> (StatusCode, serde_json::Value) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().uri("/api/admin/stats");
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        let res = app.clone().oneshot(req.body(axum::body::Body::empty()).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[tokio::test]
    async fn stats_need_a_session_and_leak_nothing_without_one() {
        let (app, dir, cookie) = studio_fixture().await;
        for c in [None, Some("admin_session=forged"), Some(&cookie[..cookie.len() - 1])] {
            let (status, body) = get_stats(&app, c).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{c:?}");
            assert_eq!(body, serde_json::json!({ "error": "not logged in" }));
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    async fn get_plays(app: &Router, cookie: Option<&str>, query: &str) -> (StatusCode, serde_json::Value) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().uri(format!("/api/admin/plays{query}"));
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        let res = app.clone().oneshot(req.body(axum::body::Body::empty()).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    #[tokio::test]
    async fn plays_need_a_session_and_answer_an_object_with_days_clamped() {
        let (app, dir, cookie) = studio_fixture().await;
        for (query, c) in [("", None), ("?days=30", Some("admin_session=forged"))] {
            let (status, body) = get_plays(&app, c, query).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{query} {c:?}");
            assert_eq!(body, serde_json::json!({ "error": "not logged in" }));
        }
        let (status, body) = get_plays(&app, Some(&cookie), "?days=0").await;
        assert_eq!((status, &body), (StatusCode::OK, &serde_json::json!({})), "0 clamps to the default");
        let (status, body) = get_plays(&app, Some(&cookie), "").await;
        assert_eq!((status, body), (StatusCode::OK, serde_json::json!({})));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn stats_report_the_live_relay_and_blossom() {
        let (app, dir, cookie, blossom, _) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let (status, body) = get_stats(&app, Some(&cookie)).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["relay"]["url"], "wss://flox-mac.local");
        assert_eq!(body["relay"]["totalEvents"], 0);
        assert_eq!(body["relay"]["eventsByKind"], serde_json::json!([]));
        assert!(body["relay"]["databaseBytes"].as_u64().unwrap() > 0);
        assert_eq!(body["blossom"]["url"], "https://flox-mac.local");
        assert_eq!(body["blossom"]["files"], 0);
        assert_eq!(body["blossom"]["storageBytes"], 0);
        assert_eq!(body["blossom"]["quotaBytes"], 7 * config::GIB);
        assert_eq!(body["blossom"]["freeSpaceReserveBytes"], 2 * config::GIB);
        assert!(body["blossom"]["freeDiskBytes"].as_u64().unwrap() > 0);
        // A blob entering the live index and a served download show on the next read.
        let blob = almond::models::FileMetadata {
            location: almond::models::FileLocation::Local(dir.join("blossom").join("x")),
            extension: None,
            mime_type: None,
            size: 1234,
            created_at: 0,
            pubkey: None,
            expiration: None,
            origin: Default::default(),
        };
        blossom.file_index.insert("ab".repeat(32), blob).await;
        blossom.metrics.track_download(1234);
        let (_, body) = get_stats(&app, Some(&cookie)).await;
        assert_eq!(body["blossom"]["files"], 1);
        assert_eq!(body["blossom"]["storageBytes"], 1234);
        assert_eq!(body["blossom"]["uploads"], 0);
        assert_eq!(body["blossom"]["downloads"], 1);
        assert_eq!(body["blossom"]["servedBytes"], 1234);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_server_rendered_pages_follow_the_system_theme() {
        for html in [page("Log in", &login_form(None, false)).0, page("Setup", &setup_form(None)).0] {
            assert!(html.contains("color-scheme:light dark"));
            assert!(html.contains("prefers-color-scheme:dark"));
            assert!(html.contains("name=viewport"));
            assert!(html.contains("Nostube Studio"));
            assert!(html.contains("/studio/nostube.svg"));
        }
    }

    #[test]
    fn the_login_page_offers_the_nostr_login_only_when_a_key_is_bound_and_its_script_is_valid() {
        assert!(!login_form(None, false).contains("nostr-login"));
        let with_key = login_form(None, true);
        assert!(with_key.contains("nostr-login"));
        // The script is inserted as it is, so it must not carry format escapes.
        assert!(with_key.contains("addEventListener('click', async () => {"));
        // It waits for an extension that injects its signer after the page loaded.
        assert!(with_key.contains("setInterval") && with_key.contains("window.nostr"));
        assert!(!with_key.contains("{{") && !with_key.contains("}}"));
    }

    #[test]
    fn errors_are_announced_and_escaped() {
        let html = login_form(Some("<b>Wrong</b>"), false);
        assert!(html.contains("role=alert"));
        assert!(html.contains("&lt;b&gt;Wrong&lt;/b&gt;"));
    }

    // ── login rate limit ──

    async fn try_login(app: &Router, password: &str) -> (StatusCode, HeaderMap, String) {
        use tower::ServiceExt;
        let req = axum::http::Request::builder()
            .method("POST")
            .uri("/admin/login")
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(axum::body::Body::from(format!("password={password}")))
            .unwrap();
        let res = app.clone().oneshot(req).await.unwrap();
        let (status, headers) = (res.status(), res.headers().clone());
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, headers, String::from_utf8_lossy(&bytes).into_owned())
    }

    #[tokio::test]
    async fn a_few_wrong_passwords_are_free_and_a_right_one_resets_the_count() {
        let (app, dir, _) = studio_fixture().await;
        for _ in 0..2 {
            let (status, _, body) = try_login(&app, "wrong").await;
            assert_eq!(status, StatusCode::OK);
            assert!(body.contains("Wrong password."));
        }
        let (status, headers, _) = try_login(&app, "correct%20horse").await;
        assert_eq!(status, StatusCode::SEE_OTHER);
        assert!(headers.get(header::SET_COOKIE).is_some());
        // After the success the three free tries are back.
        for _ in 0..3 {
            let (status, _, body) = try_login(&app, "wrong").await;
            assert_eq!(status, StatusCode::OK);
            assert!(!body.contains("Wait"));
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn sessions_drop_secure_only_for_an_explicit_http_origin() {
        use tower::ServiceExt;
        let (https, dir, _) = studio_fixture().await;
        // The same instance with a plain HTTP canonical origin (a FIPS mesh node).
        let http = router(AdminState::open(&dir, "npub1x.fips", vec!["npub1x.fips".into()], "http://npub1x.fips:8080",
            "boot2".into(), Arc::new(axum_server::Handle::new()), stores(&dir).await).unwrap());
        for (app, secure) in [(&https, true), (&http, false)] {
            let (status, headers, _) = try_login(app, "correct%20horse").await;
            assert_eq!(status, StatusCode::SEE_OTHER);
            let set = headers[header::SET_COOKIE].to_str().unwrap().to_owned();
            assert_eq!(set.contains("Secure"), secure, "{set}");
            assert!(set.contains("; HttpOnly;") && set.contains("SameSite=Strict"), "{set}");
            // What the browser keeps opens the studio.
            let session = set.split(';').next().unwrap();
            assert_eq!(send(app, "/api/admin/config", Some(session), None).await.0, StatusCode::OK);
            let req = axum::http::Request::builder().method("POST").uri("/admin/logout").body(axum::body::Body::empty()).unwrap();
            let res = app.clone().oneshot(req).await.unwrap();
            assert_eq!(res.status(), StatusCode::SEE_OTHER);
            let cleared = res.headers()[header::SET_COOKIE].to_str().unwrap();
            assert_eq!(cleared.contains("Secure"), secure, "{cleared}");
            assert!(cleared.starts_with(&format!("{COOKIE}=;")) && cleared.ends_with("Max-Age=0"), "{cleared}");
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn after_three_wrong_passwords_even_the_right_one_has_to_wait() {
        let (app, dir, _) = studio_fixture().await;
        for _ in 0..3 {
            try_login(&app, "wrong").await;
        }
        // The fourth wrong one is answered, with the wait it earned.
        let (status, _, body) = try_login(&app, "wrong").await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("Wait 2 seconds"), "{body}");
        // Within that wait nothing is checked: the right password gets a 429 and no session.
        let (status, headers, body) = try_login(&app, "correct%20horse").await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert!(headers.get(header::SET_COOKIE).is_none());
        let retry: u64 = headers.get(header::RETRY_AFTER).unwrap().to_str().unwrap().parse().unwrap();
        assert!((1..=2).contains(&retry), "{retry}");
        assert!(body.contains("Too many wrong passwords"));
        // The page itself and everything else keep working.
        use tower::ServiceExt;
        let page = app
            .clone()
            .oneshot(axum::http::Request::builder().uri("/admin/login").body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(page.status(), StatusCode::OK);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Real parallel requests (own tasks on several threads), not one after the other.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn a_burst_of_parallel_guesses_is_counted_one_by_one() {
        let (app, dir, _) = studio_fixture().await;
        let tasks: Vec<_> = (0..12)
            .map(|_| {
                let app = app.clone();
                tokio::spawn(async move { try_login(&app, "wrong").await })
            })
            .collect();
        let mut answered = 0;
        let mut refused = 0;
        for task in tasks {
            match task.await.unwrap().0 {
                StatusCode::OK => answered += 1,
                StatusCode::TOO_MANY_REQUESTS => refused += 1,
                other => panic!("unexpected {other}"),
            }
        }
        // Parallel requests do not all slip through before the first failure is counted: past the
        // three free tries and the one that earned the wait, the rest are refused unseen.
        assert_eq!(answered, 4, "three free tries and the one that earned the wait");
        assert_eq!(refused, 8);
        std::fs::remove_dir_all(&dir).ok();
    }

    // ── managed signer ──

    /// A JSON request to `uri`; answers status, headers and the JSON body (Null if none).
    async fn send(app: &Router, uri: &str, cookie: Option<&str>, body: Option<&str>) -> (StatusCode, HeaderMap, serde_json::Value) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().method(if body.is_some() { "POST" } else { "GET" }).uri(uri);
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        if body.is_some() {
            req = req.header(header::CONTENT_TYPE, "application/json");
        }
        let body = axum::body::Body::from(body.unwrap_or_default().to_owned());
        let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
        let (status, headers) = (res.status(), res.headers().clone());
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, headers, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    /// The router of a second process on the same data dir (a restart).
    async fn reopen(dir: &Path) -> Router {
        let state = AdminState::open(
            dir,
            "flox-mac.local",
            vec!["flox-mac.local".into()],
            "https://flox-mac.local",
            "boot2".into(),
            Arc::new(axum_server::Handle::new()),
            stores(dir).await,
        )
        .unwrap();
        router(state)
    }

    #[tokio::test]
    async fn the_managed_signer_signs_with_the_key_it_reports_and_survives_a_restart() {
        let (app, dir, cookie) = studio_fixture().await;
        let c = Some(cookie.as_str());
        // The fixture has a creator and no managed key: the owner signs with an own key.
        let (status, _, state) = send(&app, "/api/admin/signer", c, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(state, serde_json::json!({ "mode": "own", "pubkey": null }));

        // Session and JSON body required, as for every studio write.
        assert_eq!(send(&app, "/api/admin/signer", None, Some("{}")).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call_raw(&app, "/api/admin/signer", c).await, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        // Nothing to sign with yet.
        let event = r#"{"kind":1,"created_at":1700000000,"tags":[["t","x"]],"content":"hello"}"#;
        assert_eq!(send(&app, "/api/admin/signer/sign", c, Some(event)).await.0, StatusCode::CONFLICT);

        let (status, _, created) = send(&app, "/api/admin/signer", c, Some("{}")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(created["mode"], "managed");
        let pubkey = created["pubkey"].as_str().unwrap().to_owned();
        assert_eq!(send(&app, "/api/admin/signer", c, None).await.2, created);
        // Once only: a second call (a retried onboarding) answers the same key, never a new one.
        let (status, _, again) = send(&app, "/api/admin/signer", c, Some("{}")).await;
        assert_eq!((status, again), (StatusCode::OK, created.clone()));

        // Signing needs the session and refuses a body that is not an unsigned event.
        assert_eq!(send(&app, "/api/admin/signer/sign", None, Some(event)).await.0, StatusCode::UNAUTHORIZED);
        let (status, _, error) = send(&app, "/api/admin/signer/sign", c, Some(r#"{"kind":1,"tags":[]}"#)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(error["error"].as_str().unwrap().contains("invalid event"), "{error}");

        let (status, _, signed) = send(&app, "/api/admin/signer/sign", c, Some(event)).await;
        assert_eq!(status, StatusCode::OK);
        let signed = Event::from_json(signed.to_string()).unwrap();
        signed.verify().unwrap();
        assert_eq!(signed.pubkey.to_hex(), pubkey);
        assert_eq!(signed.content, "hello");

        // At rest: an ncryptsec in secrets.toml, its password apart and private.
        let secrets = std::fs::read_to_string(dir.join("secrets.toml")).unwrap();
        assert!(secrets.contains("managed_key = \"ncryptsec1"), "{secrets}");
        assert!(!secrets.contains("nsec1"));
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(dir.join("signer.key")).unwrap().permissions().mode() & 0o777, 0o600);

        // A restart unlocks the same key.
        let app = reopen(&dir).await;
        let (status, _, signed) = send(&app, "/api/admin/signer/sign", c, Some(event)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(signed["pubkey"], pubkey.as_str());

        // Without its password the key stays locked: signing fails loudly, the rest still works.
        std::fs::remove_file(dir.join("signer.key")).unwrap();
        let app = reopen(&dir).await;
        assert_eq!(send(&app, "/api/admin/signer", c, None).await.0, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(send(&app, "/api/admin/signer/sign", c, Some(event)).await.0, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(call(&app, "GET", c, None, "").await.0, StatusCode::OK);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn scheduled_videos_are_submitted_edited_and_cancelled_through_the_studio_endpoints() {
        use sha2::Digest;
        let (app, dir, cookie, blossom, _) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let c = Some(cookie.as_str());
        let pubkey = send(&app, "/api/admin/signer", c, Some("{}")).await.2["pubkey"].as_str().unwrap().to_owned();
        // The managed key becomes the creator, as the studio's config save does.
        let config = std::fs::read_to_string(dir.join("config.toml")).unwrap().replace(PK, &pubkey);
        std::fs::write(dir.join("config.toml"), config).unwrap();

        let bytes = b"scheduled video";
        let hash = format!("{:x}", sha2::Sha256::digest(bytes));
        let path = blossom.storage.uploads.join(format!("{hash}.mp4"));
        tokio::fs::create_dir_all(&blossom.storage.uploads).await.unwrap();
        tokio::fs::write(&path, bytes).await.unwrap();
        blossom.file_index.insert(hash.clone(), almond::models::FileMetadata {
            location: almond::models::FileLocation::Local(path), extension: Some("mp4".into()),
            mime_type: Some("video/mp4".into()), size: bytes.len() as u64, created_at: 1, pubkey: None,
            expiration: None, origin: Default::default(),
        }).await;

        let due = now_secs() + 3600;
        let template = |d: &str, due: u64| serde_json::json!({
            "kind": 34235, "created_at": now_secs(), "content": "hello",
            "tags": [["d", d], ["title", "Later"], ["published_at", due.to_string()],
                     ["imeta", format!("url https://flox-mac.local/{hash}.mp4"), format!("x {hash}")]],
        }).to_string();
        let sign = |body: String| {
            let app = app.clone();
            let cookie = cookie.clone();
            async move { send(&app, "/api/admin/signer/sign", Some(&cookie), Some(&body)).await.2.to_string() }
        };
        let signed = sign(template("later", due)).await;

        // A studio write: session and JSON body.
        assert_eq!(send(&app, "/api/admin/schedule", None, Some(&signed)).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call_raw(&app, "/api/admin/schedule", c).await, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        assert_eq!(send(&app, "/api/admin/schedule", None, None).await.0, StatusCode::UNAUTHORIZED);
        // Refused: not in the future, and a key that is no creator.
        let past = sign(template("later", now_secs() - 10)).await;
        let (status, _, error) = send(&app, "/api/admin/schedule", c, Some(&past)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(error["error"].as_str().unwrap().contains("not in the future"), "{error}");
        let stranger = nostr::prelude::Keys::generate();
        use nostr::prelude::FinalizeEvent;
        let foreign = nostr::prelude::EventBuilder::new(nostr::prelude::Kind::Custom(34235), "x")
            .tags([nostr::prelude::Tag::parse(["d", "x"]).unwrap()]).finalize(&stranger).unwrap().as_json();
        assert_eq!(send(&app, "/api/admin/schedule", c, Some(&foreign)).await.0, StatusCode::BAD_REQUEST);

        let (status, _, accepted) = send(&app, "/api/admin/schedule", c, Some(&signed)).await;
        assert_eq!(status, StatusCode::OK, "{accepted}");
        let id = accepted["id"].as_str().unwrap().to_owned();
        let (_, _, list) = send(&app, "/api/admin/schedule", c, None).await;
        assert_eq!(list["items"][0]["id"], id.as_str());
        assert_eq!(list["items"][0]["state"], "scheduled");
        assert_eq!(list["items"][0]["event"]["pubkey"], pubkey.as_str());

        // Edit before release: the same d tag replaces the held event.
        let edited = sign(template("later", due + 60)).await;
        assert_eq!(send(&app, "/api/admin/schedule", c, Some(&edited)).await.0, StatusCode::OK);
        let (_, _, list) = send(&app, "/api/admin/schedule", c, None).await;
        assert_eq!(list["items"].as_array().unwrap().len(), 1);
        assert_eq!(list["items"][0]["dueAt"], due + 60);

        // Cancelling drops it; a second cancel finds nothing.
        let new_id = list["items"][0]["id"].as_str().unwrap().to_owned();
        let cancel = serde_json::json!({ "id": new_id }).to_string();
        assert_eq!(send(&app, "/api/admin/schedule/cancel", None, Some(&cancel)).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(send(&app, "/api/admin/schedule/cancel", c, Some(&cancel)).await.0, StatusCode::OK);
        assert_eq!(send(&app, "/api/admin/schedule/cancel", c, Some(&cancel)).await.0, StatusCode::BAD_REQUEST);
        assert!(send(&app, "/api/admin/schedule", c, None).await.2["items"].as_array().unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// A POST without a content type (what a cross-site form could send, minus its type).
    async fn call_raw(app: &Router, uri: &str, cookie: Option<&str>) -> StatusCode {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().method("POST").uri(uri);
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        app.clone().oneshot(req.body(axum::body::Body::empty()).unwrap()).await.unwrap().status()
    }

    #[tokio::test]
    async fn exporting_the_managed_key_needs_the_admin_password() {
        use nostr::prelude::{FromBech32, Keys, SecretKey};
        let (app, dir, cookie) = studio_fixture().await;
        let c = Some(cookie.as_str());
        let export = |pw: &str| serde_json::json!({ "password": pw }).to_string();
        assert_eq!(send(&app, "/api/admin/signer/export", c, Some(&export("correct horse"))).await.0, StatusCode::CONFLICT);
        let pubkey = send(&app, "/api/admin/signer", c, Some("{}")).await.2["pubkey"].as_str().unwrap().to_owned();

        assert_eq!(send(&app, "/api/admin/signer/export", None, Some(&export("correct horse"))).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(send(&app, "/api/admin/signer/export", c, Some("{}")).await.0, StatusCode::BAD_REQUEST);
        let (status, _, body) = send(&app, "/api/admin/signer/export", c, Some(&export("wrong"))).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(body.get("nsec").is_none());

        let (status, headers, body) = send(&app, "/api/admin/signer/export", c, Some(&export("correct horse"))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[header::CACHE_CONTROL], "private, no-store");
        let secret = SecretKey::from_bech32(body["nsec"].as_str().unwrap()).unwrap();
        assert_eq!(Keys::new(secret).public_key().to_hex(), pubkey);

        // Wrong export passwords count towards the login throttle, and the other way round.
        for _ in 0..4 {
            send(&app, "/api/admin/signer/export", c, Some(&export("wrong"))).await;
        }
        let (status, headers, _) = send(&app, "/api/admin/signer/export", c, Some(&export("correct horse"))).await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert!(headers.get(header::RETRY_AFTER).is_some());
        assert_eq!(try_login(&app, "correct%20horse").await.0, StatusCode::TOO_MANY_REQUESTS);
        std::fs::remove_dir_all(&dir).ok();
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    async fn branding_call(app: &Router, method: &str, slot: &str, cookie: Option<&str>, content_type: Option<&str>, body: Vec<u8>) -> (StatusCode, serde_json::Value) {
        use tower::ServiceExt;
        let mut req = axum::http::Request::builder().method(method).uri(format!("/api/admin/branding/{slot}"));
        if let Some(c) = cookie {
            req = req.header(header::COOKIE, c);
        }
        if let Some(t) = content_type {
            req = req.header(header::CONTENT_TYPE, t);
        }
        let res = app.clone().oneshot(req.body(axum::body::Body::from(body)).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null))
    }

    fn public_site(branding: &crate::branding::Branding) -> serde_json::Value {
        serde_json::from_slice::<serde_json::Value>(&branding.public_config()).unwrap()["site"].clone()
    }

    #[tokio::test]
    async fn branding_uploads_need_a_session_and_a_real_image_within_the_limit() {
        use tower::ServiceExt;
        let (app, dir, cookie, _, branding) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let c = Some(cookie.as_str());
        let png = Some("image/png");
        assert_eq!(branding_call(&app, "PUT", "logo", None, png, PNG.to_vec()).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(branding_call(&app, "PUT", "logo", Some("admin_session=forged"), png, PNG.to_vec()).await.0, StatusCode::UNAUTHORIZED);
        // A cross-site form can send text/plain; only image types are taken.
        assert_eq!(branding_call(&app, "PUT", "logo", c, Some("text/plain"), PNG.to_vec()).await.0, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        // An HTML page renamed to .png: the bytes decide, not the declared type.
        let html = b"<!doctype html><script>alert(1)</script>".to_vec();
        let (status, body) = branding_call(&app, "PUT", "logo", c, png, html).await;
        assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE, "{body}");
        assert_eq!(body["error"], "the logo must be a PNG, JPEG, WebP or SVG image");
        // ICO is for the favicon only.
        let ico = vec![0, 0, 1, 0, 1, 0];
        assert_eq!(branding_call(&app, "PUT", "logo", c, Some("image/x-icon"), ico.clone()).await.0, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        assert_eq!(branding_call(&app, "PUT", "favicon", c, Some("image/x-icon"), ico).await.0, StatusCode::OK);
        // One byte over the limit: read up to the limit (no length announced) ...
        let mut big = PNG.to_vec();
        big.resize(512 * 1024 + 1, 0);
        let (status, body) = branding_call(&app, "PUT", "logo", c, png, big.clone()).await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE, "{body}");
        // ... or refused before reading when the announced length is too large.
        let req = axum::http::Request::builder()
            .method("PUT")
            .uri("/api/admin/branding/logo")
            .header(header::COOKIE, &cookie)
            .header(header::CONTENT_TYPE, "image/png")
            .header(header::CONTENT_LENGTH, big.len())
            .body(axum::body::Body::from(big.clone()))
            .unwrap();
        assert_eq!(app.clone().oneshot(req).await.unwrap().status(), StatusCode::PAYLOAD_TOO_LARGE);
        // The banner may be larger.
        assert_eq!(branding_call(&app, "PUT", "banner", c, png, big).await.0, StatusCode::OK);
        assert_eq!(branding_call(&app, "PUT", "nope", c, png, PNG.to_vec()).await.0, StatusCode::NOT_FOUND);
        // The icon: a square PNG of at least 512×512, nothing else.
        let png_of = |w: u32, h: u32| [PNG, &w.to_be_bytes(), &h.to_be_bytes()].concat();
        let (status, body) = branding_call(&app, "PUT", "icon", c, Some("image/svg+xml"), b"<svg></svg>".to_vec()).await;
        assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE, "{body}");
        assert_eq!(body["error"], "the icon must be a PNG image");
        for bad in [png_of(512, 256), png_of(256, 256), PNG.to_vec()] {
            let (status, body) = branding_call(&app, "PUT", "icon", c, png, bad).await;
            assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
            assert_eq!(body["error"], crate::branding::ICON_REFUSAL);
        }
        assert!(public_site(&branding)["icon"].is_null());
        assert_eq!(branding_call(&app, "PUT", "icon", c, png, png_of(512, 512)).await.0, StatusCode::OK);
        assert!(public_site(&branding)["icon"].as_str().is_some_and(|u| u.starts_with("/branding/icon?v=")));
        let site = public_site(&branding);
        assert!(site["logo"].is_null(), "{site}");
        assert!(site["favicon"].as_str().is_some_and(|u| u.starts_with("/branding/favicon?v=")));
        assert!(!dir.join("branding").join("logo.png").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn branding_activates_only_valid_local_blossom_images_without_reuploading() {
        use sha2::{Digest, Sha256};
        let hash = format!("{:x}", Sha256::digest(PNG));
        let (_, dir, cookie, _, _) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let keys = Keys::generate();
        let mut live = stores(&dir).await;
        live.relay = Relay::open(&dir.join("managed-relay.sqlite"), crate::relay::RelayConfig {
            writers: vec![keys.public_key()], name: "t".into(), description: "t".into(), mirror_relays: vec![],
        }).unwrap();
        let relay = live.relay.clone();
        let blossom = live.blossom.clone();
        let branding = live.branding.clone();
        let state = AdminState::open(&dir, "flox-mac.local", vec!["flox-mac.local".into()],
            "https://flox-mac.local", "boot".into(), Arc::new(axum_server::Handle::new()), live).unwrap();
        *state.managed.lock() = Some(Ok(keys.clone()));
        let app = router(state);
        let path = dir.join("blossom").join(&hash);
        tokio::fs::write(&path, PNG).await.unwrap();
        blossom.file_index.insert(hash.clone(), almond::models::FileMetadata {
            location: almond::models::FileLocation::Local(path.clone()), extension: Some("png".into()),
            mime_type: Some("image/png".into()), size: PNG.len() as u64, created_at: 1, pubkey: None,
            expiration: None, origin: Default::default(),
        }).await;
        let body = serde_json::json!({ "sha256": hash }).to_string().into_bytes();
        let json = Some("application/json");
        let c = Some(cookie.as_str());
        assert_eq!(branding_call(&app, "PUT", "logo", None, json, body.clone()).await.0, StatusCode::UNAUTHORIZED);
        for bad in [r#"{"sha256":"../../secrets.toml"}"#.to_owned(), serde_json::json!({ "sha256": "ab".repeat(32) }).to_string()] {
            assert!(!branding_call(&app, "PUT", "logo", c, json, bad.into_bytes()).await.0.is_success());
            assert!(public_site(&branding)["logo"].is_null());
        }
        let (status, response) = tokio::time::timeout(Duration::from_secs(2),
            branding_call(&app, "PUT", "logo", c, json, body.clone())).await.expect("branding activation must not deadlock profile publication");
        assert_eq!(status, StatusCode::OK, "{response}");
        assert_eq!(public_site(&branding)["logo"], response["url"]);
        assert_eq!(std::fs::read(dir.join("branding/logo.png")).unwrap(), PNG);
        let profile = relay.stored(nostr::prelude::Filter::new().author(keys.public_key()).kind(nostr::prelude::Kind::Metadata)).await.unwrap();
        let content: serde_json::Value = serde_json::from_str(&profile[0].content).unwrap();
        assert!(content.get("picture").is_none(), "a private LAN profile carries no unreachable image URL: {content}");
        // Refused replacements leave the existing branding untouched, regardless of declared MIME/size.
        tokio::fs::write(&path, b"<html>").await.unwrap();
        assert_eq!(branding_call(&app, "PUT", "logo", c, json, body.clone()).await.0, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        tokio::fs::write(&path, vec![0; 512 * 1024 + 1]).await.unwrap();
        assert_eq!(branding_call(&app, "PUT", "logo", c, json, body).await.0, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(std::fs::read(dir.join("branding/logo.png")).unwrap(), PNG);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_lightning_address_is_checked_applied_while_running_and_published_as_lud16() {
        let (_, dir, cookie, _, _) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let keys = Keys::generate();
        let mut live = stores(&dir).await;
        live.relay = Relay::open(&dir.join("managed-relay.sqlite"), crate::relay::RelayConfig {
            writers: vec![keys.public_key()], name: "t".into(), description: "t".into(), mirror_relays: vec![],
        }).unwrap();
        let relay = live.relay.clone();
        let state = AdminState::open(&dir, "flox-mac.local", vec!["flox-mac.local".into()],
            "https://flox-mac.local", "boot".into(), Arc::new(axum_server::Handle::new()), live).unwrap();
        *state.managed.lock() = Some(Ok(keys.clone()));
        let app = router(state);
        let (c, json) = (Some(cookie.as_str()), Some("application/json"));
        let mut edit = call(&app, "GET", c, None, "").await.1["config"].clone();
        assert_eq!(edit["site"]["lightning"], "");
        edit["site"]["lightning"] = "no address".into();
        let (status, body) = call(&app, "PUT", c, json, &edit.to_string()).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].as_str().unwrap().starts_with("site.lightning must be a lightning address"), "{body}");
        edit["site"]["lightning"] = "channel@wallet.example".into();
        let (status, body) = call(&app, "PUT", c, json, &edit.to_string()).await;
        assert_eq!((status, &body["restart"]), (StatusCode::OK, &serde_json::Value::Bool(false)), "{body}");
        assert_eq!(call(&app, "GET", c, None, "").await.1["config"]["site"]["lightning"], "channel@wallet.example");
        let profile = relay.stored(nostr::prelude::Filter::new().author(keys.public_key()).kind(nostr::prelude::Kind::Metadata)).await.unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(&profile[0].content).unwrap()["lud16"], "channel@wallet.example");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn an_upload_shows_in_the_public_config_at_once_and_a_delete_takes_it_out() {
        let (app, dir, cookie, _, branding) = studio_fixture_with_stores("{ mode = \"local-ca\" }", true).await;
        let c = Some(cookie.as_str());
        assert!(public_site(&branding)["logo"].is_null());
        let (status, body) = branding_call(&app, "PUT", "logo", c, Some("image/png"), PNG.to_vec()).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let url = body["url"].as_str().unwrap().to_owned();
        assert!(url.starts_with("/branding/logo?v="), "{url}");
        // Same process, no restart: the public config and the studio already have it.
        let site = public_site(&branding);
        assert_eq!(site["logo"], url.as_str());
        assert_eq!(site["tagline"], "", "the rest of the site config stays: {site}");
        assert_eq!(call(&app, "GET", c, None, "").await.1["branding"]["logo"], url.as_str());
        assert_eq!(std::fs::read(dir.join("branding").join("logo.png")).unwrap(), PNG);

        // Deleting is a write like the others: a session and JSON.
        assert_eq!(branding_call(&app, "DELETE", "logo", c, None, vec![]).await.0, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        assert_eq!(branding_call(&app, "DELETE", "logo", None, Some("application/json"), vec![]).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(branding_call(&app, "DELETE", "logo", c, Some("application/json"), vec![]).await.0, StatusCode::OK);
        let site = public_site(&branding);
        assert!(site.get("logo").is_none(), "{site}");
        assert!(!dir.join("branding").join("logo.png").exists());
        assert!(call(&app, "GET", c, None, "").await.1["branding"]["logo"].is_null());
        std::fs::remove_dir_all(&dir).ok();
    }
}
