//! One running instance per data folder.
//!
//! A deploy that starts the new container before it stops the old one (Coolify does) would have
//! two processes open the same SQLite file, blob folder and secrets for a moment. The new process
//! therefore takes an exclusive lock on `<data>/.instance.lock` and waits until the old one lets
//! go of it, which the operating system does when that process exits, however it exits.

use std::{
    fs::{File, OpenOptions},
    os::unix::io::AsRawFd,
    path::Path,
    time::{Duration, Instant},
};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// Held for as long as the process runs; dropping it (or exiting) releases the lock.
pub struct DataLock {
    _file: File,
}

/// Takes the lock, waiting up to `wait` for another process to release it.
pub async fn acquire(data: &Path, wait: Duration) -> Result<DataLock, BoxError> {
    let path = data.join(".instance.lock");
    let file = OpenOptions::new().create(true).truncate(false).write(true).open(&path)?;
    let started = Instant::now();
    let mut announced = false;
    loop {
        // SAFETY: the descriptor is valid for as long as `file` lives.
        let locked = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0;
        if locked {
            return Ok(DataLock { _file: file });
        }
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::WouldBlock {
            return Err(format!("cannot lock {}: {error}", path.display()).into());
        }
        if started.elapsed() >= wait {
            return Err(format!(
                "another instance is using the data folder {} (waited {} s for it to finish)",
                data.display(),
                wait.as_secs()
            )
            .into());
        }
        if !announced {
            tracing::info!("another instance is still using the data folder; waiting for it to finish");
            announced = true;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A folder of its own for every test (they run side by side in one process).
    fn dir() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let d = std::env::temp_dir().join(format!("nss-lock-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::SeqCst)));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[tokio::test]
    async fn a_second_instance_waits_and_then_gives_up() {
        let d = dir();
        let _first = acquire(&d, Duration::from_secs(1)).await.unwrap();
        let started = Instant::now();
        let second = acquire(&d, Duration::from_millis(400)).await;
        assert!(second.is_err());
        assert!(second.err().unwrap().to_string().contains("another instance"));
        assert!(started.elapsed() >= Duration::from_millis(400));
        std::fs::remove_dir_all(&d).ok();
    }

    #[tokio::test]
    async fn the_waiting_instance_gets_the_lock_as_soon_as_the_first_lets_go() {
        let d = dir();
        let first = acquire(&d, Duration::from_secs(1)).await.unwrap();
        let path = d.clone();
        let waiter = tokio::spawn(async move { acquire(&path, Duration::from_secs(5)).await.is_ok() });
        tokio::time::sleep(Duration::from_millis(500)).await;
        drop(first);
        assert!(waiter.await.unwrap());
        std::fs::remove_dir_all(&d).ok();
    }

    #[tokio::test]
    async fn the_lock_file_may_already_exist_and_a_fresh_folder_works() {
        let d = dir();
        drop(acquire(&d, Duration::from_secs(1)).await.unwrap());
        assert!(acquire(&d, Duration::from_secs(1)).await.is_ok());
        std::fs::remove_dir_all(&d).ok();
    }
}
