//! Build-check spike (ticket #12). Env: NSS_DATA_DIR, NSS_WRITER (hex pubkey), NSS_PORT.

mod relay;

use std::{env, path::PathBuf};

use axum::{
    body::Body,
    extract::State,
    http::{header, Method, Request, StatusCode},
    response::{IntoResponse, Response},
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use nostr::prelude::PublicKey;
use tower::ServiceExt;

#[derive(rust_embed::Embed)]
#[folder = "web/dist/"]
struct Web;

#[derive(Clone)]
struct App {
    blossom: Router,
    relay: relay::Relay,
}

type BoxError = Box<dyn std::error::Error + Send + Sync>;

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    // The process owner installs the one provider; libraries never do.
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .map_err(|_| "rustls provider already installed")?;

    let data = PathBuf::from(env::var("NSS_DATA_DIR")?);
    let port: u16 = env::var("NSS_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8443);
    let writer = PublicKey::parse(&env::var("NSS_WRITER")?)?;
    std::fs::create_dir_all(&data)?;

    let mut cfg = almond::Config::defaults();
    cfg.storage_path = data.join("blossom");
    cfg.public_url = Some(format!("https://localhost:{port}"));
    cfg.allowed_npubs = vec![writer];
    cfg.homepage_enabled = false;
    let cfg = cfg.validate()?;
    let state = almond::build_state(&cfg).await?;
    let _tasks = almond::spawn_background_tasks(&state, &cfg);
    let app = App {
        blossom: almond::create_app(state),
        relay: relay::Relay::open(&data.join("relay.sqlite"), vec![writer])?,
    };

    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into(), "127.0.0.1".into()])?;
    let tls = RustlsConfig::from_pem(cert.cert.pem().into_bytes(), cert.signing_key.serialize_pem().into_bytes()).await?;
    tracing::info!("listening on https://localhost:{port}");
    axum_server::bind_rustls(std::net::SocketAddr::from(([0, 0, 0, 0], port)), tls)
        .serve(Router::new().fallback(dispatch).with_state(app).into_make_service())
        .await?;
    Ok(())
}

/// ADR 0004 dispatch order: relay, /api, Blossom, static files, app shell.
async fn dispatch(State(app): State<App>, req: Request<Body>) -> Response {
    let path = req.uri().path().to_owned();
    if path == "/" && (relay::is_ws_upgrade(&req) || relay::wants_nip11(&req)) {
        return relay::handle(app.relay, req).await;
    }
    if path.starts_with("/api/") {
        return match path.as_str() {
            "/api/health" => Json(serde_json::json!({ "ok": true })).into_response(),
            _ => StatusCode::NOT_FOUND.into_response(),
        };
    }
    if is_blossom(req.method(), &path) {
        return app.blossom.oneshot(req).await.into_response();
    }
    if !matches!(*req.method(), Method::GET | Method::HEAD) {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let file = path.trim_start_matches('/');
    if let Some(asset) = (!file.is_empty()).then(|| Web::get(file)).flatten() {
        let cache = if file.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
        let mime = mime_guess::from_path(file).first_or_octet_stream();
        return ([(header::CONTENT_TYPE, mime.as_ref()), (header::CACHE_CONTROL, cache)], asset.data).into_response();
    }
    if file.starts_with("assets/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    let shell = Web::get("index.html").expect("embedded index.html");
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], shell.data).into_response()
}

fn is_blossom(method: &Method, path: &str) -> bool {
    let seg = path.trim_start_matches('/');
    match *method {
        Method::PUT => matches!(seg, "upload" | "mirror" | "report"),
        Method::HEAD | Method::OPTIONS if matches!(seg, "upload" | "mirror" | "report") => true,
        Method::GET if seg.starts_with("list/") => true,
        Method::GET | Method::HEAD | Method::DELETE | Method::OPTIONS => is_blob_name(seg),
        _ => false,
    }
}

/// `<sha256>` or `<sha256>.<ext>` at the root.
fn is_blob_name(seg: &str) -> bool {
    let hash = seg.split_once('.').map_or(seg, |(h, _)| h);
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
}
