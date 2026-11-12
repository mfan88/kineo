//! Keeps Clerk's client token (the signed-in session) in the OS keychain:
//! Keychain on macOS, Credential Manager on Windows, Secret Service on Linux.
//! The page can only read, replace or clear this one entry.

/// The keychain entry: service is the app's bundle ID, account names what it holds.
const SERVICE: &str = "tech.fenna.kineo";
const ACCOUNT: &str = "clerk-client-token";

/// Clerk's client tokens are JWTs of a few hundred bytes; anything far bigger isn't one.
const MAX_TOKEN_BYTES: usize = 16 * 1024;

/// The keychain operations this module needs, so tests can use a stand-in.
pub trait SecretStore {
    /// `Ok(None)` when there's no entry yet.
    fn read(&self) -> Result<Option<String>, String>;
    fn write(&self, secret: &str) -> Result<(), String>;
    /// Succeeds when there's no entry to delete.
    fn delete(&self) -> Result<(), String>;
}

pub struct Keychain;

impl Keychain {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| "Couldn't open the keychain.".to_string())
    }
}

// Errors never include the token or keychain details.
impl SecretStore for Keychain {
    fn read(&self) -> Result<Option<String>, String> {
        match Self::entry()?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Couldn't read the saved session from the keychain.".to_string()),
        }
    }

    fn write(&self, secret: &str) -> Result<(), String> {
        Self::entry()?
            .set_password(secret)
            .map_err(|_| "Couldn't save the session to the keychain.".to_string())
    }

    fn delete(&self) -> Result<(), String> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Couldn't remove the saved session from the keychain.".to_string()),
        }
    }
}

/// The saved token, or `None`. An empty entry counts as none.
pub fn load(store: &impl SecretStore) -> Result<Option<String>, String> {
    Ok(store.read()?.filter(|token| !token.is_empty()))
}

/// Saves a token exactly as Clerk sent it, after checking it looks like one: a JWT
/// (three base64url parts), with or without a `Bearer ` prefix.
pub fn save(store: &impl SecretStore, token: &str) -> Result<(), String> {
    let jwt = token.strip_prefix("Bearer ").unwrap_or(token);
    let looks_like_jwt = token.len() <= MAX_TOKEN_BYTES
        && jwt.split('.').count() == 3
        && jwt.split('.').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        });
    if !looks_like_jwt {
        return Err("That isn't a session token.".to_string());
    }
    store.write(token)
}

pub fn clear(store: &impl SecretStore) -> Result<(), String> {
    store.delete()
}

#[tauri::command]
pub fn session_token_load() -> Result<Option<String>, String> {
    load(&Keychain)
}

#[tauri::command]
pub fn session_token_save(token: String) -> Result<(), String> {
    save(&Keychain, &token)
}

#[tauri::command]
pub fn session_token_clear() -> Result<(), String> {
    clear(&Keychain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Memory(RefCell<Option<String>>);

    impl SecretStore for Memory {
        fn read(&self) -> Result<Option<String>, String> {
            Ok(self.0.borrow().clone())
        }
        fn write(&self, secret: &str) -> Result<(), String> {
            *self.0.borrow_mut() = Some(secret.to_string());
            Ok(())
        }
        fn delete(&self) -> Result<(), String> {
            *self.0.borrow_mut() = None;
            Ok(())
        }
    }

    const TOKEN: &str = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl_-";

    #[test]
    fn nothing_saved_loads_as_none() {
        assert_eq!(load(&Memory::default()), Ok(None));
    }

    #[test]
    fn saves_loads_and_clears() {
        let store = Memory::default();
        save(&store, TOKEN).unwrap();
        assert_eq!(load(&store), Ok(Some(TOKEN.to_string())));
        clear(&store).unwrap();
        assert_eq!(load(&store), Ok(None));
        // Clearing twice is fine.
        clear(&store).unwrap();
    }

    #[test]
    fn a_new_token_replaces_the_old_one() {
        let store = Memory::default();
        save(&store, TOKEN).unwrap();
        save(&store, "a.b.c").unwrap();
        assert_eq!(load(&store), Ok(Some("a.b.c".to_string())));
    }

    #[test]
    fn keeps_a_bearer_prefix_as_sent() {
        let store = Memory::default();
        let with_prefix = format!("Bearer {TOKEN}");
        save(&store, &with_prefix).unwrap();
        assert_eq!(load(&store), Ok(Some(with_prefix)));
    }

    #[test]
    fn an_empty_entry_counts_as_none() {
        let store = Memory(RefCell::new(Some(String::new())));
        assert_eq!(load(&store), Ok(None));
    }

    #[test]
    fn refuses_things_that_arent_tokens() {
        let store = Memory::default();
        let too_long = format!("a.b.{}", "c".repeat(MAX_TOKEN_BYTES));
        for bad in [
            "",
            "abc",
            "a.b",
            "a..c",
            "a.b.c.d",
            "a.b c.d",
            "a.b.c\n",
            "a.b.ç",
            too_long.as_str(),
        ] {
            assert!(save(&store, bad).is_err(), "{bad:?} should be refused");
        }
        assert_eq!(load(&store), Ok(None));
    }
}
