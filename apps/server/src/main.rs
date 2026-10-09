//! nostube-server: relay, Blossom (almond library), `/api/*` and the embedded Nostube site
//! on one origin (ADR 0004). Usage: `nostube-server --data <dir>`;
//! the instance config is `<dir>/config.toml`.

mod admin;
mod config;
mod relay;
mod tls;

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

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
    boot_id: String,
    /// `/admin` router; `None` when the secrets file is broken (#7).
    admin: Option<Router>,
}

type BoxError = Box<dyn std::error::Error + Send + Sync>;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    // Startup failures end with one line naming the cause (#7), then exit.
    let cli = match Cli::parse(std::env::args().skip(1)) {
        Ok(cli) => cli,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    match std::env::args().nth(1).as_deref() {
        Some("admin") if std::env::args().nth(2).as_deref() == Some("reset") => {
            if let Err(e) = admin::AdminState::reset(&cli.data) {
                eprintln!("admin reset failed: {e}");
                std::process::exit(1);
            }
            return;
        }
        Some("config") if std::env::args().nth(2).as_deref() == Some("rollback") => {
            if let Err(e) = admin::rollback(&cli.data) {
                eprintln!("config rollback failed: {e}");
                std::process::exit(1);
            }
            return;
        }
        _ => {}
    }
    if let Err(e) = run(cli).await {
        tracing::error!("startup failed: {e}");
        std::process::exit(1);
    }
}

/// Listener overrides do not change an existing canonical origin.
struct Cli {
    data: PathBuf,
    bind: std::net::IpAddr,
    port: Option<u16>,
    http_port: Option<u16>,
}

impl Cli {
    fn parse(mut args: impl Iterator<Item = String>) -> Result<Cli, BoxError> {
        let mut cli = Cli { data: "data".into(), bind: std::net::Ipv4Addr::UNSPECIFIED.into(), port: None, http_port: None };
        while let Some(a) = args.next() {
            match a.as_str() {
                "--data" => cli.data = args.next().ok_or("--data needs a directory")?.into(),
                "--bind" => cli.bind = args.next().ok_or("--bind needs an IP address")?.parse()
                    .map_err(|e| format!("invalid --bind: {e}"))?,
                "--port" => {
                    let port = args.next().ok_or("--port needs a port")?.parse()
                        .map_err(|e| format!("invalid --port: {e}"))?;
                    if port == 0 { return Err("--port must be between 1 and 65535".into()); }
                    cli.port = Some(port);
                }
                "--http-port" => cli.http_port = Some(args.next().ok_or("--http-port needs a port (0 = off)")?.parse()
                    .map_err(|e| format!("invalid --http-port: {e}"))?),
                "admin" | "reset" | "config" | "rollback" => {}
                _ => return Err(format!("unknown argument {a}; usage: nostube-server [--data <dir>] [--bind <IP>] [--port <HTTPS port>] [--http-port <port|0>]").into()),
            }
        }
        Ok(cli)
    }
}

async fn run(cli: Cli) -> Result<(), BoxError> {
    // The process owner installs the one provider; libraries never do (#12).
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .map_err(|_| "rustls provider already installed")?;

    let data = cli.data;
    std::fs::create_dir_all(&data)?;
    // First start needs nothing: the default config is written and the admin
    // registers at /admin/setup with the logged token, everything else is the
    // web UI (#17 flow).
    let config_path = data.join("config.toml");
    let cfg = if config_path.exists() {
        Config::load(&config_path)?
    } else {
        let names = tls::LocalNames::detect(None)?;
        let cfg = Config::default_for(
            &names.local_name,
            cli.port.unwrap_or(443),
            cli.http_port.unwrap_or(80),
        );
        std::fs::write(&config_path, cfg.to_toml()?)?;
        tracing::info!(
            "first start: wrote default {} (origin {}; refine at /admin after setup)",
            config_path.display(),
            cfg.origin
        );
        cfg
    };
    let config::Tls::LocalCa { router_name, https_port, http_port } = &cfg.tls;
    let (https_port, http_port) = (*https_port, *http_port);
    // Transport overrides for this run; the config file keeps its values.
    let https_port = cli.port.unwrap_or(https_port);
    let mut setup_origin = nostr::prelude::Url::parse(&cfg.origin)?;
    setup_origin.set_port((https_port != 443).then_some(https_port)).map_err(|_| "invalid setup port")?;
    // `http_port = 0` (or `--http-port 0`) disables the port-80 onboarding
    // listener (e.g. behind a proxy that owns port 80).
    let http_port = cli.http_port.unwrap_or(http_port);
    if http_port != 0 && http_port == https_port {
        return Err("HTTPS and HTTP onboarding ports must differ (use --http-port 0 to disable onboarding)".into());
    }
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

    // Broken secrets only disable the admin area, never the instance (#7).
    let boot_id = admin::random_boot_id();
    let handle = Arc::new(axum_server::Handle::new());
    let admin = match admin::AdminState::open(
        &data,
        &cfg.origin_host,
        tls::covered_hosts(&names),
        &setup_origin.origin().ascii_serialization(),
        boot_id.clone(),
        handle.clone(),
    ) {
        Ok(a) => Some(admin::router(a)),
        Err(e) => {
            tracing::warn!("admin disabled: {e}");
            None
        }
    };

    let mut blossom = almond::Config::defaults();
    blossom.storage_path = data.join("blossom");
    blossom.public_url = Some(cfg.origin.clone());
    blossom.allowed_npubs = cfg.allowed_writers.clone();
    // An empty instance allowlist means nobody, not Almond's public default.
    if cfg.allowed_writers.is_empty() {
        blossom.upload_access = almond::models::FeatureMode::Off;
        blossom.mirror_access = almond::models::FeatureMode::Off;
    }
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
        boot_id,
        admin,
    };

    if http_port != 0 {
        // Port 80 is a nice-to-have (CA onboarding); a busy or privileged port
        // must not keep the instance from starting — warn and serve.
        match tokio::net::TcpListener::bind(SocketAddr::new(cli.bind, http_port)).await {
            Ok(http) => {
                let onboarding = tls::onboarding_router(&ca, cfg.origin.clone());
                tracing::info!("CA onboarding at http://{}:{http_port}/ca", names.local_name);
                tokio::spawn(async move {
                    if let Err(e) = axum::serve(http, onboarding).await {
                        tracing::error!("port {} listener stopped: {e}", http_port);
                    }
                });
            }
            Err(e) => tracing::warn!(
                "CA onboarding on http port {http_port} unavailable ({e}); serve /ca another way or change http_port"
            ),
        }
    } else {
        tracing::info!("http onboarding listener disabled (http_port = 0)");
    }

    tracing::info!("serving {} on HTTPS {}:{https_port}", cfg.origin, cli.bind);
    let address = SocketAddr::new(cli.bind, https_port);
    let listener = std::net::TcpListener::bind(address)
        .map_err(|e| format!("cannot bind HTTPS listener {address}: {e}"))?;
    listener.set_nonblocking(true)?;
    axum_server::from_tcp_rustls(listener, ca.rustls.clone())?
        .handle((*handle).clone())
        .serve(Router::new().fallback(dispatch).with_state(app).into_make_service())
        .await?;
    // A config apply brought us here: the supervisor (launchd) restarts the process.
    tracing::info!("stopped; restart the service to run the applied config");
    Ok(())
}

/// ADR 0004 dispatch order: relay, /admin, /api (`/api/admin/*` goes to the admin router),
/// Blossom, the studio (`/studio/*`), root files, app shell.
async fn dispatch(State(app): State<App>, req: Request<Body>) -> Response {
    let path = req.uri().path().to_owned();
    if path == "/" && (relay::is_ws_upgrade(&req) || relay::wants_nip11(&req)) {
        return relay::handle(app.relay, req).await;
    }
    if path == "/admin" || path.starts_with("/admin/") {
        return match &app.admin {
            Some(router) => router.clone().oneshot(req).await.into_response(),
            None => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        };
    }
    if path.starts_with("/api/admin/") {
        return match &app.admin {
            Some(router) => router.clone().oneshot(req).await.into_response(),
            None => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        };
    }
    if path.starts_with("/api/") {
        return match (req.method(), path.as_str()) {
            (&Method::GET, "/api/config") => (
                [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")],
                app.public_config,
            )
                .into_response(),
            (&Method::GET, "/api/health") => {
                Json(serde_json::json!({ "ok": true, "boot": app.boot_id })).into_response()
            }
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
    if file == "studio" || file.starts_with("studio/") {
        return studio_asset(file);
    }
    if let Some(asset) = (!file.is_empty()).then(|| Web::get(file)).flatten() {
        return asset_response(file, asset.data);
    }
    if file.starts_with("assets/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    let shell = Web::get("index.html").expect("embedded index.html");
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], shell.data).into_response()
}

/// The studio is its own single-page app under `/studio/`: files by path, the app shell for every
/// other route, 404 when it was not built into this binary or a hashed asset is missing.
fn studio_asset(file: &str) -> Response {
    let file = if file == "studio" { "studio/" } else { file };
    let found = (file != "studio/").then(|| Web::get(file)).flatten();
    if let Some(asset) = found {
        return asset_response(file, asset.data);
    }
    if file.starts_with("studio/assets/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    match Web::get("studio/index.html") {
        Some(shell) => asset_response("studio/index.html", shell.data),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Hashed build assets never change; everything else (the shells) is revalidated.
fn asset_response(file: &str, data: std::borrow::Cow<'static, [u8]>) -> Response {
    let cache = if file.starts_with("assets/") || file.starts_with("studio/assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    let mime = mime_guess::from_path(file).first_or_octet_stream();
    ([(header::CONTENT_TYPE, mime.as_ref().to_owned()), (header::CACHE_CONTROL, cache.to_owned())], data).into_response()
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
