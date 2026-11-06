//! Who the user is on GitHub, according to their `gh` CLI. trace holds no GitHub
//! token: signing in and out is `gh auth login` / `gh auth logout`, and every
//! call runs as `gh`'s active account.

use serde::Serialize;
use serde_json::Value;

/// The GitHub integration's state, for the Integrations card.
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    /// `gh` was found (`claude::discovery`).
    pub installed: bool,
    /// The active, working github.com account.
    pub login: Option<String>,
    /// Every signed-in github.com login, active first.
    pub accounts: Vec<String>,
    /// Why there's no working account when `gh` has one listed (e.g. an expired token).
    pub problem: Option<String>,
}

/// One github.com account from `gh auth status --json hosts`.
#[derive(Debug, PartialEq)]
pub struct Account {
    pub login: String,
    pub active: bool,
    pub ok: bool,
}

/// The github.com accounts in `gh auth status --json hosts` output.
pub fn parse_auth_status(json: &str) -> Result<Vec<Account>, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("Unexpected gh output: {e}"))?;
    Ok(v.pointer("/hosts/github.com")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|a| {
            Some(Account {
                login: a.get("login").and_then(Value::as_str)?.to_string(),
                active: a.get("active").and_then(Value::as_bool).unwrap_or(false),
                ok: a.get("state").and_then(Value::as_str) == Some("success"),
            })
        })
        .collect())
}

/// The status those accounts amount to.
pub fn summarize(accounts: &[Account]) -> GhStatus {
    let mut ordered: Vec<&Account> = accounts.iter().collect();
    ordered.sort_by_key(|a| !a.active);
    let login = ordered
        .iter()
        .find(|a| a.active && a.ok)
        .map(|a| a.login.clone());
    let problem = match (&login, ordered.first()) {
        (None, Some(a)) => Some(format!(
            "gh's sign-in for {} no longer works. Run `gh auth login` in a terminal.",
            a.login
        )),
        _ => None,
    };
    GhStatus {
        installed: true,
        login,
        accounts: ordered.iter().map(|a| a.login.clone()).collect(),
        problem,
    }
}

/// Ask `gh`. Never errors: a missing or signed-out `gh` is a state to show.
pub fn status() -> GhStatus {
    if crate::claude::discovery::find_cli_with_env("gh", None).is_none() {
        return GhStatus::default();
    }
    let out = crate::claude::discovery::command("gh")
        .args(["auth", "status", "--json", "hosts"])
        .output();
    match out {
        // `gh auth status` exits non-zero when an account is broken but still
        // prints the JSON, so parse whatever came out.
        Ok(o) => match parse_auth_status(&String::from_utf8_lossy(&o.stdout)) {
            Ok(accounts) => summarize(&accounts),
            Err(_) => legacy_status(),
        },
        Err(e) => GhStatus {
            installed: true,
            problem: Some(format!("Couldn't run gh: {e}")),
            ..GhStatus::default()
        },
    }
}

/// For a `gh` older than `auth status --json`: the active login from the API.
fn legacy_status() -> GhStatus {
    let login = crate::claude::discovery::command("gh")
        .args(["api", "user", "--jq", ".login"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|l| !l.is_empty());
    GhStatus {
        installed: true,
        accounts: login.iter().cloned().collect(),
        login,
        problem: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TWO: &str = r#"{"hosts":{"github.com":[
        {"state":"success","active":false,"host":"github.com","login":"work","tokenSource":"keyring"},
        {"state":"success","active":true,"host":"github.com","login":"me","gitProtocol":"ssh"}
    ],"ghe.corp":[{"state":"success","active":true,"login":"corp"}]}}"#;

    #[test]
    fn active_account_first_and_other_hosts_ignored() {
        let s = summarize(&parse_auth_status(TWO).unwrap());
        assert_eq!(s.login.as_deref(), Some("me"));
        assert_eq!(s.accounts, vec!["me", "work"]);
        assert!(s.installed && s.problem.is_none());
    }

    #[test]
    fn signed_out_is_empty_not_an_error() {
        let s = summarize(&parse_auth_status(r#"{"hosts":{}}"#).unwrap());
        assert_eq!(s.login, None);
        assert!(s.accounts.is_empty() && s.problem.is_none());
    }

    #[test]
    fn a_broken_active_token_is_a_problem() {
        let json = r#"{"hosts":{"github.com":[{"state":"error","active":true,"login":"me"}]}}"#;
        let s = summarize(&parse_auth_status(json).unwrap());
        assert_eq!(s.login, None);
        assert!(s.problem.unwrap().contains("gh auth login"));
    }

    #[test]
    fn non_json_output_is_an_error() {
        assert!(parse_auth_status("unknown flag: --json").is_err());
    }
}
