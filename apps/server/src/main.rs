//! nostube-server: relay, Blossom (almond library), `/api/*` and the embedded Nostube site
//! on one origin (ADR 0004). Usage: `nostube-server --data <dir>`;
//! the instance config is `<dir>/config.toml`.

mod admin;
mod config;
mod login_guard;
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
    let cli = match Cli::parse(std::env::args().skip(1), |name| std::env::var(name).ok()) {
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

/// How the instance gets its TLS, chosen at the first start.
#[derive(Debug, Clone, Copy, PartialEq)]
enum TlsKind {
    LocalCa,
    Proxy,
}

/// The command line, with `NOSTUBE_*` environment fallbacks so a container needs no arguments.
/// Flags win over the environment. Everything here is a transport or first-start choice: an
/// existing config keeps its canonical origin and TLS mode.
#[derive(Debug)]
struct Cli {
    data: PathBuf,
    /// Default: all interfaces for `local-ca`, loopback behind a proxy (plain HTTP must not be
    /// reachable from outside by accident; the container image sets `0.0.0.0`).
    bind: Option<std::net::IpAddr>,
    port: Option<u16>,
    http_port: Option<u16>,
    /// First start only: the canonical origin (`https://host`) of an instance behind a proxy.
    origin: Option<String>,
    /// First start only. `proxy` when an origin is given, else `local-ca`.
    tls: Option<TlsKind>,
}

const USAGE: &str = "usage: nostube-server [--data <dir>] [--bind <IP>] [--port <port>] [--http-port <port|0>] \
[--origin <https://host>] [--tls <proxy|local-ca>] (each also as NOSTUBE_DATA, NOSTUBE_BIND, NOSTUBE_PORT, \
NOSTUBE_HTTP_PORT, NOSTUBE_ORIGIN, NOSTUBE_TLS)";

impl Cli {
    fn parse(args: impl Iterator<Item = String>, env: impl Fn(&str) -> Option<String>) -> Result<Cli, BoxError> {
        let mut cli = Cli { data: "data".into(), bind: None, port: None, http_port: None, origin: None, tls: None };
        for name in ["data", "bind", "port", "http-port", "origin", "tls"] {
            let var = format!("NOSTUBE_{}", name.to_uppercase().replace('-', "_"));
            if let Some(value) = env(&var).filter(|v| !v.trim().is_empty()) {
                cli.set(name, value).map_err(|e| format!("{var}: {e}"))?;
            }
        }
        let mut args = args;
        while let Some(a) = args.next() {
            match a.as_str() {
                "admin" | "reset" | "config" | "rollback" => {}
                flag if flag.starts_with("--") && ["data", "bind", "port", "http-port", "origin", "tls"].contains(&&flag[2..]) => {
                    let value = args.next().ok_or(format!("{flag} needs a value"))?;
                    cli.set(&flag[2..], value).map_err(|e| format!("{flag}: {e}"))?;
                }
                _ => return Err(format!("unknown argument {a}; {USAGE}").into()),
            }
        }
        Ok(cli)
    }

    fn set(&mut self, name: &str, value: String) -> Result<(), BoxError> {
        match name {
            "data" => self.data = value.into(),
            "bind" => self.bind = Some(value.parse().map_err(|e| format!("invalid IP address: {e}"))?),
            "port" => {
                let port: u16 = value.parse().map_err(|e| format!("invalid port: {e}"))?;
                if port == 0 {
                    return Err("the port must be between 1 and 65535".into());
                }
                self.port = Some(port);
            }
            "http-port" => self.http_port = Some(value.parse().map_err(|e| format!("invalid port: {e}"))?),
            "origin" => self.origin = Some(value.trim().trim_end_matches('/').to_owned()),
            "tls" => {
                self.tls = Some(match value.as_str() {
                    "proxy" => TlsKind::Proxy,
                    "local-ca" => TlsKind::LocalCa,
                    other => return Err(format!("unknown TLS mode {other} (proxy or local-ca)").into()),
                })
            }
            _ => unreachable!("every name is listed above"),
        }
        Ok(())
    }

    /// The TLS mode of a first start: what was asked for, else `proxy` if an origin was given.
    fn first_start_kind(&self) -> TlsKind {
        self.tls.unwrap_or(if self.origin.is_some() { TlsKind::Proxy } else { TlsKind::LocalCa })
    }
}

/// SIGTERM (`docker stop`, systemd, a redeploy) and Ctrl-C end the instance the same way a config
/// apply does: stop accepting, give running uploads time to finish, then exit with status 0.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        match signal(SignalKind::terminate()) {
            Ok(mut term) => {
                tokio::select! { _ = term.recv() => {}, _ = tokio::signal::ctrl_c() => {} }
            }
            Err(_) => {
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

/// How this run serves: with its own local CA, or as plain HTTP behind a proxy.
enum Serving {
    LocalCa { ca: tls::LocalCa, names: tls::LocalNames, https_port: u16, http_port: u16 },
    Proxy { port: u16 },
}

async fn run(cli: Cli) -> Result<(), BoxError> {
    // The process owner installs the one provider; libraries never do (#12).
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .map_err(|_| "rustls provider already installed")?;

    let data = cli.data.clone();
    std::fs::create_dir_all(&data)?;
    // First start needs nothing but, behind a proxy, the public origin: the default config is
    // written and the admin registers at /admin/setup with the logged token, everything else is
    // the studio (#17 flow).
    let config_path = data.join("config.toml");
    let cfg = if config_path.exists() {
        let cfg = Config::load(&config_path)?;
        if cli.origin.as_deref().is_some_and(|o| o != cfg.origin) {
            tracing::warn!(
                "ignoring the origin {:?}: this instance already has the origin {} (changing it is a hostname transition, not a flag)",
                cli.origin,
                cfg.origin
            );
        }
        cfg
    } else {
        let cfg = match cli.first_start_kind() {
            TlsKind::Proxy => {
                let origin = cli.origin.as_deref().ok_or(
                    "behind a proxy the first start needs the public origin: --origin https://host (or NOSTUBE_ORIGIN)",
                )?;
                Config::default_for_proxy(origin, cli.port.unwrap_or(8080))?
            }
            TlsKind::LocalCa => {
                let names = tls::LocalNames::detect(None)?;
                Config::default_for(&names.local_name, cli.port.unwrap_or(443), cli.http_port.unwrap_or(80))
            }
        };
        std::fs::write(&config_path, cfg.to_toml()?)?;
        tracing::info!(
            "first start: wrote default {} (origin {}; refine in the studio after setup)",
            config_path.display(),
            cfg.origin
        );
        cfg
    };

    let boot_id = admin::random_boot_id();
    let handle = Arc::new(axum_server::Handle::new());
    {
        let handle = handle.clone();
        tokio::spawn(async move {
            shutdown_signal().await;
            tracing::info!("shutting down: finishing running requests (up to 30 s)");
            handle.graceful_shutdown(Some(std::time::Duration::from_secs(30)));
        });
    }

    let (covered_hosts, setup_origin, serving) = match &cfg.tls {
        config::Tls::LocalCa { router_name, https_port, http_port } => {
            // Transport overrides for this run; the config file keeps its values.
            let https_port = cli.port.unwrap_or(*https_port);
            let mut setup_origin = nostr::prelude::Url::parse(&cfg.origin)?;
            setup_origin.set_port((https_port != 443).then_some(https_port)).map_err(|_| "invalid setup port")?;
            // `http_port = 0` (or `--http-port 0`) disables the port-80 onboarding
            // listener (e.g. behind a proxy that owns port 80).
            let http_port = cli.http_port.unwrap_or(*http_port);
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
            (
                tls::covered_hosts(&names),
                setup_origin.origin().ascii_serialization(),
                Serving::LocalCa { ca, names, https_port, http_port },
            )
        }
        config::Tls::Proxy { port } => (
            vec![cfg.origin_host.clone()],
            cfg.origin.clone(),
            Serving::Proxy { port: cli.port.unwrap_or(*port) },
        ),
    };

    // Broken secrets only disable the admin area, never the instance (#7).
    let admin = match admin::AdminState::open(
        &data,
        &cfg.origin_host,
        covered_hosts,
        &setup_origin,
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
                description: format!("Relay of {}", cfg.title),
            },
        )?,
        public_config: serde_json::to_vec(&cfg.public_json())?.into(),
        boot_id,
        admin,
    };

    match serving {
        Serving::LocalCa { ca, names, https_port, http_port } => {
            let bind = cli.bind.unwrap_or(std::net::Ipv4Addr::UNSPECIFIED.into());
            if http_port != 0 {
                // Port 80 is a nice-to-have (CA onboarding); a busy or privileged port
                // must not keep the instance from starting — warn and serve.
                match tokio::net::TcpListener::bind(SocketAddr::new(bind, http_port)).await {
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

            tracing::info!("serving {} on HTTPS {}:{https_port}", cfg.origin, bind);
            let address = SocketAddr::new(bind, https_port);
            let listener = std::net::TcpListener::bind(address)
                .map_err(|e| format!("cannot bind HTTPS listener {address}: {e}"))?;
            listener.set_nonblocking(true)?;
            axum_server::from_tcp_rustls(listener, ca.rustls.clone())?
                .handle((*handle).clone())
                .serve(Router::new().fallback(dispatch).with_state(app).into_make_service())
                .await?;
        }
        Serving::Proxy { port } => {
            let bind = cli.bind.unwrap_or(std::net::Ipv4Addr::LOCALHOST.into());
            tracing::info!("serving {} as plain HTTP on {bind}:{port} (TLS ends at the proxy)", cfg.origin);
            let address = SocketAddr::new(bind, port);
            let listener = std::net::TcpListener::bind(address)
                .map_err(|e| format!("cannot bind HTTP listener {address}: {e}"))?;
            listener.set_nonblocking(true)?;
            axum_server::from_tcp(listener)?
                .handle((*handle).clone())
                .serve(Router::new().fallback(dispatch).with_state(app).into_make_service())
                .await?;
        }
    }
    // A config apply or a signal brought us here: a supervisor restarts the process if it should run.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn parse(args: &[&str], env: &[(&str, &str)]) -> Result<Cli, BoxError> {
        let env: HashMap<String, String> = env.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        Cli::parse(args.iter().map(|a| a.to_string()), move |name| env.get(name).cloned())
    }

    #[test]
    fn a_container_is_configured_by_the_environment_alone() {
        let cli = parse(
            &[],
            &[
                ("NOSTUBE_DATA", "/data"),
                ("NOSTUBE_ORIGIN", "https://videos.example.org/"),
                ("NOSTUBE_BIND", "0.0.0.0"),
                ("NOSTUBE_PORT", "8081"),
            ],
        )
        .unwrap();
        assert_eq!(cli.data, PathBuf::from("/data"));
        assert_eq!(cli.origin.as_deref(), Some("https://videos.example.org"));
        assert_eq!(cli.bind, Some("0.0.0.0".parse().unwrap()));
        assert_eq!(cli.port, Some(8081));
        // An origin implies the proxy mode.
        assert_eq!(cli.first_start_kind(), TlsKind::Proxy);
    }

    #[test]
    fn flags_win_over_the_environment_and_the_defaults_are_safe() {
        let cli = parse(&["--data", "/mnt/x", "--port", "9000"], &[("NOSTUBE_DATA", "/data"), ("NOSTUBE_PORT", "8081")]).unwrap();
        assert_eq!(cli.data, PathBuf::from("/mnt/x"));
        assert_eq!(cli.port, Some(9000));
        let bare = parse(&[], &[]).unwrap();
        assert_eq!(bare.data, PathBuf::from("data"));
        assert_eq!(bare.bind, None); // each mode picks its own default: loopback behind a proxy
        assert_eq!(bare.first_start_kind(), TlsKind::LocalCa);
    }

    #[test]
    fn the_subcommands_still_parse_and_bad_values_say_where_they_came_from() {
        assert!(parse(&["admin", "reset"], &[("NOSTUBE_DATA", "/data")]).is_ok());
        assert!(parse(&["config", "rollback", "--data", "/d"], &[]).is_ok());
        let err = parse(&[], &[("NOSTUBE_PORT", "0")]).unwrap_err().to_string();
        assert!(err.contains("NOSTUBE_PORT"), "{err}");
        assert!(parse(&["--tls", "plain"], &[]).is_err());
        assert!(parse(&["--bogus"], &[]).is_err());
        assert!(parse(&["--origin"], &[]).is_err());
        // An empty variable counts as unset (compose passes `NOSTUBE_ORIGIN=` when it is blank).
        assert!(parse(&[], &[("NOSTUBE_ORIGIN", "  ")]).unwrap().origin.is_none());
    }

    #[test]
    fn an_explicit_tls_mode_beats_the_origin_hint() {
        let cli = parse(&["--tls", "local-ca", "--origin", "https://x.example"], &[]).unwrap();
        assert_eq!(cli.first_start_kind(), TlsKind::LocalCa);
        assert_eq!(parse(&["--tls", "proxy"], &[]).unwrap().first_start_kind(), TlsKind::Proxy);
    }
}
