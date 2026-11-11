//! The setup list's Install button: put a missing CLI on this computer for the
//! user, without an admin password, a package manager or a terminal. Claude Code
//! comes from Anthropic's own installer; `gh` from GitHub's release archive,
//! checked against the SHA-256 GitHub publishes beside it. Both land in
//! `~/.local/bin`, the first place tool discovery looks, so the next check finds
//! them even when trace was opened from the Dock.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use sha2::{Digest, Sha256};

use super::wait_within;
use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::build_effective_cli_env;
use crate::platform::install_hints::{can_install, gh_archive_on, Tool, CLAUDE_INSTALL_LINE};
use crate::platform::ports::AgentEnvironment;
use crate::platform::Os;

/// Claude Code's installer downloads a ~200 MB binary; allow for a slow line.
const CLAUDE_LIMIT: Duration = Duration::from_secs(600);

/// Any one request to GitHub, archive included (~15 MB).
const HTTP_LIMIT: Duration = Duration::from_secs(300);

/// Unpacking the one file we need from the archive.
const TAR_LIMIT: Duration = Duration::from_secs(60);

const GH_LATEST: &str = "https://api.github.com/repos/cli/cli/releases/latest";

/// Install `tool` for this user. Blocking (minutes at worst): call it off the
/// main thread. Ok once the tool is where discovery will find it.
pub fn install(tool: Tool) -> Result<(), String> {
    if !can_install(tool) {
        return Err("trace can't install this on your computer. Follow the hint instead.".into());
    }
    match tool {
        Tool::Claude => install_claude(),
        Tool::Gh => {
            let home = dirs::home_dir().ok_or("Couldn't find your home folder.")?;
            install_gh(&home.join(".local/bin"))
        }
        Tool::Git | Tool::Codex => Err("trace doesn't install this one.".into()),
    }
}

/// Run Anthropic's installer in the env agents get, with its output in a temp
/// file (it can outgrow a pipe nobody reads until exit), and quote its last
/// lines if it fails.
fn install_claude() -> Result<(), String> {
    let env = build_effective_cli_env(&HashMap::new());
    let log = tempfile::NamedTempFile::new().map_err(|e| format!("Couldn't start: {e}"))?;
    let out = log.reopen().map_err(|e| format!("Couldn't start: {e}"))?;
    let err = log.reopen().map_err(|e| format!("Couldn't start: {e}"))?;
    let mut cmd = Os::shell_line(CLAUDE_INSTALL_LINE);
    cmd.env_clear()
        .envs(&env)
        .stdin(Stdio::null())
        .stdout(out)
        .stderr(err);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Couldn't start Claude Code's installer: {e}"))?;
    let status = wait_within(&mut child, CLAUDE_LIMIT, "Claude Code's installer")?;
    if !status.success() {
        let output = fs::read_to_string(log.path()).unwrap_or_default();
        return Err(format!(
            "Claude Code's installer stopped with an error. {}",
            last_lines(&output, 3)
        ));
    }
    find_cli_with_env("claude", Some(&env))
        .map(|_| ())
        .ok_or_else(|| "The installer finished, but trace still can't find claude.".to_string())
}

/// Download this OS's `gh` archive from the latest cli/cli release, check it
/// against the release's checksums file, and copy its `bin/gh` into
/// `bin_dir` (`~/.local/bin`).
fn install_gh(bin_dir: &Path) -> Result<(), String> {
    let http = reqwest::blocking::Client::builder()
        .user_agent("trace")
        .timeout(HTTP_LIMIT)
        .build()
        .map_err(|e| format!("Couldn't reach GitHub: {e}"))?;
    let release: serde_json::Value = fetch(&http, GH_LATEST)?
        .json()
        .map_err(|e| format!("GitHub's release list didn't make sense: {e}"))?;
    let tag = release
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .ok_or("GitHub didn't say which release is latest.")?;
    let version = tag.trim_start_matches('v');
    let archive = gh_archive_on(version, std::env::consts::OS, std::env::consts::ARCH)
        .ok_or("GitHub doesn't publish the GitHub CLI for this computer.")?;
    let base = format!("https://github.com/cli/cli/releases/download/{tag}");

    let sums = fetch(&http, &format!("{base}/gh_{version}_checksums.txt"))?
        .text()
        .map_err(|e| format!("Couldn't read the checksums: {e}"))?;
    let expected = checksum_for(&sums, &archive).ok_or("The release doesn't list a checksum.")?;
    let mut bytes = Vec::new();
    fetch(&http, &format!("{base}/{archive}"))?
        .read_to_end(&mut bytes)
        .map_err(|e| format!("The download was cut off: {e}"))?;
    if sha256_hex(&bytes) != expected {
        return Err(
            "The download didn't match GitHub's checksum, so trace didn't install it.".into(),
        );
    }

    let dir = tempfile::tempdir().map_err(|e| format!("Couldn't unpack: {e}"))?;
    let gh = unpack_gh(dir.path(), &archive, &bytes)?;
    place(&gh, bin_dir, "gh")
}

/// GET `url`, failing on any non-2xx with a plain message.
fn fetch(
    http: &reqwest::blocking::Client,
    url: &str,
) -> Result<reqwest::blocking::Response, String> {
    http.get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|e| format!("Couldn't download the GitHub CLI: {e}"))
}

/// Write `bytes` as `archive` in `dir` and extract just `<stem>/bin/gh` with the
/// system `tar` (bsdtar on macOS reads zips too), which keeps its exec bit.
fn unpack_gh(dir: &Path, archive: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let file = dir.join(archive);
    fs::write(&file, bytes).map_err(|e| format!("Couldn't save the download: {e}"))?;
    let member = format!("{}/bin/gh", archive_stem(archive));
    let mut tar = crate::platform::process::command("tar");
    tar.arg("-xf")
        .arg(&file)
        .arg("-C")
        .arg(dir)
        .arg(&member)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = tar
        .spawn()
        .map_err(|e| format!("Couldn't unpack the GitHub CLI: {e}"))?;
    let status = wait_within(&mut child, TAR_LIMIT, "tar")?;
    let gh = dir.join(member);
    if !status.success() || !gh.is_file() {
        return Err("Couldn't unpack the GitHub CLI.".into());
    }
    Ok(gh)
}

/// Copy `src` into `bin_dir` as `name`, through a temp name and a rename so a
/// `gh` that's running is never half-written. `fs::copy` keeps the exec bit.
fn place(src: &Path, bin_dir: &Path, name: &str) -> Result<(), String> {
    fs::create_dir_all(bin_dir)
        .map_err(|e| format!("Couldn't create {}: {e}", bin_dir.display()))?;
    let staged = bin_dir.join(format!(".{name}.trace-install"));
    let dest = bin_dir.join(name);
    fs::copy(src, &staged)
        .and_then(|_| fs::rename(&staged, &dest))
        .map_err(|e| {
            let _ = fs::remove_file(&staged);
            format!("Couldn't put {name} in {}: {e}", bin_dir.display())
        })
}

/// `gh_2.1.0_macOS_arm64.zip` → `gh_2.1.0_macOS_arm64`, the folder inside it.
fn archive_stem(archive: &str) -> &str {
    archive
        .strip_suffix(".tar.gz")
        .or_else(|| archive.strip_suffix(".zip"))
        .unwrap_or(archive)
}

/// The SHA-256 a `sha256sum`-style file (`<hex>  <name>` per line) gives `name`.
fn checksum_for(sums: &str, name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hex, file) = line.split_once(char::is_whitespace)?;
        (file.trim().trim_start_matches('*') == name).then(|| hex.to_ascii_lowercase())
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Up to the last `n` non-empty lines of `output`, joined, for an error message.
fn last_lines(output: &str, n: usize) -> String {
    let lines: Vec<&str> = output
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    lines[lines.len().saturating_sub(n)..].join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_an_archives_checksum_by_exact_name() {
        let sums = "AAA111  gh_2.1.0_macOS_arm64.zip\nbbb222  gh_2.1.0_macOS_amd64.zip\n";
        assert_eq!(
            checksum_for(sums, "gh_2.1.0_macOS_arm64.zip").as_deref(),
            Some("aaa111")
        );
        assert_eq!(
            checksum_for(sums, "gh_2.1.0_macOS_amd64.zip").as_deref(),
            Some("bbb222")
        );
        assert_eq!(checksum_for(sums, "gh_2.1.0_macOS_arm64"), None);
        assert_eq!(checksum_for("ccc *a.zip", "a.zip").as_deref(), Some("ccc"));
    }

    #[test]
    fn hashes_like_sha256sum() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn strips_either_archive_suffix() {
        assert_eq!(archive_stem("gh_1_macOS_arm64.zip"), "gh_1_macOS_arm64");
        assert_eq!(archive_stem("gh_1_linux_amd64.tar.gz"), "gh_1_linux_amd64");
    }

    #[test]
    fn quotes_the_last_lines_of_a_failure() {
        assert_eq!(last_lines("a\n\nb\n  c  \nd\n", 3), "b c d");
        assert_eq!(last_lines("", 3), "");
    }

    #[test]
    fn places_a_file_and_replaces_an_older_one() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        let bin = dir.path().join("bin");
        fs::write(&src, b"new").unwrap();
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("gh"), b"old").unwrap();
        place(&src, &bin, "gh").unwrap();
        assert_eq!(fs::read(bin.join("gh")).unwrap(), b"new");
        assert!(!bin.join(".gh.trace-install").exists());
    }

    /// The real thing, from GitHub: `cargo test gh_install_live -- --ignored`.
    #[test]
    #[ignore]
    fn gh_install_live() {
        let dir = tempfile::tempdir().unwrap();
        install_gh(dir.path()).unwrap();
        let out = crate::platform::process::command(dir.path().join("gh"))
            .arg("--version")
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).starts_with("gh version"));
    }

    #[test]
    fn refuses_what_it_cant_install() {
        assert!(install(Tool::Git).is_err());
        assert!(install(Tool::Codex).is_err());
    }
}
