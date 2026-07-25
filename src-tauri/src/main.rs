use serde::{Deserialize, Serialize};
use std::{
    fs,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

mod vault;

use tauri::Emitter;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use zeroize::Zeroize;

const ALMOND_URL: &str = "http://127.0.0.1:24242";
const HEALTH_CHECK_ATTEMPTS: usize = 50;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_millis(100);

struct AlmondProcess(Mutex<Option<CommandChild>>);
const DEFAULT_IDLE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicAccountState {
    active_pubkey: Option<String>,
    locked: bool,
}

struct DesktopVault(Mutex<vault::Vault>);

struct DesktopActivity(Mutex<Instant>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCapabilities {
    nip04: bool,
    nip44: bool,
}

fn account_state(vault: &vault::Vault) -> PublicAccountState {
    PublicAccountState {
        active_pubkey: vault.active_pubkey().map(ToOwned::to_owned),
        locked: vault.is_locked(),
    }
}

fn emit_account_state(app: &AppHandle, state: PublicAccountState) -> Result<(), String> {
    app.emit("desktop-account-state", state)
        .map_err(|error| format!("Could not notify desktop windows: {error}"))
}

fn with_vault<T>(
    app: &AppHandle,
    operation: impl FnOnce(&mut vault::Vault) -> Result<T, String>,
) -> Result<(T, PublicAccountState), String> {
    let vault_state = app.state::<DesktopVault>();
    let mut vault = vault_state
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?;
    let result = operation(&mut vault)?;
    Ok((result, account_state(&vault)))
}

#[tauri::command]
fn desktop_accounts(app: AppHandle) -> Result<Vec<vault::DesktopAccount>, String> {
    let vault_state = app.state::<DesktopVault>();
    let vault = vault_state
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?;
    Ok(vault.accounts().to_vec())
}

#[tauri::command]
fn desktop_account_state(app: AppHandle) -> Result<PublicAccountState, String> {
    let vault_state = app.state::<DesktopVault>();
    let vault = vault_state
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?;
    Ok(account_state(&vault))
}

#[tauri::command]
fn desktop_record_activity(app: AppHandle) -> Result<(), String> {
    let activity = app.state::<DesktopActivity>();
    *activity
        .0
        .lock()
        .map_err(|_| "Desktop activity state is unavailable".to_string())? = Instant::now();
    Ok(())
}
#[tauri::command]
fn desktop_import_credential(
    app: AppHandle,
    credential: String,
    password: Option<String>,
) -> Result<PublicAccountState, String> {
    let mut credential = credential;
    let mut password = password;
    let result = with_vault(&app, |vault| vault.import(&credential, password.as_deref()));
    credential.zeroize();
    if let Some(password) = password.as_mut() {
        password.zeroize();
    }
    let (_, state) = result?;
    emit_account_state(&app, state.clone())?;
    Ok(state)
}

#[tauri::command]
fn desktop_unlock_account(app: AppHandle, pubkey: String) -> Result<PublicAccountState, String> {
    let (_, state) = with_vault(&app, |vault| vault.unlock(&pubkey))?;
    emit_account_state(&app, state.clone())?;
    Ok(state)
}

#[tauri::command]
fn desktop_restore_account(app: AppHandle) -> Result<PublicAccountState, String> {
    let (_, state) = with_vault(&app, vault::Vault::restore_last_account)?;
    emit_account_state(&app, state.clone())?;
    Ok(state)
}

#[tauri::command]
fn desktop_lock_account(app: AppHandle) -> Result<PublicAccountState, String> {
    let (_, state) = with_vault(&app, |vault| {
        vault.lock();
        Ok(())
    })?;
    emit_account_state(&app, state.clone())?;
    Ok(state)
}

#[tauri::command]
fn desktop_remove_account(app: AppHandle, pubkey: String) -> Result<PublicAccountState, String> {
    let (_, state) = with_vault(&app, |vault| vault.remove(&pubkey))?;
    emit_account_state(&app, state.clone())?;
    Ok(state)
}

#[tauri::command]
fn desktop_export_credential(app: AppHandle, pubkey: String) -> Result<String, String> {
    let vault_state = app.state::<DesktopVault>();
    let vault = vault_state
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?;
    vault.export(&pubkey)
}

#[tauri::command]
fn desktop_get_public_key(app: AppHandle) -> Result<String, String> {
    let vault_state = app.state::<DesktopVault>();
    let vault = vault_state
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?;
    vault
        .active_pubkey()
        .map(ToOwned::to_owned)
        .ok_or_else(|| "Unlock a desktop account before signing".to_string())
}

#[tauri::command]
fn desktop_account_capabilities() -> DesktopCapabilities {
    DesktopCapabilities {
        nip04: true,
        nip44: true,
    }
}

fn sign_desktop_event_value(
    mut event: serde_json::Value,
    keys: &nostr::Keys,
) -> Result<serde_json::Value, String> {
    let object = event
        .as_object_mut()
        .ok_or_else(|| "The event to sign is invalid".to_string())?;
    object.insert(
        "pubkey".to_string(),
        serde_json::Value::String(keys.public_key().to_hex()),
    );
    object.remove("id");

    let unsigned: nostr::UnsignedEvent =
        serde_json::from_value(event).map_err(|_| "The event to sign is invalid".to_string())?;
    serde_json::to_value(
        unsigned
            .sign_with_keys(keys)
            .map_err(|error| format!("Could not sign event: {error}"))?,
    )
    .map_err(|error| format!("Could not encode signed event: {error}"))
}

#[tauri::command]
fn desktop_sign_event(
    app: AppHandle,
    event: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let secret_key = app
        .state::<DesktopVault>()
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?
        .active_secret_key()?;
    let keys = nostr::Keys::new(secret_key);
    sign_desktop_event_value(event, &keys)
}

#[derive(Deserialize)]
struct EncryptionRequest {
    pubkey: String,
    content: String,
}

fn active_keys(app: &AppHandle) -> Result<nostr::Keys, String> {
    let secret_key = app
        .state::<DesktopVault>()
        .0
        .lock()
        .map_err(|_| "Desktop vault state is unavailable".to_string())?
        .active_secret_key()?;
    Ok(nostr::Keys::new(secret_key))
}

fn encryption_recipient(request: &EncryptionRequest) -> Result<nostr::PublicKey, String> {
    nostr::PublicKey::parse(&request.pubkey)
        .map_err(|_| "The encryption recipient public key is invalid".to_string())
}

#[tauri::command]
fn desktop_nip04_encrypt(app: AppHandle, request: EncryptionRequest) -> Result<String, String> {
    let keys = active_keys(&app)?;
    nostr::nips::nip04::encrypt(
        keys.secret_key(),
        &encryption_recipient(&request)?,
        &request.content,
    )
    .map_err(|_| "Desktop encryption failed".to_string())
}

#[tauri::command]
fn desktop_nip04_decrypt(app: AppHandle, request: EncryptionRequest) -> Result<String, String> {
    let keys = active_keys(&app)?;
    nostr::nips::nip04::decrypt(
        keys.secret_key(),
        &encryption_recipient(&request)?,
        &request.content,
    )
    .map_err(|_| "Desktop decryption failed".to_string())
}

#[tauri::command]
fn desktop_nip44_encrypt(app: AppHandle, request: EncryptionRequest) -> Result<String, String> {
    let keys = active_keys(&app)?;
    nostr::nips::nip44::encrypt(
        keys.secret_key(),
        &encryption_recipient(&request)?,
        &request.content,
        nostr::nips::nip44::Version::default(),
    )
    .map_err(|_| "Desktop encryption failed".to_string())
}

#[tauri::command]
fn desktop_nip44_decrypt(app: AppHandle, request: EncryptionRequest) -> Result<String, String> {
    let keys = active_keys(&app)?;
    nostr::nips::nip44::decrypt(
        keys.secret_key(),
        &encryption_recipient(&request)?,
        &request.content,
    )
    .map_err(|_| "Desktop decryption failed".to_string())
}

fn player_route(route: &str) -> Result<String, String> {
    let (path, query) = route.split_once('?').unwrap_or((route, ""));
    let video_id = path
        .strip_prefix("/desktop/player/")
        .ok_or_else(|| "Player windows require a desktop player route".to_string())?;

    if video_id.is_empty()
        || !video_id
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
    {
        return Err("Player route must contain a public NIP-19 identifier".into());
    }

    if !query.is_empty() {
        let Some((key, playlist_id)) = query.split_once('=') else {
            return Err("Player route query is invalid".into());
        };
        if key != "playlist"
            || playlist_id.is_empty()
            || query.matches('=').count() != 1
            || !playlist_id
                .chars()
                .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        {
            return Err("Player route only accepts a public playlist identifier".into());
        }
    }

    Ok(video_id.to_string())
}

fn focus_or_open(app: &AppHandle, label: &str, route: &str, title: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        return window
            .show()
            .and_then(|_| window.set_focus())
            .map_err(|error| error.to_string());
    }

    WebviewWindowBuilder::new(app, label, WebviewUrl::App(route.into()))
        .title(title)
        .inner_size(1280.0, 720.0)
        .min_inner_size(800.0, 480.0)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn focus_or_open_player(app: &AppHandle, route: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("player") {
        return window
            .emit("desktop-player-route", route)
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus())
            .map_err(|error| error.to_string());
    }

    let builder = WebviewWindowBuilder::new(app, "player", WebviewUrl::App(route.into()))
        .title("NosTube player");

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(TitleBarStyle::Overlay)
        .traffic_light_position(LogicalPosition::new(16.0, 24.0))
        .hidden_title(true);

    builder
        .inner_size(1280.0, 720.0)
        .min_inner_size(800.0, 480.0)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_desktop_window(app: AppHandle, kind: String, route: Option<String>) -> Result<(), String> {
    match kind.as_str() {
        "main" => app
            .get_webview_window("main")
            .ok_or_else(|| "The main window is unavailable".to_string())?
            .show()
            .and_then(|_| {
                app.get_webview_window("main")
                    .expect("main window was just resolved")
                    .set_focus()
            })
            .map_err(|error| error.to_string()),
        "auth" => focus_or_open(&app, "auth", "/desktop/auth", "NosTube authentication"),
        "player" => {
            let route = route.ok_or_else(|| "Player windows require a route".to_string())?;
            player_route(&route)?;
            focus_or_open_player(&app, &route)
        }
        _ => Err("Unknown desktop window kind".into()),
    }
}

async fn wait_for_almond() -> Result<(), String> {
    let client = reqwest::Client::new();

    for _ in 0..HEALTH_CHECK_ATTEMPTS {
        if let Ok(response) = client.head(ALMOND_URL).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }

        std::thread::sleep(HEALTH_CHECK_INTERVAL);
    }

    Err("Almond did not pass HEAD / health check on 127.0.0.1:24242 within five seconds".into())
}

async fn start_almond(app: &AppHandle) -> Result<(), String> {
    let storage_path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not resolve app-local data directory: {error}"))?
        .join("blossom-cache");

    fs::create_dir_all(&storage_path)
        .map_err(|error| format!("Could not create Almond storage directory: {error}"))?;

    let sidecar = app
        .shell()
        .sidecar("almond")
        .map_err(|error| format!("Could not resolve bundled Almond sidecar: {error}"))?
        .env("BIND_ADDR", "127.0.0.1:24242")
        .env("PUBLIC_URL", ALMOND_URL)
        .env("STORAGE_PATH", storage_path)
        .env("FEATURE_UPLOAD_ENABLED", "off")
        .env("FEATURE_MIRROR_ENABLED", "off")
        .env("FEATURE_CUSTOM_UPSTREAM_ORIGIN_ENABLED", "public")
        .env("UPSTREAM_MODE", "proxy");
    let (mut events, child) = sidecar
        .spawn()
        .map_err(|error| format!("Could not start Almond sidecar: {error}"))?;

    tauri::async_runtime::spawn(async move { while events.recv().await.is_some() {} });

    app.state::<AlmondProcess>()
        .0
        .lock()
        .map_err(|_| "Almond process state is unavailable".to_string())?
        .replace(child);

    if let Err(error) = wait_for_almond().await {
        if let Some(child) = app
            .state::<AlmondProcess>()
            .0
            .lock()
            .map_err(|_| "Almond process state is unavailable".to_string())?
            .take()
        {
            let _ = child.kill();
        }
        return Err(error);
    }

    Ok(())
}

fn stop_almond(app: &AppHandle) {
    let almond_process = app.state::<AlmondProcess>();
    let Ok(mut process) = almond_process.0.lock() else {
        return;
    };
    let Some(child) = process.take() else {
        return;
    };

    let _ = child.kill();
}

fn lock_desktop_vault(app: &AppHandle) {
    let vault_state = app.state::<DesktopVault>();
    if let Ok(mut vault) = vault_state.0.lock() {
        vault.lock();
    };
}

fn desktop_idle_timeout() -> Duration {
    std::env::var("NOSTUBE_DESKTOP_IDLE_TIMEOUT_SECONDS")
        .ok()
        .and_then(|seconds| seconds.parse::<u64>().ok())
        .filter(|seconds| *seconds > 0)
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_IDLE_TIMEOUT)
}

fn start_idle_lock_monitor(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(IDLE_CHECK_INTERVAL);
        let activity = app.state::<DesktopActivity>();
        let Ok(last_activity) = activity.0.lock() else {
            continue;
        };
        if last_activity.elapsed() < desktop_idle_timeout() {
            continue;
        }
        drop(last_activity);

        let vault_state = app.state::<DesktopVault>();
        let Ok(mut vault) = vault_state.0.lock() else {
            continue;
        };
        if vault.is_locked() {
            continue;
        }
        vault.lock();
        let state = account_state(&vault);
        drop(vault);
        let _ = emit_account_state(&app, state);
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AlmondProcess(Mutex::new(None)))
        .manage(DesktopVault(Mutex::new(vault::Vault::default())))
        .manage(DesktopActivity(Mutex::new(Instant::now())))
        .invoke_handler(tauri::generate_handler![
            desktop_account_capabilities,
            desktop_account_state,
            desktop_accounts,
            desktop_export_credential,
            desktop_get_public_key,
            desktop_import_credential,
            desktop_lock_account,
            desktop_nip04_decrypt,
            desktop_nip04_encrypt,
            desktop_nip44_decrypt,
            desktop_nip44_encrypt,
            desktop_remove_account,
            desktop_sign_event,
            desktop_restore_account,
            desktop_record_activity,
            desktop_unlock_account,
            open_desktop_window
        ])
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|error| format!("Could not resolve app-local data directory: {error}"))?;
            fs::create_dir_all(&app_data_dir)
                .map_err(|error| format!("Could not create app-local data directory: {error}"))?;
            app.state::<DesktopVault>()
                .0
                .lock()
                .map_err(|_| "Desktop vault state is unavailable".to_string())?
                .initialize(app_data_dir.join("desktop-accounts.json"))?;
            tauri::async_runtime::block_on(start_almond(app.handle()))?;
            start_idle_lock_monitor(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building NosTube desktop host")
        .run(|app, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                stop_almond(app);
                lock_desktop_vault(app);
            }
            RunEvent::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            } if app.webview_windows().is_empty() => lock_desktop_vault(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::player_route;
    use super::sign_desktop_event_value;
    use super::PublicAccountState;

    #[test]
    fn account_notifications_contain_public_state_only() {
        let state = PublicAccountState {
            active_pubkey: Some("f".repeat(64)),
            locked: false,
        };

        assert_eq!(
            serde_json::to_string(&state).expect("public account state serializes"),
            format!(r#"{{"activePubkey":"{}","locked":false}}"#, "f".repeat(64))
        );
    }

    #[test]
    fn accepts_a_public_nevent_player_route() {
        assert_eq!(
            player_route("/desktop/player/nevent1selectedvideo"),
            Ok("nevent1selectedvideo".to_string())
        );
    }

    #[test]
    fn accepts_a_player_route_with_a_public_playlist_reference() {
        assert_eq!(
            player_route("/desktop/player/nevent1selectedvideo?playlist=naddr1selectedplaylist"),
            Ok("nevent1selectedvideo".to_string())
        );
    }

    #[test]
    fn rejects_non_player_routes() {
        assert!(player_route("/desktop/auth?nsec=secret").is_err());
    }

    #[test]
    fn signs_unsigned_template_with_active_pubkey_before_validation() {
        let keys =
            nostr::Keys::parse("nsec1j4c6269y9w0q2er2xjw8sv2ehyrtfxq3jwgdlxj6qfn8z4gjsq5qfvfk99")
                .expect("test key parses");
        let template = serde_json::json!({
            "kind": 7,
            "content": "+",
            "tags": [["e", "8b2b532708b62acbd5bdf6c0ac77d17df257ad7d488f1ff87884630487d77060"]],
            "created_at": 1_700_000_000
        });

        let signed = sign_desktop_event_value(template, &keys).expect("event signs");
        let event: nostr::Event = serde_json::from_value(signed).expect("signed event decodes");

        assert_eq!(event.pubkey, keys.public_key());
        assert!(event.verify_id());
        assert!(event.verify_signature());
        event.verify().expect("signed event is canonical and valid");
    }
}
