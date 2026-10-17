//! In-process S3 test double (#171): path-style PutObject, GetObject (with `Range`),
//! ListObjectsV2 and DeleteObject on 127.0.0.1 for one bucket and one access key. The failure
//! modes are the provider's: a foreign bucket answers `NoSuchBucket`, a foreign access key
//! `InvalidAccessKeyId`, and `stop` makes the endpoint unreachable until `resume`.
//! ponytail: no signature check (the access key id is compared, the secret is not) and no
//! key percent-decoding; Almond's keys are `[0-9a-f]/[0-9a-f]/<hash>[_exp][.ext]` and
//! `.almond-probe/<uuid>`.

use std::{
    collections::{BTreeMap, HashMap},
    net::SocketAddr,
    sync::Arc,
};

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query, State},
    http::{header, HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    Router,
};
use parking_lot::Mutex;
use tokio::{sync::oneshot, task::JoinHandle};

pub const BUCKET: &str = "nostube-test";
pub const ACCESS_KEY: &str = "fake-access-key";
pub const SECRET_KEY: &str = "fake-secret-key";

type Objects = Arc<Mutex<BTreeMap<String, Vec<u8>>>>;

pub struct FakeS3 {
    addr: SocketAddr,
    objects: Objects,
    server: Mutex<Option<(oneshot::Sender<()>, JoinHandle<()>)>>,
    put_gate: Arc<tokio::sync::Semaphore>,
    put_started: Arc<tokio::sync::Notify>,
}

impl FakeS3 {
    pub async fn start() -> FakeS3 {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let objects = Objects::default();
        let put_gate = Arc::new(tokio::sync::Semaphore::new(1));
        let put_started = Arc::new(tokio::sync::Notify::new());
        let server = serve(listener, objects.clone(), put_gate.clone(), put_started.clone());
        FakeS3 { addr, objects, put_gate, put_started, server: Mutex::new(Some(server)) }
    }

    /// `http://127.0.0.1:<port>`; stays the same across `stop`/`resume`.
    pub fn url(&self) -> String {
        format!("http://{}", self.addr)
    }

    /// Settings that pass every check (path-style, region `auto`).
    pub fn settings(&self) -> almond::services::native_storage::S3Settings {
        almond::services::native_storage::S3Settings {
            endpoint: self.url(),
            bucket: BUCKET.into(),
            access_key_id: ACCESS_KEY.into(),
            secret_access_key: SECRET_KEY.into(),
            region: "auto".into(),
            force_path_style: true,
        }
    }

    pub fn keys(&self) -> Vec<String> {
        self.objects.lock().keys().cloned().collect()
    }

    pub fn object(&self, key: &str) -> Option<Vec<u8>> {
        self.objects.lock().get(key).cloned()
    }

    pub fn insert(&self, key: &str, bytes: &[u8]) {
        self.objects.lock().insert(key.to_owned(), bytes.to_vec());
    }
    /// Pause PutObject before it creates the object, to exercise concurrent deletion safely.
    pub async fn pause_uploads(&self) -> tokio::sync::OwnedSemaphorePermit {
        self.put_gate.clone().acquire_owned().await.unwrap()
    }

    pub async fn wait_for_upload(&self) {
        self.put_started.notified().await;
    }


    /// Closes the listener and every connection: requests fail to connect. Objects are kept.
    pub async fn stop(&self) {
        let running = self.server.lock().take();
        if let Some((shutdown, task)) = running {
            let _ = shutdown.send(());
            let _ = task.await;
        }
    }

    /// Listens again on the same address with the same objects.
    pub async fn resume(&self) {
        let listener = tokio::net::TcpListener::bind(self.addr).await.unwrap();
        *self.server.lock() = Some(serve(listener, self.objects.clone(), self.put_gate.clone(), self.put_started.clone()));
    }
}

fn serve(
    listener: tokio::net::TcpListener,
    objects: Objects,
    put_gate: Arc<tokio::sync::Semaphore>,
    put_started: Arc<tokio::sync::Notify>,
) -> (oneshot::Sender<()>, JoinHandle<()>) {
    let (shutdown, signal) = oneshot::channel::<()>();
    let app = Router::new().fallback(handle).with_state((objects, put_gate, put_started)).layer(DefaultBodyLimit::disable());
    let task = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = signal.await;
            })
            .await
            .unwrap();
    });
    (shutdown, task)
}

async fn handle(
    State((objects, put_gate, put_started)): State<(Objects, Arc<tokio::sync::Semaphore>, Arc<tokio::sync::Notify>)>,
    method: Method,
    uri: Uri,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let path = uri.path().trim_start_matches('/');
    let (bucket, key) = path.split_once('/').unwrap_or((path, ""));
    // SigV4: `Credential=<access key id>/<date>/<region>/s3/aws4_request`.
    let access_key = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split("Credential=").nth(1))
        .and_then(|v| v.split('/').next());
    if access_key != Some(ACCESS_KEY) {
        return error(StatusCode::FORBIDDEN, "InvalidAccessKeyId");
    }
    if bucket != BUCKET {
        return error(StatusCode::NOT_FOUND, "NoSuchBucket");
    }
    match (method, key.is_empty()) {
        (Method::GET, true) => list(&objects, query.get("prefix").map_or("", String::as_str)),
        (Method::PUT, false) => {
            put_started.notify_one();
            let _gate = put_gate.acquire().await.unwrap();
            objects.lock().insert(key.to_owned(), payload(&headers, &body));
            (StatusCode::OK, [(header::ETAG, "\"fake\"")]).into_response()
        }
        (Method::GET, false) => {
            let Some(bytes) = objects.lock().get(key).cloned() else {
                return error(StatusCode::NOT_FOUND, "NoSuchKey");
            };
            let range = headers.get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("bytes="));
            let Some((start, end)) = range.and_then(|r| r.split_once('-')) else {
                return (StatusCode::OK, bytes).into_response();
            };
            let total = bytes.len();
            let start: usize = start.parse().unwrap_or(0);
            let end = end.parse::<usize>().map_or(total.saturating_sub(1), |e| e.min(total.saturating_sub(1)));
            if start > end {
                return error(StatusCode::RANGE_NOT_SATISFIABLE, "InvalidRange");
            }
            let content_range = format!("bytes {start}-{end}/{total}");
            (StatusCode::PARTIAL_CONTENT, [(header::CONTENT_RANGE, content_range)], bytes[start..=end].to_vec()).into_response()
        }
        (Method::DELETE, false) => {
            objects.lock().remove(key);
            StatusCode::NO_CONTENT.into_response()
        }
        _ => error(StatusCode::NOT_IMPLEMENTED, "NotImplemented"),
    }
}

fn error(status: StatusCode, code: &str) -> Response {
    let xml = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>{code}</Code><Message>fake S3: {code}</Message></Error>");
    (status, [(header::CONTENT_TYPE, "application/xml")], xml).into_response()
}

fn list(objects: &Objects, prefix: &str) -> Response {
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;");
    let objects = objects.lock();
    let matching: Vec<_> = objects.iter().filter(|(k, _)| k.starts_with(prefix)).collect();
    let contents: String = matching
        .iter()
        .map(|(k, v)| {
            format!(
                "<Contents><Key>{}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>&quot;fake&quot;</ETag><Size>{}</Size><StorageClass>STANDARD</StorageClass></Contents>",
                esc(k),
                v.len()
            )
        })
        .collect();
    let xml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><Name>{BUCKET}</Name><Prefix>{}</Prefix><KeyCount>{}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>{contents}</ListBucketResult>",
        esc(prefix),
        matching.len()
    );
    (StatusCode::OK, [(header::CONTENT_TYPE, "application/xml")], xml).into_response()
}

/// The object bytes; a streaming upload arrives `aws-chunked` (`<hex size>[;ext]\r\n<data>\r\n`
/// until a zero-size chunk, then trailers).
fn payload(headers: &HeaderMap, body: &[u8]) -> Vec<u8> {
    let value = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).unwrap_or("");
    if !value("x-amz-content-sha256").starts_with("STREAMING-") && !value("content-encoding").contains("aws-chunked") {
        return body.to_vec();
    }
    let mut out = Vec::new();
    let mut rest = body;
    while let Some(line) = rest.windows(2).position(|w| w == b"\r\n") {
        let size = std::str::from_utf8(&rest[..line])
            .ok()
            .and_then(|l| usize::from_str_radix(l.split(';').next().unwrap_or("").trim(), 16).ok())
            .unwrap_or(0);
        rest = &rest[line + 2..];
        let Some(chunk) = rest.get(..size).filter(|_| size > 0) else { break };
        out.extend_from_slice(chunk);
        rest = rest.get(size + 2..).unwrap_or_default();
    }
    out
}
