//! The GitHub accounts trace is signed in as. Several are allowed, since people
//! keep a work and a personal account, and a sandbox has to clone and push as
//! whichever one owns the repo (`github::pick`). One is primary: what the repo
//! browser and other single-account features use.
//!
//! One user-only file (`helpers::persist`), as before; a file from when trace
//! held one token still reads, as that one account. Tokens never leave the Rust
//! side: [`AccountSummary`] is what the renderer sees.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::token::Token;
use crate::helpers::persist::{self, Style};

/// How trace got a token.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// A personal access token the user pasted.
    Pasted,
    /// Copied once from `gh auth token`.
    Gh,
    /// OAuth device flow.
    Device,
}

/// One signed-in account.
#[derive(Clone, Debug)]
pub struct Credential {
    pub token: Token,
    pub source: Source,
    pub login: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Stored {
    token: String,
    source: Source,
    login: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredFile {
    accounts: Vec<Stored>,
    #[serde(default)]
    primary: Option<String>,
}

/// The file as any trace wrote it.
#[derive(Deserialize)]
#[serde(untagged)]
enum OnDisk {
    Many(StoredFile),
    /// Before trace held more than one account.
    One(Stored),
}

impl From<OnDisk> for StoredFile {
    fn from(d: OnDisk) -> StoredFile {
        match d {
            OnDisk::Many(f) => f,
            OnDisk::One(s) => StoredFile {
                primary: Some(s.login.clone()),
                accounts: vec![s],
            },
        }
    }
}

fn same(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("github-token.json")
}

fn read_at(path: &Path) -> StoredFile {
    persist::read_or_log::<Option<OnDisk>>(path)
        .map(StoredFile::from)
        .unwrap_or_default()
}

fn update_at<R>(path: &Path, f: impl FnOnce(&mut StoredFile) -> R) -> Result<R, String> {
    // Read through `OnDisk` so an old single-account file is upgraded in place.
    let mut file = read_at(path);
    let out = f(&mut file);
    persist::write_json(path, Style::Compact, &file)?;
    Ok(out)
}

fn credential(s: &Stored) -> Option<Credential> {
    Some(Credential {
        token: Token::new(&s.token)?,
        source: s.source,
        login: s.login.clone(),
    })
}

fn all_at(path: &Path) -> Vec<Credential> {
    let file = read_at(path);
    let mut out: Vec<Credential> = file.accounts.iter().filter_map(credential).collect();
    if let Some(primary) = &file.primary {
        out.sort_by_key(|c| !same(&c.login, primary));
    }
    out
}

/// Every account, the primary first.
pub fn load_all() -> Vec<Credential> {
    all_at(&path())
}

/// The primary account, if any is signed in.
pub fn load() -> Option<Credential> {
    load_all().into_iter().next()
}

/// The signed-in account named `login`.
pub fn find(login: &str) -> Option<Credential> {
    load_all().into_iter().find(|c| same(&c.login, login))
}

fn save_at(path: &Path, cred: &Credential) -> Result<(), String> {
    update_at(path, |file| {
        file.accounts.retain(|s| !same(&s.login, &cred.login));
        file.accounts.push(Stored {
            token: cred.token.expose().to_string(),
            source: cred.source,
            login: cred.login.clone(),
        });
        if file.primary.is_none() {
            file.primary = Some(cred.login.clone());
        }
    })
}

/// Add an account, or replace the token of one already signed in. The first
/// account becomes primary.
pub fn save(cred: &Credential) -> Result<(), String> {
    save_at(&path(), cred)
}

fn remove_at(path: &Path, login: &str) -> Result<(), String> {
    update_at(path, |file| {
        file.accounts.retain(|s| !same(&s.login, login));
        if file.primary.as_deref().is_some_and(|p| same(p, login)) {
            file.primary = file.accounts.first().map(|s| s.login.clone());
        }
    })
}

/// Sign one account out. If it was primary, the next one is.
pub fn remove(login: &str) -> Result<(), String> {
    remove_at(&path(), login)
}

/// Make `login` the account single-account features use.
pub fn set_primary(login: &str) -> Result<(), String> {
    update_at(&path(), |file| {
        let found = file.accounts.iter().find(|s| same(&s.login, login));
        let login = found
            .map(|s| s.login.clone())
            .ok_or("That account isn't signed in.")?;
        file.primary = Some(login);
        Ok(())
    })?
}

/// Sign every account out.
pub fn clear() -> Result<(), String> {
    match std::fs::remove_file(path()) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Couldn't remove the GitHub tokens: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cred(login: &str, token: &str) -> Credential {
        Credential {
            token: Token::new(token).expect("a token"),
            source: Source::Gh,
            login: login.into(),
        }
    }

    fn temp() -> ((), PathBuf) {
        let dir = std::env::temp_dir().join(format!("trace-gh-{}", crate::helpers::new_id()));
        let _ = std::fs::create_dir_all(&dir);
        ((), dir.join("github-token.json"))
    }

    #[test]
    fn an_old_single_account_file_still_reads() {
        let (_dir, path) = temp();
        std::fs::write(
            &path,
            r#"{"token":"ghp_old","source":"gh","login":"ron875"}"#,
        )
        .expect("write");
        let all = all_at(&path);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].login, "ron875");
    }

    #[test]
    fn accounts_are_added_replaced_and_ordered_primary_first() {
        let (_dir, path) = temp();
        save_at(&path, &cred("ron875", "ghp_a")).expect("save");
        save_at(&path, &cred("noble1911", "ghp_b")).expect("save");
        save_at(&path, &cred("NOBLE1911", "ghp_c")).expect("replace");
        let all = all_at(&path);
        let logins: Vec<&str> = all.iter().map(|c| c.login.as_str()).collect();
        assert_eq!(logins, ["ron875", "NOBLE1911"]);
        assert_eq!(all[1].token.expose(), "ghp_c");
    }

    #[test]
    fn removing_the_primary_promotes_the_next() {
        let (_dir, path) = temp();
        save_at(&path, &cred("ron875", "ghp_a")).expect("save");
        save_at(&path, &cred("noble1911", "ghp_b")).expect("save");
        remove_at(&path, "ron875").expect("remove");
        let all = all_at(&path);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].login, "noble1911");
    }

    #[test]
    fn debug_never_shows_a_token() {
        let c = cred("me", "ghp_SECRET123");
        assert!(!format!("{c:?}").contains("SECRET"));
    }
}
