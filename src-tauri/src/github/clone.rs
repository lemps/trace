//! Checking a GitHub repo out for agents: `gh repo clone` into the clone folder,
//! then everything trace needs to know about it (default branch, a suggested
//! worktree setup). Adding it to `repos.json` is the caller's job.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;

use super::repo_list::is_login;
use crate::repo_catalog::model::{RemoteRepo, SetupConfig};
use crate::repo_catalog::{origin_of, suggest};

/// A finished checkout.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Cloned {
    pub path: String,
    pub remote: RemoteRepo,
    pub default_branch: String,
    /// The setup to offer: the one saved for this repo before, else a guess.
    pub suggested_setup: SetupConfig,
    /// The folder already held this repo, so nothing was cloned.
    pub already_present: bool,
}

/// `owner/name` → its parts, refusing anything that isn't a plain GitHub repo
/// name (so it can't read as a flag or a path on the command line).
pub fn parse_full_name(full_name: &str) -> Result<RemoteRepo, String> {
    let bad = || format!("{full_name} isn't a GitHub repository name (owner/name).");
    let (owner, name) = full_name.split_once('/').ok_or_else(bad)?;
    let name_ok = !name.is_empty()
        && name.len() <= 100
        && name != "."
        && name != ".."
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if !is_login(owner) || !name_ok {
        return Err(bad());
    }
    Ok(RemoteRepo {
        host: "github.com".into(),
        owner: owner.into(),
        name: name.into(),
    })
}

/// Where `repo` goes under `root`: `<root>/<name>`.
pub fn destination(root: &str, repo: &RemoteRepo) -> PathBuf {
    Path::new(root).join(&repo.name)
}

/// Clone `full_name` into `root`. A folder that is already a checkout of the
/// same repo is adopted as is; any other existing folder is an error, never
/// overwritten.
pub fn clone_into(
    full_name: &str,
    root: &str,
    saved: Option<SetupConfig>,
) -> Result<Cloned, String> {
    let remote = parse_full_name(full_name)?;
    if root.trim().is_empty() {
        return Err("Choose a folder to clone into.".into());
    }
    let dest = destination(root, &remote);
    let path = dest.to_string_lossy().into_owned();
    let already_present = dest.exists();
    if already_present {
        let same =
            crate::git::is_git_repo(&path) && origin_of(&path).is_some_and(|o| o.same_as(&remote));
        if !same {
            return Err(format!(
                "{path} already exists and isn't a checkout of {full_name}. Choose another clone folder, or move it."
            ));
        }
    } else {
        std::fs::create_dir_all(root).map_err(|e| format!("Couldn't create {root}: {e}"))?;
        run_clone(full_name, &dest)?;
    }
    Ok(Cloned {
        default_branch: crate::git::get_default_branch(&path),
        suggested_setup: saved
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| suggest::for_dir(&dest)),
        path,
        remote,
        already_present,
    })
}

/// `gh repo clone`, which uses the protocol (ssh/https) the user chose in `gh`.
/// Nothing can answer a prompt, so git is told not to ask.
fn run_clone(full_name: &str, dest: &Path) -> Result<(), String> {
    let out = crate::claude::discovery::command("gh")
        .args(["repo", "clone", full_name])
        .arg(dest)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Couldn't run gh: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if err.is_empty() {
        format!("Cloning {full_name} failed.")
    } else {
        format!("Cloning {full_name} failed: {err}")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_names_are_owner_slash_plain_name() {
        let r = parse_full_name("noble1911/trace.rs-v2_x").unwrap();
        assert_eq!(
            (r.owner.as_str(), r.name.as_str()),
            ("noble1911", "trace.rs-v2_x")
        );
        for bad in [
            "trace",
            "a/b/c",
            "-o/x",
            "o/..",
            "o/",
            "/x",
            "o/a b",
            "o/--depth=1",
            r"o/a\b",
        ] {
            assert!(parse_full_name(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn destination_is_the_repo_name_under_the_root() {
        let r = parse_full_name("o/trace").unwrap();
        assert_eq!(
            destination("/home/me/src", &r),
            Path::new("/home/me/src").join("trace")
        );
    }

    /// Network + a signed-in `gh`: `cargo test -- --ignored clones_a_real_repo`.
    #[test]
    #[ignore]
    fn clones_a_real_repo_then_adopts_it_the_second_time() {
        let root = std::env::temp_dir().join(format!("trace-clone-real-{}", std::process::id()));
        let root_s = root.to_string_lossy().into_owned();
        let first = clone_into("octocat/Hello-World", &root_s, None).unwrap();
        assert!(!first.already_present);
        assert!(Path::new(&first.path).join(".git").exists());
        assert_eq!(first.default_branch, "master");
        let again = clone_into("octocat/hello-world", &root_s, None).unwrap();
        assert!(again.already_present, "the existing checkout is adopted");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn an_unrelated_existing_folder_is_never_overwritten() {
        let root = std::env::temp_dir().join(format!("trace-clone-{}", std::process::id()));
        std::fs::create_dir_all(root.join("trace")).unwrap();
        std::fs::write(root.join("trace").join("mine.txt"), "keep").unwrap();
        let err = clone_into("o/trace", &root.to_string_lossy(), None).unwrap_err();
        assert!(err.contains("already exists"), "{err}");
        assert!(root.join("trace").join("mine.txt").is_file());
        let _ = std::fs::remove_dir_all(&root);
    }
}
