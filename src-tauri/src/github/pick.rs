//! Which signed-in GitHub account a repo is cloned and pushed as, for a cloud
//! sandbox. In order: the account set for the repo in Settings, the one its SSH
//! alias names (`github.com-noble1911`), the one that owns it, the only one.
//! Failing those, GitHub is asked which account can push, and the answer is
//! remembered per owner like `gh`'s PR polling does (`github::gh`).
//!
//! Blocking: it runs on a sandbox session's own thread, never the UI's.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use super::accounts::{self, Credential};
use super::token::Token;
use crate::repo_catalog::model::RemoteRepo;

/// The account picked, and why (shown in the session's terminal).
#[derive(Debug)]
pub struct Choice {
    pub login: String,
    pub token: Token,
    pub why: &'static str,
}

/// Owner → the login that could push there, from an earlier check.
static BY_OWNER: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn same(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

/// The choice that needs no network: `prefer` is (login, why) in order.
fn choose_offline(
    accounts: &[Credential],
    remote: &RemoteRepo,
    prefer: &[(String, &'static str)],
) -> Option<(usize, &'static str)> {
    let at = |login: &str| accounts.iter().position(|a| same(&a.login, login));
    prefer
        .iter()
        .find_map(|(login, why)| at(login).map(|i| (i, *why)))
        .or_else(|| at(&remote.owner).map(|i| (i, "it owns the repository")))
        .or_else(|| (accounts.len() == 1).then_some((0, "the only account")))
}

#[derive(PartialEq)]
enum Access {
    Push,
    Read,
    None,
}

fn http() -> Option<&'static reqwest::blocking::Client> {
    static CLIENT: OnceLock<Option<reqwest::blocking::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .user_agent("trace")
                .timeout(Duration::from_secs(15))
                .build()
                .ok()
        })
        .as_ref()
}

fn access(token: &Token, remote: &RemoteRepo) -> Access {
    let Some(client) = http() else {
        return Access::None;
    };
    let url = format!("https://api.github.com/repos/{}", remote.full_name());
    let Ok(res) = client
        .get(url)
        .bearer_auth(token.expose())
        .header("Accept", "application/vnd.github+json")
        .send()
    else {
        return Access::None;
    };
    if !res.status().is_success() {
        return Access::None;
    }
    let body: serde_json::Value = res.json().unwrap_or_default();
    match body["permissions"]["push"].as_bool() {
        Some(true) => Access::Push,
        _ => Access::Read,
    }
}

fn pick(accounts: &[Credential], i: usize, why: &'static str) -> Choice {
    Choice {
        login: accounts[i].login.clone(),
        token: accounts[i].token.clone(),
        why,
    }
}

/// The account to use for `remote`, or None when trace has no GitHub account.
/// `prefer`: (login, why) to try first — a Settings override, an SSH alias.
pub fn for_repo(remote: &RemoteRepo, prefer: &[(String, &'static str)]) -> Option<Choice> {
    let accounts = accounts::load_all();
    if accounts.is_empty() {
        return None;
    }
    if let Some((i, why)) = choose_offline(&accounts, remote, prefer) {
        return Some(pick(&accounts, i, why));
    }
    let owner = remote.owner.to_ascii_lowercase();
    let remembered = BY_OWNER
        .lock()
        .ok()
        .and_then(|m| m.as_ref()?.get(&owner).cloned());
    if let Some(i) = remembered.and_then(|l| accounts.iter().position(|a| same(&a.login, &l))) {
        return Some(pick(&accounts, i, "it can push there"));
    }
    let mut readable = None;
    for (i, account) in accounts.iter().enumerate() {
        match access(&account.token, remote) {
            Access::Push => {
                if let Ok(mut m) = BY_OWNER.lock() {
                    m.get_or_insert_with(HashMap::new)
                        .insert(owner, account.login.clone());
                }
                return Some(pick(&accounts, i, "it can push there"));
            }
            Access::Read if readable.is_none() => readable = Some(i),
            _ => {}
        }
    }
    Some(match readable {
        Some(i) => pick(&accounts, i, "it can read the repository (none can push)"),
        None => pick(&accounts, 0, "the primary account"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::accounts::Source;

    fn account(login: &str) -> Credential {
        Credential {
            token: Token::new("ghp_x").expect("token"),
            source: Source::Gh,
            login: login.into(),
        }
    }

    fn repo(owner: &str) -> RemoteRepo {
        RemoteRepo {
            host: "github.com".into(),
            owner: owner.into(),
            name: "trace".into(),
        }
    }

    #[test]
    fn settings_beat_the_alias_which_beats_the_owner() {
        let accounts = [account("ron875"), account("noble1911")];
        let prefer = [
            ("ron875".to_string(), "set for this repository"),
            ("noble1911".to_string(), "its SSH alias"),
        ];
        assert_eq!(
            choose_offline(&accounts, &repo("noble1911"), &prefer),
            Some((0, "set for this repository"))
        );
        assert_eq!(
            choose_offline(&accounts, &repo("noble1911"), &prefer[1..]),
            Some((1, "its SSH alias"))
        );
        assert_eq!(
            choose_offline(&accounts, &repo("NOBLE1911"), &[]),
            Some((1, "it owns the repository"))
        );
    }

    #[test]
    fn an_org_repo_with_two_accounts_needs_asking() {
        let accounts = [account("ron875"), account("noble1911")];
        assert_eq!(
            choose_offline(&accounts, &repo("ObsidianResearch"), &[]),
            None
        );
        assert_eq!(
            choose_offline(&accounts[..1], &repo("ObsidianResearch"), &[]),
            Some((0, "the only account"))
        );
    }

    #[test]
    fn a_preferred_login_not_signed_in_is_skipped() {
        let accounts = [account("ron875")];
        let prefer = [("someone".to_string(), "its SSH alias")];
        assert_eq!(
            choose_offline(&accounts, &repo("noble1911"), &prefer),
            Some((0, "the only account"))
        );
    }
}
