//! Moves local upload blobs into Almond's native S3 storage (#174), one blob at a time.
//!
//! Per blob: copy the local file to a temporary file, let Almond's S3 `put` upload and consume
//! that copy, then swap the index entry to the S3 location under Almond's per-hash guard and
//! delete the displaced local file. A local copy is never deleted before its S3 copy is
//! confirmed. A crash between upload and swap leaves both copies; Almond's startup scan keeps
//! the local one and the next run overwrites the same key. The upstream cache stays local.
//! Peak extra disk use is the one temporary copy.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use almond::models::{AppState, BlobOrigin, FileLocation, FileMetadata};
use almond::services::blob_index::PublishResult;
use almond::services::file_storage::{self, TempBlob};
use almond::services::native_storage::NativeS3Storage;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The job row under the data directory, so a running move resumes after a restart.
const FILE: &str = "storage-move.json";
const DISABLED: &str = "S3 storage is not enabled";

// ponytail: one short relocation barrier; per-instance guards if contention matters.
static LOCAL_READS: tokio::sync::RwLock<()> = tokio::sync::RwLock::const_new(());

/// Pin a local location until its reader has opened the file, not until streaming completes.
pub(crate) async fn local_read(state: &AppState, hash: &str) -> Option<tokio::sync::RwLockReadGuard<'static, ()>> {
    let guard = LOCAL_READS.read().await;
    state.file_index.get(hash).await
        .is_some_and(|m| matches!(m.location, FileLocation::Local(_)))
        .then_some(guard)
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum State {
    #[default]
    Idle,
    Running,
    Completed,
    Failed,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Job {
    state: State,
    files_done: u64,
    files_total: u64,
    bytes_done: u64,
    bytes_total: u64,
    error: Option<String>,
    /// Hash and size of the blob in flight; a resume counts it if it already moved.
    current: Option<(String, u64)>,
}

pub struct Migration {
    path: PathBuf,
    state: AppState,
    job: Mutex<Job>,
}

/// Load the persisted job and resume it when it was running.
pub fn open(data: &Path, state: AppState) -> Result<Arc<Migration>, String> {
    let path = data.join(FILE);
    let job = match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("cannot parse {}: {e}", path.display()))?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Job::default(),
        Err(e) => return Err(format!("cannot read {}: {e}", path.display())),
    };
    let running = job.state == State::Running;
    let migration = Arc::new(Migration { path, state, job: Mutex::new(job) });
    if running {
        tokio::spawn(migration.clone().run());
    }
    Ok(migration)
}

impl Migration {
    /// Called under MEDIA_LIFECYCLE before a writer could wait on this blob's mutation guard.
    pub(crate) fn moving(&self, hash: Option<&str>) -> bool {
        let job = self.job.lock();
        job.state == State::Running && job.current.as_ref()
            .is_some_and(|(current, _)| hash.is_none_or(|hash| hash == current))
    }

    /// The `move` object of `GET /api/admin/storage`.
    pub async fn status(&self) -> Value {
        let (local_files, local_bytes) =
            local_uploads(&self.state).await.iter().fold((0u64, 0u64), |(n, b), (_, m)| (n + 1, b + m.size));
        let job = self.job.lock().clone();
        json!({
            "state": job.state,
            "filesDone": job.files_done,
            "filesTotal": job.files_total,
            "bytesDone": job.bytes_done,
            "bytesTotal": job.bytes_total,
            "error": job.error,
            "localFiles": local_files,
            "localBytes": local_bytes,
        })
    }

    /// Start a run over every local upload; rejected while S3 is disabled or a run is going.
    pub async fn start(self: &Arc<Self>) -> Result<Value, String> {
        if self.state.native_s3.is_none() {
            return Err(DISABLED.into());
        }
        {
            let mut job = self.job.lock();
            if job.state == State::Running {
                return Err("the move is already running".into());
            }
            let next = Job { state: State::Running, ..Job::default() };
            save(&self.path, &next)?;
            *job = next;
        }
        tokio::spawn(self.clone().run());
        Ok(self.status().await)
    }

    async fn run(self: Arc<Self>) {
        match self.move_all().await {
            Ok(()) => tracing::info!("moved local uploads to S3"),
            Err(error) => {
                tracing::warn!("moving local uploads to S3 failed: {error}");
                let failed = self.update(|job| {
                    job.state = State::Failed;
                    job.error = Some(error);
                    job.current = None;
                });
                if let Err(e) = failed {
                    tracing::warn!("{e}");
                }
            }
        }
    }

    async fn move_all(&self) -> Result<(), String> {
        let s3 = self.state.native_s3.clone().ok_or(DISABLED)?;
        let remaining = local_uploads(&self.state).await;
        self.update(|job| {
            if let Some((hash, size)) = job.current.take() {
                if !remaining.iter().any(|(h, _)| *h == hash) {
                    job.files_done += 1;
                    job.bytes_done += size;
                }
            }
            job.files_total = job.files_done + remaining.len() as u64;
            job.bytes_total = job.bytes_done + remaining.iter().map(|(_, m)| m.size).sum::<u64>();
        })?;
        for (hash, local) in remaining {
            {
                let _media = crate::outbox::MEDIA_LIFECYCLE.lock().await;
                self.update(|job| job.current = Some((hash.clone(), local.size)))?;
            }
            let moved = move_one(&self.state, &s3, &hash, &local).await
                .map_err(|error| format!("{hash}: {error}"))?;
            self.update(|job| {
                job.current = None;
                if moved {
                    job.files_done += 1;
                    job.bytes_done += local.size;
                } else {
                    job.files_total = job.files_total.saturating_sub(1);
                    job.bytes_total = job.bytes_total.saturating_sub(local.size);
                }
            })?;
        }
        self.update(|job| job.state = State::Completed)
    }

    /// Apply `change` and persist the job; memory keeps the change even if the write fails.
    fn update(&self, change: impl FnOnce(&mut Job)) -> Result<(), String> {
        let mut job = self.job.lock();
        change(&mut job);
        save(&self.path, &job)
    }
}

/// Indexed upload blobs that still live on local disk.
async fn local_uploads(state: &AppState) -> Vec<(String, Arc<FileMetadata>)> {
    let mut blobs = state.file_index.snapshot().await;
    blobs.retain(|(_, m)| m.origin == BlobOrigin::Upload && matches!(m.location, FileLocation::Local(_)));
    blobs
}

async fn still_indexed(state: &AppState, hash: &str, local: &FileMetadata) -> bool {
    state.file_index.get(hash).await.is_some_and(|m| m.location == local.location)
}

/// Returns whether `hash` now lives in S3; false when it left the index meanwhile.
async fn move_one(state: &AppState, s3: &NativeS3Storage, hash: &str, local: &FileMetadata) -> Result<bool, String> {
    let FileLocation::Local(path) = &local.location else { return Ok(false) };
    // Hold the same guard as Almond's upload and deletion for the whole physical transition.
    // Otherwise DELETE can sweep the bucket before PutObject finishes and resurrect the blob.
    let _guard = state.blob_mutation_locks.lock(hash).await;
    if !still_indexed(state, hash, local).await {
        return Ok(false);
    }
    s3.ensure_available().map_err(|e| e.to_string())?;
    file_storage::ensure_temp_dir(state).await.map_err(|e| e.to_string())?;
    let available = crate::admin::free_disk_bytes(&state.storage.root)
        .map_err(|e| format!("cannot inspect staging disk space: {e}"))?;
    if available < state.min_free_disk_bytes.saturating_add(local.size) {
        return Err("moving this blob would violate the local free-space reserve".into());
    }
    let extension = local.extension.as_deref();
    // `put` deletes the file it uploaded, so it gets a copy; dropping `temp` unlinks the copy
    // whenever the upload did not consume it.
    let temp = TempBlob::reserve(state, "s3move", extension);
    tokio::fs::copy(path, temp.path()).await.map_err(|e| format!("cannot copy {}: {e}", path.display()))?;
    let timeout = crate::outbox::MIRROR_TIMEOUT
        .saturating_add(std::time::Duration::from_secs(local.size / crate::outbox::MIN_UPLOAD_RATE));
    let key = tokio::time::timeout(timeout, s3.put(temp.path(), hash, extension, local.expiration)).await
        .map_err(|_| "S3 upload timed out; the local copy is unchanged".to_owned())?
        .map_err(|e| e.to_string())?;
    drop(temp);
    let _readers = LOCAL_READS.write().await;

    let uploaded = FileMetadata { location: FileLocation::S3 { key }, ..local.clone() };
    if let PublishResult::Published { displaced: Some(displaced) } = state.file_index.publish(hash.to_owned(), uploaded).await {
        if let FileLocation::Local(old) = &displaced.location {
            match tokio::fs::remove_file(old).await {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => {
                    // Almond's cleanup job retries superseded copies.
                    tracing::warn!(hash, "moved to S3 but cannot remove {}: {e}", old.display());
                    state.superseded_blob_deletions.write().await.push((hash.to_owned(), (*displaced).clone()));
                }
            }
        }
    }
    file_storage::mark_changes_pending(state).await;
    Ok(true)
}

/// Write the job privately (0600) and atomically, so a crash never leaves half a row.
fn save(path: &Path, job: &Job) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let temp = path.with_extension("json.tmp");
    let write = || -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new().create(true).truncate(true).write(true).mode(0o600).open(&temp)?;
        file.write_all(&serde_json::to_vec(job).expect("job serializes"))?;
        file.sync_all()?;
        std::fs::rename(&temp, path)
    };
    write().map_err(|e| format!("cannot write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake_s3::{FakeS3, ACCESS_KEY, BUCKET, SECRET_KEY};
    use almond::services::file_storage::BlobPublication;
    use sha2::{Digest, Sha256};
    use std::time::Duration;
    use tower::ServiceExt;

    const A: &[u8] = b"first local upload";
    const B: &[u8] = b"second local upload, a little longer";
    const CACHE: &[u8] = b"upstream cache fill";

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nss-move-test-{:016x}", rand::random::<u64>()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn blossom(dir: &Path, s3: Option<&FakeS3>) -> AppState {
        let mut cfg = almond::Config::defaults();
        cfg.storage_path = dir.join("blossom");
        cfg.public_url = Some("https://instance.example".into());
        cfg.storage_min_free = 0;
        if let Some(s3) = s3 {
            cfg.s3_endpoint = Some(s3.url());
            cfg.s3_bucket = Some(BUCKET.into());
            cfg.s3_access_key_id = Some(ACCESS_KEY.into());
            cfg.s3_secret_access_key = Some(SECRET_KEY.into());
            cfg.s3_force_path_style = true;
        }
        almond::build_state(&cfg.validate().unwrap()).await.unwrap()
    }

    async fn store(state: &AppState, bytes: &[u8], origin: BlobOrigin) -> String {
        let hash = format!("{:x}", Sha256::digest(bytes));
        file_storage::ensure_temp_dir(state).await.unwrap();
        let temp = TempBlob::reserve(state, "test", Some("mp4"));
        std::fs::write(temp.path(), bytes).unwrap();
        file_storage::publish_blob(state, temp, BlobPublication {
            sha256: hash.clone(), origin, extension: Some("mp4".into()), mime_type: Some("video/mp4".into()),
            size: bytes.len() as u64, expiration: None,
        }).await.unwrap();
        hash
    }

    /// Two uploads stored before S3 was enabled, then a restart with S3 on: the #174 setup.
    async fn local_uploads_then_s3(dir: &Path, fake: &FakeS3) -> (AppState, String, String) {
        let plain = blossom(dir, None).await;
        let (a, b) = (store(&plain, A, BlobOrigin::Upload).await, store(&plain, B, BlobOrigin::Upload).await);
        drop(plain);
        (blossom(dir, Some(fake)).await, a, b)
    }

    async fn location(state: &AppState, hash: &str) -> FileLocation {
        file_storage::get_file_metadata(state, hash).await.expect("indexed").location.clone()
    }

    async fn local_path(state: &AppState, hash: &str) -> PathBuf {
        match location(state, hash).await {
            FileLocation::Local(path) => path,
            other => panic!("{hash} is not local: {other:?}"),
        }
    }

    async fn served(state: &AppState, hash: &str) -> Vec<u8> {
        let location_read = local_read(state, hash).await;
        let req = axum::http::Request::get(format!("/{hash}.mp4")).body(axum::body::Body::empty()).unwrap();
        let res = almond::create_app(state.clone()).oneshot(req).await.unwrap();
        drop(location_read);
        assert_eq!(res.status(), 200, "{hash} is served");
        axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap().to_vec()
    }

    async fn finished(migration: &Migration) -> Value {
        for _ in 0..3000 {
            let status = migration.status().await;
            if status["state"] != "running" {
                return status;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("the move did not finish");
    }

    fn blob_keys(fake: &FakeS3) -> Vec<String> {
        fake.keys().into_iter().filter(|k| !k.starts_with(".almond-probe/")).collect()
    }

    #[tokio::test]
    async fn moves_local_uploads_to_s3_while_serving_and_leaves_cache_local() {
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let (state, a, b) = local_uploads_then_s3(&dir, &fake).await;
        let cache = store(&state, CACHE, BlobOrigin::UpstreamCache).await;
        let (path_a, path_b, cache_path) = (local_path(&state, &a).await, local_path(&state, &b).await, local_path(&state, &cache).await);
        let migration = open(&dir, state.clone()).unwrap();
        let idle = migration.status().await;
        assert_eq!(idle["state"], "idle");
        assert_eq!((idle["localFiles"].as_u64(), idle["localBytes"].as_u64()), (Some(2), Some((A.len() + B.len()) as u64)));

        // Pause the first upload before S3 confirms it: local playback must remain available.
        let pending_upload = fake.pause_uploads().await;
        assert_eq!(migration.start().await.unwrap()["state"], "running");
        assert!(migration.start().await.is_err(), "a second start is rejected while running");
        tokio::time::timeout(Duration::from_secs(5), fake.wait_for_upload()).await.unwrap();
        assert!(blob_keys(&fake).is_empty(), "S3 has not confirmed a copy yet");
        assert_eq!(std::fs::read_dir(&state.storage.temp).unwrap().count(), 1, "only one temporary copy");
        assert!(path_a.exists() && path_b.exists(), "no local copy goes before its swap");
        assert_eq!((served(&state, &a).await, served(&state, &b).await), (A.to_vec(), B.to_vec()));
        let paused = migration.status().await;
        assert_eq!((paused["state"].as_str(), paused["filesDone"].as_u64(), paused["filesTotal"].as_u64()), (Some("running"), Some(0), Some(2)));
        drop(pending_upload);

        let done = finished(&migration).await;
        let bytes = (A.len() + B.len()) as u64;
        assert_eq!(done, json!({
            "state": "completed", "filesDone": 2, "filesTotal": 2, "bytesDone": bytes, "bytesTotal": bytes,
            "error": null, "localFiles": 0, "localBytes": 0,
        }));
        for (hash, bytes, path) in [(&a, A, &path_a), (&b, B, &path_b)] {
            let FileLocation::S3 { key } = location(&state, hash).await else { panic!("{hash} still local") };
            assert_eq!(fake.object(&key).as_deref(), Some(bytes));
            assert!(!path.exists(), "the local copy is gone");
            assert_eq!(served(&state, hash).await, bytes);
        }
        assert_eq!(blob_keys(&fake).len(), 2);
        // The upstream cache stays local.
        assert_eq!(location(&state, &cache).await, FileLocation::Local(cache_path.clone()));
        assert!(cache_path.exists());
        assert!(!fake.keys().iter().any(|k| k.contains(&cache)));
        assert_eq!(served(&state, &cache).await, CACHE);
        assert_eq!(std::fs::read_dir(&state.storage.temp).unwrap().count(), 0);
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(dir.join(FILE)).unwrap().permissions().mode() & 0o777, 0o600);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn resumes_after_upload_before_publish_without_loss_or_duplicates() {
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let (state, a, b) = local_uploads_then_s3(&dir, &fake).await;
        // Crash after `a` was uploaded but before its swap: both copies exist, the row is running.
        let path_a = local_path(&state, &a).await;
        file_storage::ensure_temp_dir(&state).await.unwrap();
        let temp = TempBlob::reserve(&state, "crash", Some("mp4"));
        std::fs::copy(&path_a, temp.path()).unwrap();
        let key = state.native_s3.as_ref().unwrap().put(temp.path(), &a, Some("mp4"), None).await.unwrap();
        save(&dir.join(FILE), &Job { state: State::Running, current: Some((a.clone(), A.len() as u64)), ..Job::default() }).unwrap();
        drop(state);

        // Restart: the local copy wins, and the job resumes on its own.
        let state = blossom(&dir, Some(&fake)).await;
        assert_eq!(location(&state, &a).await, FileLocation::Local(path_a.clone()));
        assert_eq!(fake.object(&key).as_deref(), Some(A));
        let migration = open(&dir, state.clone()).unwrap();
        let done = finished(&migration).await;
        let bytes = (A.len() + B.len()) as u64;
        assert_eq!((done["state"].as_str(), done["filesDone"].as_u64(), done["filesTotal"].as_u64()), (Some("completed"), Some(2), Some(2)));
        assert_eq!((done["bytesDone"].as_u64(), done["bytesTotal"].as_u64()), (Some(bytes), Some(bytes)));

        assert_eq!(state.file_index.stats().await.count, 2, "one index entry per blob");
        assert_eq!(location(&state, &a).await, FileLocation::S3 { key: key.clone() }, "the same key was overwritten");
        assert_eq!(blob_keys(&fake).len(), 2);
        assert!(!path_a.exists());
        assert_eq!((served(&state, &a).await, served(&state, &b).await), (A.to_vec(), B.to_vec()));
        // A later restart indexes each blob once, from S3.
        drop(migration);
        let state = blossom(&dir, Some(&fake)).await;
        assert_eq!(state.file_index.stats().await.count, 2);
        assert!(matches!(location(&state, &b).await, FileLocation::S3 { .. }));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn failed_upload_keeps_local_copies_and_reports_the_error() {
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let (state, a, b) = local_uploads_then_s3(&dir, &fake).await;
        let migration = open(&dir, state.clone()).unwrap();
        fake.stop().await;
        migration.start().await.unwrap();
        let failed = finished(&migration).await;
        assert_eq!(failed["state"], "failed");
        assert!(failed["error"].as_str().is_some_and(|e| !e.is_empty()));
        assert_eq!(failed["localFiles"], 2);
        assert!(local_path(&state, &a).await.exists() && local_path(&state, &b).await.exists());
        assert!(std::fs::read_dir(&state.storage.temp).unwrap().next().is_none(), "the temporary copy is gone");

        fake.resume().await;
        migration.start().await.unwrap();
        let done = finished(&migration).await;
        assert_eq!((done["state"].as_str(), done["error"].is_null(), done["localFiles"].as_u64()), (Some("completed"), true, Some(0)));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn cleanup_waits_for_a_move_without_blocking_other_media_work() {
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let plain = blossom(&dir, None).await;
        let hash = store(&plain, A, BlobOrigin::Upload).await;
        drop(plain);
        let state = blossom(&dir, Some(&fake)).await;
        let migration = open(&dir, state.clone()).unwrap();
        let _relay = crate::relay::Relay::open(&dir.join("relay.sqlite"), crate::relay::RelayConfig {
            writers: vec![], name: "test".into(), description: "test".into(), mirror_relays: vec![],
        }).unwrap();
        let outbox = crate::outbox::Outbox::open(&dir.join("relay.sqlite"), crate::config::Mirror::default()).unwrap();
        outbox.attach_storage(state.clone());
        outbox.attach_migration(migration.clone());
        let owner = nostr::prelude::Keys::generate().public_key();
        outbox.record_owner(hash.clone(), owner, false).await.unwrap();
        outbox.delete_blobs(hash.clone(), owner.to_hex(), vec![]).await.unwrap();
        let gate = fake.pause_uploads().await;
        migration.start().await.unwrap();
        tokio::time::timeout(Duration::from_secs(5), fake.wait_for_upload()).await.unwrap();
        tokio::time::timeout(Duration::from_secs(1), crate::outbox::run_due_for_test(&outbox, &Default::default())).await.unwrap();
        assert!(state.file_index.get(&hash).await.is_some());
        assert!(outbox.status().await.unwrap().to_string().contains("blob is being moved to S3"));
        drop(gate);
        assert_eq!(finished(&migration).await["state"], "completed");
        // Advance only the scheduler clock, as outbox's retry tests do; keep status/attempts intact.
        rusqlite::Connection::open(dir.join("relay.sqlite")).unwrap()
            .execute("UPDATE outbox SET next_attempt_at=0 WHERE kind='cleanup'", []).unwrap();
        crate::outbox::run_due_for_test(&outbox, &Default::default()).await;
        assert!(state.file_index.get(&hash).await.is_none());
        assert!(!fake.keys().iter().any(|key| key.contains(&hash)));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn deleting_during_a_move_cannot_resurrect_the_uploaded_object() {
        use almond::services::file_storage::Removal;
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let (state, a, _) = local_uploads_then_s3(&dir, &fake).await;
        let metadata = state.file_index.get(&a).await.unwrap();
        let gate = fake.pause_uploads().await;
        let moving = {
            let (state, hash) = (state.clone(), a.clone());
            tokio::spawn(async move { move_one(&state, state.native_s3.as_ref().unwrap(), &hash, &metadata).await })
        };
        tokio::time::timeout(Duration::from_secs(5), fake.wait_for_upload()).await.unwrap();
        let mut deleting = {
            let (state, hash) = (state.clone(), a.clone());
            tokio::spawn(async move { file_storage::remove_indexed_blob(&state, &hash, Removal::Requested, None).await })
        };
        assert!(tokio::time::timeout(Duration::from_millis(50), &mut deleting).await.is_err(),
            "deletion must not sweep the bucket before PutObject completes");
        drop(gate);
        assert!(moving.await.unwrap().unwrap());
        assert!(deleting.await.unwrap().unwrap());
        assert!(state.file_index.get(&a).await.is_none());
        assert!(!fake.keys().iter().any(|key| key.contains(&a)));
        let reopened = blossom(&dir, Some(&fake)).await;
        assert!(reopened.file_index.get(&a).await.is_none(), "a restart cannot resurrect the deletion");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn an_open_local_reader_finishes_after_the_copy_moves_to_s3() {
        use tokio::io::AsyncReadExt;
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let (state, a, _) = local_uploads_then_s3(&dir, &fake).await;
        let metadata = state.file_index.get(&a).await.unwrap();
        let path = local_path(&state, &a).await;
        let read = local_read(&state, &a).await;
        let moving = {
            let (state, hash) = (state.clone(), a.clone());
            tokio::spawn(async move { move_one(&state, state.native_s3.as_ref().unwrap(), &hash, &metadata).await })
        };
        tokio::time::timeout(Duration::from_secs(5), fake.wait_for_upload()).await.unwrap();
        let mut file = tokio::fs::File::open(&path).await.unwrap();
        drop(read);
        assert!(moving.await.unwrap().unwrap());
        assert!(!path.exists());
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).await.unwrap();
        assert_eq!(bytes, A);
        assert_eq!(served(&state, &a).await, A);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn respects_the_local_reserve_without_counting_indexed_blobs_twice() {
        let dir = temp_dir();
        let fake = FakeS3::start().await;
        let (mut state, a, b) = local_uploads_then_s3(&dir, &fake).await;
        state.min_free_disk_bytes = u64::MAX;
        let migration = open(&dir, state.clone()).unwrap();
        migration.start().await.unwrap();
        let failed = finished(&migration).await;
        assert_eq!(failed["state"], "failed");
        assert!(failed["error"].as_str().unwrap().contains("free-space reserve"));
        assert!(local_path(&state, &a).await.exists() && local_path(&state, &b).await.exists());
        assert!(fake.keys().is_empty());
        state.min_free_disk_bytes = 0;
        state.max_total_size = (A.len() + B.len()) as u64;
        let migration = open(&dir, state).unwrap();
        migration.start().await.unwrap();
        assert_eq!(finished(&migration).await["state"], "completed");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn the_move_is_rejected_while_s3_is_disabled() {
        let dir = temp_dir();
        let state = blossom(&dir, None).await;
        store(&state, A, BlobOrigin::Upload).await;
        let migration = open(&dir, state).unwrap();
        assert_eq!(migration.start().await.unwrap_err(), DISABLED);
        let status = migration.status().await;
        assert_eq!((status["state"].as_str(), status["localFiles"].as_u64()), (Some("idle"), Some(1)));
        assert!(!dir.join(FILE).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
