//! The managed signer (ADR 0007, studio spec "Identität und Signer"): the server holds the
//! creator's key and signs what the studio asks it to. The key is kept in `secrets.toml` as a
//! NIP-49 `ncryptsec`; the password that unlocks it is a random secret in its own file. The admin
//! area (`admin.rs`) owns the files and the endpoints; this module is the crypto and the checks.

use nostr::prelude::*;
use serde::Deserialize;

use crate::relay::{MAX_FUTURE_SECS, MAX_MESSAGE_BYTES};

/// scrypt work factor of the ncryptsec. The password is 256 random bits, so scrypt adds nothing
/// against guessing it; a low factor keeps the unlock at startup cheap (NIP-49 allows any value).
const LOG_N: u8 = 12;

/// The unlocked managed key, shared by the admin area (which creates it) and the outbox (which
/// signs its mirror requests with it). `None`: no key; `Err`: `secrets.toml` has one that cannot
/// be unlocked.
pub type Shared = std::sync::Arc<parking_lot::Mutex<Option<Result<Keys, String>>>>;

/// The key as an `ncryptsec`, encrypted with `password`.
pub fn encrypt(secret: &SecretKey, password: &str) -> Result<String, String> {
    let fail = |e: &dyn std::fmt::Display| format!("cannot encrypt the managed key: {e}");
    let encrypted = EncryptedSecretKey::new(secret, password, LOG_N, KeySecurity::Medium).map_err(|e| fail(&e))?;
    encrypted.to_bech32().map_err(|e| fail(&e))
}

/// The keys from an `ncryptsec`; fails on a wrong password and on any changed byte (the cipher
/// is authenticated).
pub fn decrypt(ncryptsec: &str, password: &str) -> Result<Keys, String> {
    let encrypted = EncryptedSecretKey::from_bech32(ncryptsec).map_err(|e| format!("broken managed key: {e}"))?;
    let secret = encrypted.decrypt(password).map_err(|e| format!("cannot unlock the managed key: {e}"))?;
    Ok(Keys::new(secret))
}

/// What the studio sends to be signed: NIP-01 without id, pubkey and signature. Anything else
/// in the body is refused rather than ignored.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Unsigned {
    kind: u16,
    created_at: u64,
    tags: Vec<Vec<String>>,
    content: String,
}

/// Signs the JSON `body` with `keys`. The limits are the relay's own (#11), so whatever is
/// signed here can also be stored here.
pub fn sign(keys: &Keys, body: &[u8]) -> Result<Event, String> {
    if body.len() > MAX_MESSAGE_BYTES {
        return Err(format!("event too large (over {} KiB)", MAX_MESSAGE_BYTES / 1024));
    }
    let u: Unsigned = serde_json::from_slice(body).map_err(|e| format!("invalid event: {e}"))?;
    if u.created_at > Timestamp::now().as_secs() + MAX_FUTURE_SECS {
        return Err("created_at is too far in the future".into());
    }
    let tags = u.tags.into_iter().map(Tag::parse).collect::<Result<Vec<_>, _>>().map_err(|e| format!("invalid tag: {e}"))?;
    UnsignedEvent::new(keys.public_key(), Timestamp::from(u.created_at), Kind::from(u.kind), tags, u.content)
        .finalize(keys)
        .map_err(|e| format!("cannot sign: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASSWORD: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn encrypted_key_round_trips_and_refuses_wrong_password_or_tampering() {
        let keys = Keys::generate();
        let ncryptsec = encrypt(keys.secret_key(), PASSWORD).unwrap();
        assert!(ncryptsec.starts_with("ncryptsec1"));
        assert_eq!(decrypt(&ncryptsec, PASSWORD).unwrap().public_key(), keys.public_key());
        assert!(decrypt(&ncryptsec, "wrong").is_err());

        // One changed byte of the ciphertext (re-encoded, so the bech32 checksum is valid).
        let mut bytes = EncryptedSecretKey::from_bech32(&ncryptsec).unwrap().as_vec();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        let tampered = EncryptedSecretKey::from_slice(&bytes).unwrap().to_bech32().unwrap();
        assert!(decrypt(&tampered, PASSWORD).is_err());
    }

    #[test]
    fn signs_a_valid_event_with_the_managed_key() {
        let keys = Keys::generate();
        let body = r#"{"kind":1,"created_at":1700000000,"tags":[["t","nostube"]],"content":"hi"}"#;
        let event = sign(&keys, body.as_bytes()).unwrap();
        assert_eq!(event.pubkey, keys.public_key());
        assert_eq!(event.kind, Kind::TextNote);
        assert_eq!(event.created_at.as_secs(), 1700000000);
        event.verify().unwrap();
    }

    #[test]
    fn refuses_events_of_the_wrong_shape() {
        let keys = Keys::generate();
        let now = Timestamp::now().as_secs();
        for body in [
            "not json".to_owned(),
            r#"{"kind":1,"created_at":1,"tags":[]}"#.to_owned(), // no content
            r#"{"kind":70000,"created_at":1,"tags":[],"content":""}"#.to_owned(), // kind over u16
            r#"{"kind":1,"created_at":-1,"tags":[],"content":""}"#.to_owned(),
            r#"{"kind":1,"created_at":1,"tags":[[]],"content":""}"#.to_owned(), // empty tag
            r#"{"kind":1,"created_at":1,"tags":[[1]],"content":""}"#.to_owned(),
            r#"{"kind":1,"created_at":1,"tags":[],"content":"","pubkey":"x"}"#.to_owned(),
            format!(r#"{{"kind":1,"created_at":{},"tags":[],"content":""}}"#, now + MAX_FUTURE_SECS + 60),
            format!(r#"{{"kind":1,"created_at":1,"tags":[],"content":"{}"}}"#, "x".repeat(MAX_MESSAGE_BYTES)),
        ] {
            assert!(sign(&keys, body.as_bytes()).is_err(), "accepted {}", &body[..body.len().min(80)]);
        }
    }
}
