//! TLS mode `local-ca` (ADR 0003): the instance's own name-constrained CA signs
//! one leaf for the host's `.local` name, an optional router DNS name and the
//! LAN IPs. Port 80 serves CA onboarding and redirects everything else.
//!
//! On-disk layout under `dir` (created 0700):
//! - `ca.pem`      CA certificate (0644; served at `/ca.pem`)
//! - `ca-key.pem`  CA private key (0600; never regenerated while `ca.pem` exists)
//! - `leaf.pem`    leaf certificate followed by its private key (0600)

use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::Write,
    net::{IpAddr, Ipv4Addr, Ipv6Addr},
    os::unix::fs::{DirBuilderExt, OpenOptionsExt},
    path::Path,
    sync::Arc,
    time::Duration as StdDuration,
};

use axum::{
    body::Bytes,
    http::{header, StatusCode, Uri},
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_server::tls_rustls::RustlsConfig;
use rcgen::{
    BasicConstraints, CertificateParams, CidrSubnet, DistinguishedName, DnType,
    ExtendedKeyUsagePurpose, GeneralSubtree, IsCa, Issuer, KeyPair, KeyUsagePurpose,
    NameConstraints, SanType,
};
use rustls::{
    pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer},
    ServerConfig,
};
use sha2::{Digest, Sha256};
use time::{Duration, OffsetDateTime};
use x509_parser::{extensions::GeneralName, parse_x509_certificate};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

const CA_DAYS: i64 = 3650;
const LEAF_DAYS: i64 = 365;
/// Backdate `notBefore` so devices with a slightly wrong clock still accept the cert.
const SKEW: Duration = Duration::days(1);
/// How often the background task re-detects names/IPs and checks the leaf's age.
const RECHECK: StdDuration = StdDuration::from_secs(10 * 60);

#[derive(Clone, Debug)]
pub struct LocalNames {
    pub local_name: String,
    pub router_name: Option<String>,
    pub ips: Vec<IpAddr>,
}

/// Every DNS name and IP the leaf certificate covers, as strings (admin NIP-98 checks).
pub fn covered_hosts(names: &LocalNames) -> Vec<String> {
    let mut hosts = vec![names.local_name.clone()];
    if let Some(r) = &names.router_name {
        hosts.push(r.clone());
    }
    hosts.extend(names.ips.iter().map(|ip| ip.to_string()));
    hosts
}

impl LocalNames {
    /// The Mac's own `<LocalHostName>.local` plus the private-range IPs of all
    /// up, non-loopback interfaces.
    pub fn detect(router_name: Option<String>) -> Result<LocalNames, BoxError> {
        let out = std::process::Command::new("scutil")
            .args(["--get", "LocalHostName"])
            .output()?;
        let host = String::from_utf8(out.stdout)?.trim().to_ascii_lowercase();
        if !out.status.success() || host.is_empty() {
            return Err("`scutil --get LocalHostName` returned no name".into());
        }
        Ok(LocalNames {
            local_name: format!("{host}.local"),
            router_name: router_name.map(|n| n.trim().to_ascii_lowercase()),
            ips: lan_ips()?,
        })
    }

    fn dns_names(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.local_name.as_str()).chain(self.router_name.as_deref())
    }

    fn sans(&self) -> BTreeSet<String> {
        self.dns_names()
            .map(str::to_owned)
            .chain(self.ips.iter().map(IpAddr::to_string))
            .collect()
    }
}

/// Exactly the IP ranges the CA's name constraints permit.
fn is_lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private(),
        IpAddr::V6(v6) => v6.octets()[0] == 0xfd,
    }
}

fn lan_ips() -> std::io::Result<Vec<IpAddr>> {
    let mut head: *mut libc::ifaddrs = std::ptr::null_mut();
    // SAFETY: getifaddrs fills `head` with a list we walk read-only and free once.
    if unsafe { libc::getifaddrs(&mut head) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    let mut ips = Vec::new();
    let mut cur = head;
    while let Some(ifa) = unsafe { cur.as_ref() } {
        cur = ifa.ifa_next;
        let flags = ifa.ifa_flags as libc::c_int;
        if flags & libc::IFF_UP == 0 || flags & libc::IFF_LOOPBACK != 0 || ifa.ifa_addr.is_null() {
            continue;
        }
        // SAFETY: ifa_addr is non-null and its family tells us the concrete sockaddr type.
        let ip = unsafe {
            match (*ifa.ifa_addr).sa_family as libc::c_int {
                libc::AF_INET => {
                    let sa = &*(ifa.ifa_addr as *const libc::sockaddr_in);
                    IpAddr::V4(Ipv4Addr::from(u32::from_be(sa.sin_addr.s_addr)))
                }
                libc::AF_INET6 => {
                    let sa = &*(ifa.ifa_addr as *const libc::sockaddr_in6);
                    IpAddr::V6(Ipv6Addr::from(sa.sin6_addr.s6_addr))
                }
                _ => continue,
            }
        };
        if is_lan(ip) {
            ips.push(ip);
        }
    }
    unsafe { libc::freeifaddrs(head) };
    ips.sort();
    ips.dedup();
    Ok(ips)
}

pub struct LocalCa {
    pub rustls: RustlsConfig,
    pub ca_pem: String,
    pub fingerprint_sha256: String,
}

struct Ca {
    issuer: Issuer<'static, KeyPair>,
    pem: String,
    der: Vec<u8>,
}

/// Loads (or creates once) the CA under `dir`, ensures a current leaf for
/// `names`, and spawns a task that every [`RECHECK`] re-detects the names
/// (keeping `names.router_name`), renews the leaf at 2/3 of its lifetime or on
/// any SAN change, and hot-reloads the returned `rustls` config.
pub async fn local_ca(dir: &Path, names: &LocalNames) -> Result<LocalCa, BoxError> {
    fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
    let (ca, created) = load_or_create_ca(dir, names)?;
    let (leaf, _) = ensure_leaf(dir, &ca, names, created)?;
    let rustls = RustlsConfig::from_config(server_config(&leaf)?);
    let out = LocalCa {
        rustls: rustls.clone(),
        ca_pem: ca.pem.clone(),
        fingerprint_sha256: fingerprint(&ca.der),
    };

    let dir = dir.to_owned();
    let mut names = names.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(RECHECK).await;
            // ponytail: blocking scutil/getifaddrs/file IO on the runtime; a few ms every 10 min.
            match LocalNames::detect(names.router_name.clone()) {
                Ok(n) => names = n,
                Err(e) => tracing::warn!("tls: name detection failed, keeping previous names: {e}"),
            }
            let renewed = ensure_leaf(&dir, &ca, &names, false).and_then(|(pem, renewed)| {
                if renewed {
                    rustls.reload_from_config(server_config(&pem)?);
                }
                Ok(renewed)
            });
            match renewed {
                Ok(true) => tracing::info!("tls: leaf renewed for {:?}", names.sans()),
                Ok(false) => {}
                Err(e) => tracing::warn!("tls: leaf renewal failed: {e}"),
            }
        }
    });
    Ok(out)
}

/// Same params on create and load: the issuer DN of every leaf must match the stored CA.
fn ca_params(cn: &str) -> CertificateParams {
    let mut p = CertificateParams::default();
    p.distinguished_name = DistinguishedName::new();
    p.distinguished_name.push(DnType::CommonName, cn);
    p.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    p.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    p.name_constraints = Some(NameConstraints {
        permitted_subtrees: vec![
            GeneralSubtree::DnsName("local".into()),
            GeneralSubtree::DnsName("home.arpa".into()),
            GeneralSubtree::DnsName("lan".into()),
            GeneralSubtree::IpAddress(CidrSubnet::from_v4_prefix([10, 0, 0, 0], 8)),
            GeneralSubtree::IpAddress(CidrSubnet::from_v4_prefix([172, 16, 0, 0], 12)),
            GeneralSubtree::IpAddress(CidrSubnet::from_v4_prefix([192, 168, 0, 0], 16)),
            GeneralSubtree::IpAddress(CidrSubnet::from_v6_prefix([0xfd, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 8)),
        ],
        excluded_subtrees: vec![],
    });
    let now = OffsetDateTime::now_utc();
    p.not_before = now - SKEW;
    p.not_after = now + Duration::days(CA_DAYS);
    p
}

/// Returns the CA and whether it was created by this call.
fn load_or_create_ca(dir: &Path, names: &LocalNames) -> Result<(Ca, bool), BoxError> {
    let (cert_path, key_path) = (dir.join("ca.pem"), dir.join("ca-key.pem"));
    if cert_path.exists() {
        // Never regenerate here: devices already trust this CA.
        let pem = fs::read_to_string(&cert_path)?;
        let key = KeyPair::from_pem(&fs::read_to_string(&key_path)?)?;
        let der = CertificateDer::from_pem_slice(pem.as_bytes())?;
        let (_, x509) = parse_x509_certificate(&der)?;
        if x509.public_key().subject_public_key.data.as_ref() != key.public_key_raw() {
            return Err(format!("{} does not match {}", key_path.display(), cert_path.display()).into());
        }
        let cn = x509
            .subject()
            .iter_common_name()
            .next()
            .and_then(|cn| cn.as_str().ok())
            .ok_or("CA certificate has no common name")?;
        let issuer = Issuer::new(ca_params(cn), key);
        return Ok((Ca { issuer, der: der.to_vec(), pem }, false));
    }
    let cn = format!("Nostube CA {}", names.local_name);
    let key = KeyPair::generate()?;
    let cert = ca_params(&cn).self_signed(&key)?;
    // Key first: an existing ca.pem always has its key next to it.
    write_file(&key_path, &key.serialize_pem(), 0o600)?;
    write_file(&cert_path, &cert.pem(), 0o644)?;
    let ca = Ca { pem: cert.pem(), der: cert.der().to_vec(), issuer: Issuer::new(ca_params(&cn), key) };
    Ok((ca, true))
}

/// Returns the leaf PEM (cert + key) and whether it was (re)issued.
fn ensure_leaf(dir: &Path, ca: &Ca, names: &LocalNames, force: bool) -> Result<(String, bool), BoxError> {
    let path = dir.join("leaf.pem");
    if !force {
        if let Ok(pem) = fs::read_to_string(&path) {
            if leaf_is_current(&pem, names, OffsetDateTime::now_utc().unix_timestamp()) {
                return Ok((pem, false));
            }
        }
    }
    let pem = issue_leaf(ca, names)?;
    write_file(&path, &pem, 0o600)?;
    Ok((pem, true))
}

fn issue_leaf(ca: &Ca, names: &LocalNames) -> Result<String, BoxError> {
    let mut p = CertificateParams::default();
    p.distinguished_name = DistinguishedName::new();
    p.distinguished_name.push(DnType::CommonName, names.local_name.as_str());
    for name in names.dns_names() {
        p.subject_alt_names.push(SanType::DnsName(name.try_into()?));
    }
    p.subject_alt_names.extend(names.ips.iter().copied().map(SanType::IpAddress));
    p.is_ca = IsCa::ExplicitNoCa;
    p.key_usages = vec![KeyUsagePurpose::DigitalSignature];
    p.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    p.use_authority_key_identifier_extension = true;
    let now = OffsetDateTime::now_utc();
    p.not_before = now - SKEW;
    p.not_after = now + Duration::days(LEAF_DAYS);
    // Fresh key per leaf; rcgen derives the serial from it, so serials never repeat.
    let key = KeyPair::generate()?;
    let cert = p.signed_by(&key, &ca.issuer)?;
    Ok(cert.pem() + &key.serialize_pem())
}

/// Current = parseable, before 2/3 of its lifetime, and SANs exactly `names`.
fn leaf_is_current(pem: &str, names: &LocalNames, now: i64) -> bool {
    let Ok(der) = CertificateDer::from_pem_slice(pem.as_bytes()) else { return false };
    let Ok((_, x509)) = parse_x509_certificate(&der) else { return false };
    let (nb, na) = (x509.validity().not_before.timestamp(), x509.validity().not_after.timestamp());
    if now >= nb + (na - nb) * 2 / 3 {
        return false;
    }
    let Ok(Some(san)) = x509.subject_alternative_name() else { return false };
    let have: BTreeSet<String> = san
        .value
        .general_names
        .iter()
        .filter_map(|g| match g {
            GeneralName::DNSName(d) => Some(d.to_string()),
            GeneralName::IPAddress(b) => <[u8; 4]>::try_from(*b)
                .map(IpAddr::from)
                .or_else(|_| <[u8; 16]>::try_from(*b).map(IpAddr::from))
                .ok()
                .map(|ip| ip.to_string()),
            _ => None,
        })
        .collect();
    have == names.sans()
}

fn server_config(leaf_pem: &str) -> Result<Arc<ServerConfig>, BoxError> {
    let certs = CertificateDer::pem_slice_iter(leaf_pem.as_bytes()).collect::<Result<Vec<_>, _>>()?;
    let key = PrivateKeyDer::from_pem_slice(leaf_pem.as_bytes())?;
    let mut cfg = ServerConfig::builder_with_provider(Arc::new(rustls::crypto::aws_lc_rs::default_provider()))
        .with_safe_default_protocol_versions()?
        .with_no_client_auth()
        .with_single_cert(certs, key)?;
    cfg.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    Ok(Arc::new(cfg))
}

/// Atomic replace (tmp + rename) so a crash never leaves a torn key or cert.
fn write_file(path: &Path, data: &str, mode: u32) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    let mut f = OpenOptions::new().write(true).create(true).truncate(true).mode(mode).open(&tmp)?;
    f.write_all(data.as_bytes())?;
    f.sync_all()?;
    fs::rename(&tmp, path)
}

fn fingerprint(der: &[u8]) -> String {
    Sha256::digest(der).iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(":")
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Port-80 router for `local-ca`: CA onboarding under `/ca*`, everything else 301 → HTTPS (#9).
pub fn onboarding_router(ca: &LocalCa, https_origin: String) -> Router {
    let origin = https_origin.trim_end_matches('/').to_owned();
    let page = Bytes::from(ca_page(&ca.fingerprint_sha256, &origin));
    let pem = Bytes::from(ca.ca_pem.clone());
    let profile = Bytes::from(mobileconfig(ca, &origin));
    Router::new()
        .route(
            "/ca",
            get(move || {
                let page = page.clone();
                async move { ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], page) }
            }),
        )
        .route(
            "/ca.pem",
            get(move || {
                let pem = pem.clone();
                async move {
                    (
                        [
                            (header::CONTENT_TYPE, "application/x-x509-ca-cert"),
                            (header::CONTENT_DISPOSITION, "attachment; filename=\"nostube-ca.crt\""),
                        ],
                        pem,
                    )
                }
            }),
        )
        .route(
            "/ca.mobileconfig",
            get(move || {
                let profile = profile.clone();
                async move {
                    (
                        [
                            (header::CONTENT_TYPE, "application/x-apple-aspen-config"),
                            (header::CONTENT_DISPOSITION, "attachment; filename=\"nostube-ca.mobileconfig\""),
                        ],
                        profile,
                    )
                }
            }),
        )
        .fallback(move |uri: Uri| {
            let target = format!("{origin}{}", uri.path_and_query().map_or("/", |pq| pq.as_str()));
            async move { (StatusCode::MOVED_PERMANENTLY, [(header::LOCATION, target)]).into_response() }
        })
}

/// iOS configuration profile carrying the CA as a root payload.
fn mobileconfig(ca: &LocalCa, origin: &str) -> String {
    let hex = ca.fingerprint_sha256.replace(':', "");
    let uuid = |h: &str| format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32]);
    // A PEM body is the base64 of the DER, which is what `<data>` wants.
    let b64: String = ca.ca_pem.lines().filter(|l| !l.starts_with("-----")).collect();
    let name = esc(&format!("Nostube CA for {origin}"));
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key><string>nostube-ca.cer</string>
      <key>PayloadContent</key><data>{b64}</data>
      <key>PayloadDescription</key><string>Root certificate of this Nostube instance (limited to .local, .home.arpa, .lan and private IPs)</string>
      <key>PayloadDisplayName</key><string>{name}</string>
      <key>PayloadIdentifier</key><string>nostube.ca.{id}.cert</string>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadUUID</key><string>{u1}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>{name}</string>
  <key>PayloadIdentifier</key><string>nostube.ca.{id}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>{u2}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
"#,
        id = &hex[..16],
        u1 = uuid(&hex[..32]),
        u2 = uuid(&hex[32..]),
    )
}

fn ca_page(fingerprint: &str, origin: &str) -> String {
    let origin = esc(origin);
    format!(
        r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trust this Nostube instance</title>
<style>body{{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.5}}code{{word-break:break-all}}h2{{margin-top:2rem}}</style>
</head><body>
<h1>Trust this Nostube instance</h1>
<p>This instance uses its own certificate authority (CA) for HTTPS on your local network. Each device needs to trust it once. Afterwards open <a href="{origin}/">{origin}</a>.</p>
<p>The CA can only vouch for names ending in <code>.local</code>, <code>.home.arpa</code> or <code>.lan</code> and for private IP addresses, never for public websites.</p>
<p><a href="/ca.pem">Download the CA certificate</a> · <a href="/ca.mobileconfig">iPhone/iPad profile</a></p>
<p>SHA-256 fingerprint (compare it with the one your device shows, and with the admin page):<br><code>{fingerprint}</code></p>

<h2>macOS</h2>
<ol>
<li>Download the CA certificate and double-click <code>nostube-ca.crt</code>; Keychain Access adds it to the login keychain.</li>
<li>Open the certificate in Keychain Access, expand <em>Trust</em> and set <em>When using this certificate</em> to <em>Always Trust</em>.</li>
<li>Chrome and Firefox on macOS 15 or later: allow them under System Settings → Privacy &amp; Security → Local Network.</li>
</ol>

<h2>iPhone / iPad</h2>
<ol>
<li>Open <a href="/ca.mobileconfig">the profile</a> in Safari and tap <em>Allow</em>.</li>
<li>Settings → General → VPN &amp; Device Management → the downloaded Nostube profile → <em>Install</em>.</li>
<li>Settings → General → About → Certificate Trust Settings → turn on full trust for the Nostube CA. Without this step the certificate is installed but not trusted.</li>
</ol>

<h2>Android</h2>
<ol>
<li>Download the CA certificate.</li>
<li>Settings → Security &amp; privacy → More security settings → Encryption &amp; credentials → Install a certificate → <em>CA certificate</em> → <em>Install anyway</em>, then pick <code>nostube-ca.crt</code>. The menu names differ between vendors; search Settings for “CA certificate”.</li>
<li>Chrome trusts it. Android 12 or later is needed for <code>.local</code> names, and not while a VPN is on.</li>
</ol>

<h2>Windows</h2>
<ol>
<li>Download the CA certificate and double-click <code>nostube-ca.crt</code> → <em>Install Certificate</em> → <em>Current User</em>.</li>
<li>Choose <em>Place all certificates in the following store</em> → <em>Trusted Root Certification Authorities</em> → Finish, and confirm the warning with <em>Yes</em>.</li>
<li>Edge, Chrome and Firefox use it; restart the browser.</li>
</ol>

<h2>Linux</h2>
<ol>
<li>Firefox: Settings → Privacy &amp; Security → Certificates → View Certificates → Authorities → Import, pick <code>nostube-ca.crt</code> and tick <em>Trust this CA to identify websites</em>. Firefox on Linux does not use the system store.</li>
<li>Chrome/Chromium: <code>chrome://certificate-manager</code> → Local certificates → Custom → Import.</li>
<li><code>.local</code> names need avahi with nss-mdns (default on Ubuntu/Debian desktops); otherwise use the IP address.</li>
</ol>
</body></html>
"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::{
        client::{danger::ServerCertVerifier, WebPkiServerVerifier},
        pki_types::{ServerName, UnixTime},
        RootCertStore,
    };

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("nostube-tls-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    fn names(ips: &[&str]) -> LocalNames {
        LocalNames {
            local_name: "test-host.local".into(),
            router_name: Some("nostube.home.arpa".into()),
            ips: ips.iter().map(|ip| ip.parse().unwrap()).collect(),
        }
    }

    fn leaf(dir: &Path) -> String {
        fs::read_to_string(dir.join("leaf.pem")).unwrap()
    }

    fn verify(ca_pem: &str, leaf_pem: &str, name: &str) -> Result<(), rustls::Error> {
        let mut roots = RootCertStore::empty();
        roots.add(CertificateDer::from_pem_slice(ca_pem.as_bytes()).unwrap()).unwrap();
        let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
        let verifier = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider).build().unwrap();
        let cert = CertificateDer::from_pem_slice(leaf_pem.as_bytes()).unwrap();
        let name = ServerName::try_from(name).unwrap();
        verifier.verify_server_cert(&cert, &[], &name, &[], UnixTime::now()).map(|_| ())
    }

    #[tokio::test]
    async fn leaf_verifies_for_every_san_and_constraints_reject_public_names() {
        let dir = tmp("verify");
        let n = names(&["192.168.1.10", "10.0.0.5", "172.20.0.1", "fd12::1"]);
        let ca = local_ca(&dir, &n).await.unwrap();
        let leaf = leaf(&dir);
        for san in ["test-host.local", "nostube.home.arpa", "192.168.1.10", "10.0.0.5", "172.20.0.1", "fd12::1"] {
            verify(&ca.ca_pem, &leaf, san).unwrap_or_else(|e| panic!("{san}: {e:?}"));
        }
        assert!(verify(&ca.ca_pem, &leaf, "other.local").is_err());

        let der = CertificateDer::from_pem_slice(ca.ca_pem.as_bytes()).unwrap();
        assert!(parse_x509_certificate(&der).unwrap().1.name_constraints().unwrap().is_some());

        // A leaf for public names, signed by the very same CA key, must not verify.
        let (signer, created) = load_or_create_ca(&dir, &n).unwrap();
        assert!(!created);
        let public = LocalNames {
            local_name: "example.com".into(),
            router_name: None,
            ips: vec!["8.8.8.8".parse().unwrap()],
        };
        let bad = issue_leaf(&signer, &public).unwrap();
        for name in ["example.com", "8.8.8.8"] {
            let err = verify(&ca.ca_pem, &bad, name).unwrap_err();
            assert!(format!("{err:?}").contains("NameConstraintViolation"), "{name}: {err:?}");
        }
    }

    #[tokio::test]
    async fn ca_reused_and_leaf_renewed_only_on_san_change() {
        let dir = tmp("renew");
        let n = names(&["192.168.1.10"]);
        let first = local_ca(&dir, &n).await.unwrap();
        let leaf1 = leaf(&dir);

        let second = local_ca(&dir, &n).await.unwrap();
        assert_eq!(first.ca_pem, second.ca_pem);
        assert_eq!(first.fingerprint_sha256, second.fingerprint_sha256);
        assert_eq!(leaf1, leaf(&dir), "unchanged names must not renew");

        let third = local_ca(&dir, &names(&["192.168.1.11"])).await.unwrap();
        assert_eq!(first.ca_pem, third.ca_pem);
        let leaf3 = leaf(&dir);
        assert_ne!(leaf1, leaf3, "IP change must renew");
        verify(&third.ca_pem, &leaf3, "192.168.1.11").unwrap();
        assert!(verify(&third.ca_pem, &leaf3, "192.168.1.10").is_err());

        use std::os::unix::fs::PermissionsExt;
        for f in ["ca-key.pem", "leaf.pem"] {
            assert_eq!(fs::metadata(dir.join(f)).unwrap().permissions().mode() & 0o777, 0o600, "{f}");
        }
    }

    #[test]
    fn leaf_due_at_two_thirds_of_lifetime() {
        let dir = tmp("age");
        fs::create_dir_all(&dir).unwrap();
        let n = names(&["192.168.1.10"]);
        let (ca, _) = load_or_create_ca(&dir, &n).unwrap();
        let pem = issue_leaf(&ca, &n).unwrap();
        let now = OffsetDateTime::now_utc().unix_timestamp();
        assert!(leaf_is_current(&pem, &n, now));
        // Lifetime is 366 days incl. skew; 2/3 is reached after ~243 days from now.
        assert!(leaf_is_current(&pem, &n, now + 240 * 86_400));
        assert!(!leaf_is_current(&pem, &n, now + 245 * 86_400));
    }
}
