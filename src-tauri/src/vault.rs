use std::{fs, path::PathBuf};

use nostr::{
    nips::nip19::{FromBech32, ToBech32},
    nips::nip49::EncryptedSecretKey,
    Keys, SecretKey,
};
#[cfg(target_os = "macos")]
use security_framework::passwords::{
    delete_generic_password_options, generic_password, set_generic_password_options,
    PasswordOptions,
};
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "org.nostube.desktop.vault";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAccount {
    pub pubkey: String,
}

#[derive(Default, Serialize, Deserialize)]
struct PersistedVault {
    accounts: Vec<DesktopAccount>,
    #[serde(default)]
    selected_pubkey: Option<String>,
}

struct ActiveAccount {
    pubkey: String,
    secret_key: Zeroizing<Vec<u8>>,
}

pub struct Vault {
    metadata_path: Option<PathBuf>,
    accounts: Vec<DesktopAccount>,
    active: Option<ActiveAccount>,
    selected_pubkey: Option<String>,
}

impl Default for Vault {
    fn default() -> Self {
        Self {
            metadata_path: None,
            accounts: Vec::new(),
            active: None,
            selected_pubkey: None,
        }
    }
}

impl Vault {
    pub fn initialize(&mut self, metadata_path: PathBuf) -> Result<(), String> {
        self.metadata_path = Some(metadata_path.clone());
        let persisted = match fs::read(&metadata_path) {
            Ok(bytes) => serde_json::from_slice::<PersistedVault>(&bytes)
                .map_err(|error| format!("Could not read desktop account metadata: {error}"))?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => PersistedVault::default(),
            Err(error) => return Err(format!("Could not read desktop account metadata: {error}")),
        };
        self.accounts = persisted.accounts;
        self.selected_pubkey = persisted.selected_pubkey;
        Ok(())
    }

    pub fn accounts(&self) -> &[DesktopAccount] {
        &self.accounts
    }

    pub fn active_pubkey(&self) -> Option<&str> {
        self.active.as_ref().map(|active| active.pubkey.as_str())
    }

    pub fn is_locked(&self) -> bool {
        self.active.is_none()
    }

    pub fn import(&mut self, credential: &str, password: Option<&str>) -> Result<String, String> {
        let keys = parse_credential(credential, password)?;
        let pubkey = keys.public_key().to_hex();
        let mut nsec = keys
            .secret_key()
            .to_bech32()
            .map_err(|error| format!("Could not encode desktop credential: {error}"))?;

        store_credential(&pubkey, nsec.as_bytes())?;
        nsec.zeroize();

        if !self.accounts.iter().any(|account| account.pubkey == pubkey) {
            self.accounts.push(DesktopAccount {
                pubkey: pubkey.clone(),
            });
            self.persist()?;
        }
        drop(keys);
        self.unlock(&pubkey)?;
        Ok(pubkey)
    }

    pub fn unlock(&mut self, pubkey: &str) -> Result<(), String> {
        if !self.accounts.iter().any(|account| account.pubkey == pubkey) {
            return Err("The selected desktop account is not on this device".into());
        }

        let mut credential = String::from_utf8(load_credential(pubkey)?)
            .map_err(|_| "The protected desktop credential is invalid".to_string())?;
        let keys = Keys::parse(&credential)
            .map_err(|_| "The protected desktop credential is invalid".to_string())?;
        credential.zeroize();
        self.activate(keys);
        self.selected_pubkey = Some(pubkey.to_owned());
        self.persist()?;
        Ok(())
    }

    pub fn restore_last_account(&mut self) -> Result<(), String> {
        let Some(pubkey) = self
            .selected_pubkey
            .clone()
            .or_else(|| self.accounts.first().map(|account| account.pubkey.clone()))
        else {
            return Ok(());
        };
        self.unlock(&pubkey)
    }

    pub fn lock(&mut self) {
        self.active = None;
    }

    pub fn remove(&mut self, pubkey: &str) -> Result<(), String> {
        delete_credential(pubkey)?;
        self.accounts.retain(|account| account.pubkey != pubkey);
        if self.selected_pubkey.as_deref() == Some(pubkey) {
            self.selected_pubkey = None;
        }
        if self.active_pubkey() == Some(pubkey) {
            self.lock();
        }
        self.persist()
    }

    pub fn export(&self, pubkey: &str) -> Result<String, String> {
        if !self.accounts.iter().any(|account| account.pubkey == pubkey) {
            return Err("The selected desktop account is not on this device".into());
        }
        String::from_utf8(load_credential(pubkey)?)
            .map_err(|_| "The protected desktop credential is invalid".to_string())
    }

    pub fn active_secret_key(&self) -> Result<SecretKey, String> {
        let active = self
            .active
            .as_ref()
            .ok_or_else(|| "Unlock a desktop account before signing".to_string())?;
        SecretKey::from_slice(active.secret_key.as_slice())
            .map_err(|_| "The unlocked desktop credential is invalid".to_string())
    }

    fn activate(&mut self, keys: Keys) {
        self.active = Some(ActiveAccount {
            pubkey: keys.public_key().to_hex(),
            secret_key: Zeroizing::new(keys.secret_key().as_secret_bytes().to_vec()),
        });
    }

    fn persist(&self) -> Result<(), String> {
        let metadata_path = self
            .metadata_path
            .as_ref()
            .ok_or_else(|| "Desktop vault has not been initialized".to_string())?;
        let bytes = serde_json::to_vec(&PersistedVault {
            accounts: self.accounts.clone(),
            selected_pubkey: self.selected_pubkey.clone(),
        })
        .map_err(|error| format!("Could not encode desktop account metadata: {error}"))?;
        fs::write(metadata_path, bytes)
            .map_err(|error| format!("Could not save desktop account metadata: {error}"))
    }
}

fn parse_credential(credential: &str, password: Option<&str>) -> Result<Keys, String> {
    if credential.starts_with("ncryptsec1") {
        let encrypted = EncryptedSecretKey::from_bech32(credential)
            .map_err(|_| "The encrypted desktop credential is invalid".to_string())?;
        let password =
            password.ok_or_else(|| "An encrypted credential requires its password".to_string())?;
        return encrypted
            .decrypt(password)
            .map(Keys::new)
            .map_err(|_| "The encrypted desktop credential could not be unlocked".to_string());
    }

    Keys::parse(credential).map_err(|_| "The desktop credential is invalid".to_string())
}

fn store_credential(pubkey: &str, credential: &[u8]) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return store_keychain_credential(pubkey, credential);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (pubkey, credential);
        Err("Desktop credential storage is not yet supported on this platform".to_string())
    }
}

#[cfg(target_os = "macos")]
fn store_keychain_credential(pubkey: &str, credential: &[u8]) -> Result<(), String> {
    set_generic_password_options(
        credential,
        PasswordOptions::new_generic_password(KEYCHAIN_SERVICE, pubkey),
    )
    .map_err(|error| format!("Could not save desktop credential in Keychain: {error}"))
}

fn load_credential(pubkey: &str) -> Result<Vec<u8>, String> {
    #[cfg(target_os = "macos")]
    {
        return load_keychain_credential(pubkey);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = pubkey;
        Err("Desktop credential storage is not yet supported on this platform".to_string())
    }
}

#[cfg(target_os = "macos")]
fn load_keychain_credential(pubkey: &str) -> Result<Vec<u8>, String> {
    generic_password(PasswordOptions::new_generic_password(
        KEYCHAIN_SERVICE,
        pubkey,
    ))
    .map_err(|error| format!("Could not read desktop credential from Keychain: {error}"))
}

fn delete_credential(pubkey: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return delete_keychain_credential(pubkey);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = pubkey;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn delete_keychain_credential(pubkey: &str) -> Result<(), String> {
    delete_generic_password_options(PasswordOptions::new_generic_password(
        KEYCHAIN_SERVICE,
        pubkey,
    ))
    .map_err(|error| format!("Could not remove desktop credential from Keychain: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_NSEC: &str = "nsec1j4c6269y9w0q2er2xjw8sv2ehyrtfxq3jwgdlxj6qfn8z4gjsq5qfvfk99";
    const TEST_PUBKEY: &str = "aa4fc8665f5696e33db7e1a572e3b0f5b3d615837b0f362dcb1c8068b098c7b4";

    #[test]
    fn imports_an_nsec_without_a_signing_entitlement() {
        let metadata_path =
            std::env::temp_dir().join(format!("nostube-vault-test-{}.json", std::process::id()));
        let _ = fs::remove_file(&metadata_path);

        let mut vault = Vault::default();
        vault.initialize(metadata_path.clone()).unwrap();
        let pubkey = vault.import(TEST_NSEC, None).unwrap();

        assert_eq!(pubkey, TEST_PUBKEY);
        assert_eq!(vault.active_pubkey(), Some(TEST_PUBKEY));
        drop(vault);
        fs::write(
            &metadata_path,
            format!(r#"{{"accounts":[{{"pubkey":"{TEST_PUBKEY}"}}]}}"#),
        )
        .unwrap();

        let mut restored = Vault::default();
        restored.initialize(metadata_path.clone()).unwrap();

        assert_eq!(restored.accounts()[0].pubkey, TEST_PUBKEY);
        assert!(restored.is_locked());

        restored.restore_last_account().unwrap();
        assert_eq!(restored.active_pubkey(), Some(TEST_PUBKEY));

        restored.remove(TEST_PUBKEY).unwrap();
        let _ = fs::remove_file(metadata_path);
    }
}
