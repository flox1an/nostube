use std::{fs, sync::Mutex, time::Duration};

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

const ALMOND_URL: &str = "http://127.0.0.1:24242";
const HEALTH_CHECK_ATTEMPTS: usize = 50;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_millis(100);

struct AlmondProcess(Mutex<Option<CommandChild>>);

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AlmondProcess(Mutex::new(None)))
        .setup(|app| {
            tauri::async_runtime::block_on(start_almond(app.handle()))?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building NosTube desktop host")
        .run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                stop_almond(app);
            }
        });
}
