//! nostube-server: relay, Blossom (almond library), `/api/*` and the embedded Nostube
//! instance build on one origin (ADR 0004). Usage: `nostube-server --data <dir>`;
//! the instance config is `<dir>/config.toml`.

mod config;
mod relay;
mod tls;

use std::{net::SocketAddr, path::PathBuf};

use axum::{
    body::Body,
    extract::State,
    http::{header, Method, Request, StatusCode},
    response::{IntoResponse, Response},
    Json, Router,
};
use config::{Config, GIB, PER_FILE_MAX};
use tower::ServiceExt;

#[derive(rust_embed::Embed)]
#[folder = "web/dist/"]
struct Web;

#[derive(Clone)]
struct App {
    blossom: Router,
    relay: relay::Relay,
    /// Serialized public config, built once per start (config changes need a restart).
    public_config: axum::body::Bytes,
}

type BoxError = Box<dyn std::error::Error + Send + Sync>;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    // Startup failures end with one line naming the cause (#7), then exit.
    if let Err(e) = run().await {
        tracing::error!("startup failed: {e}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), BoxError> {
    // The process owner installs the one provider; libraries never do (#12).
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .map_err(|_| "rustls provider already installed")?;

    let data = data_dir()?;
    let cfg = Config::load(&data.join("config.toml"))?;
    let config::Tls::LocalCa { router_name, https_port, http_port } = &cfg.tls;
    let (https_port, http_port) = (*https_port, *http_port);

    let names = tls::LocalNames::detect(router_name.clone())?;
    let covered = names.local_name.eq_ignore_ascii_case(&cfg.origin_host)
        || names.router_name.as_deref().is_some_and(|n| n.eq_ignore_ascii_case(&cfg.origin_host))
        || cfg.origin_host.parse().is_ok_and(|ip| names.ips.contains(&ip));
    if !covered {
        return Err(format!(
            "origin host {} is not one of the certificate names ({}, router name {:?}, IPs {:?})",
            cfg.origin_host, names.local_name, names.router_name, names.ips
        )
        .into());
    }
    let ca = tls::local_ca(&data.join("tls"), &names).await?;

    let mut blossom = almond::Config::defaults();
    blossom.storage_path = data.join("blossom");
    blossom.public_url = Some(cfg.origin.clone());
    blossom.allowed_npubs = cfg.allowed_writers.clone();
    blossom.homepage_enabled = false;
    blossom.blob_max_size = PER_FILE_MAX;
    blossom.storage_max_size = cfg.storage.quota_gib * GIB;
    blossom.storage_min_free = cfg.storage.free_space_reserve_gib * GIB;
    let blossom = blossom.validate()?;
    let state = almond::build_state(&blossom).await?;
    let _tasks = almond::spawn_background_tasks(&state, &blossom);

    let app = App {
        blossom: almond::create_app(state),
        relay: relay::Relay::open(
            &data.join("relay.sqlite"),
            relay::RelayConfig {
                writers: cfg.allowed_writers.clone(),
                name: cfg.title.clone(),
                description: format!("Relay of the Nostube instance {}", cfg.title),
            },
        )?,
        public_config: serde_json::to_vec(&cfg.public_json())?.into(),
    };

    let http = tokio::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], http_port))).await?;
    let onboarding = tls::onboarding_router(&ca, cfg.origin.clone());
    tokio::spawn(async move {
        if let Err(e) = axum::serve(http, onboarding).await {
            tracing::error!("port {} listener stopped: {e}", http_port);
        }
    });

    tracing::info!("serving {} (also https://{}:{https_port}, CA on http port {http_port})", cfg.origin, names.local_name);
    axum_server::bind_rustls(SocketAddr::from(([0, 0, 0, 0], https_port)), ca.rustls.clone())
        .serve(Router::new().fallback(dispatch).with_state(app).into_make_service())
        .await?;
    Ok(())
}

fn data_dir() -> Result<PathBuf, BoxError> {
    let mut args = std::env::args().skip(1);
    match (args.next().as_deref(), args.next(), args.next()) {
        (Some("--data"), Some(dir), None) => Ok(dir.into()),
        _ => Err("usage: nostube-server --data <dir>".into()),
    }
}

/// ADR 0004 dispatch order: relay, /api, Blossom, root files, app shell.
async fn dispatch(State(app): State<App>, req: Request<Body>) -> Response {
    let path = req.uri().path().to_owned();
    if path == "/" && (relay::is_ws_upgrade(&req) || relay::wants_nip11(&req)) {
        return relay::handle(app.relay, req).await;
    }
    if path.starts_with("/api/") {
        return match (req.method(), path.as_str()) {
            (&Method::GET, "/api/config") => (
                [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")],
                app.public_config,
            )
                .into_response(),
            (&Method::GET, "/api/health") => Json(serde_json::json!({ "ok": true })).into_response(),
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
        Method::PATCH => seg == "upload",
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
