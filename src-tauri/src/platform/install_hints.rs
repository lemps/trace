//! How to install the CLIs trace needs, per operating system: the `fix` line on
//! a failed preflight check (`crate::preflight`). Pure, with the OS as a
//! parameter like `paths`, so a Mac tests the Windows and Linux wording.

/// The tools trace can ask the user to install.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    Git,
    Claude,
    Codex,
    Gh,
}

/// A short, plain instruction for installing `tool` on `os` (`std::env::consts::OS`
/// values: "macos", "linux", "windows"; anything else gets the Linux wording).
pub fn install_hint_on(tool: Tool, os: &str) -> &'static str {
    match (tool, os) {
        (Tool::Git, "macos") => "Install Git: run xcode-select --install, or brew install git.",
        (Tool::Git, "windows") => "Install Git for Windows: winget install Git.Git.",
        (Tool::Git, _) => "Install Git with your package manager, e.g. sudo apt install git.",
        (Tool::Claude, "windows") => {
            "Install Claude Code: in PowerShell run irm https://claude.ai/install.ps1 | iex, \
             then run claude once to sign in."
        }
        (Tool::Claude, _) => {
            "Install Claude Code: curl -fsSL https://claude.ai/install.sh | bash, \
             then run claude once to sign in."
        }
        (Tool::Codex, _) => "Optional. Install Codex: npm install -g @openai/codex.",
        (Tool::Gh, "macos") => "Install GitHub CLI: brew install gh, then gh auth login.",
        (Tool::Gh, "windows") => {
            "Install GitHub CLI: winget install GitHub.cli, then gh auth login."
        }
        (Tool::Gh, _) => {
            "Install GitHub CLI (cli.github.com, e.g. sudo apt install gh), then gh auth login."
        }
    }
}

/// [`install_hint_on`] for the OS this build runs on.
pub fn install_hint(tool: Tool) -> &'static str {
    install_hint_on(tool, std::env::consts::OS)
}

/// Whether trace can install `tool` itself on `os` (the setup list's Install
/// button). Only per-user installs that need no admin password or package
/// manager: Claude Code's own script, and GitHub's `gh` release archive, both
/// into `~/.local/bin`, which `ToolLocator::user_tool_paths` already searches.
/// Windows keeps its winget hints for now.
pub fn can_install_on(tool: Tool, os: &str) -> bool {
    matches!((tool, os), (Tool::Claude | Tool::Gh, "macos" | "linux"))
}

/// [`can_install_on`] for the OS this build runs on.
pub fn can_install(tool: Tool) -> bool {
    can_install_on(tool, std::env::consts::OS)
}

/// The line `sh -c` runs to install Claude Code: Anthropic's installer, which
/// puts `claude` in `~/.local/bin` without touching the system.
pub const CLAUDE_INSTALL_LINE: &str = "curl -fsSL https://claude.ai/install.sh | bash";

/// The `gh` release archive for `version` (no leading `v`) on `os`/`arch`
/// (`std::env::consts` values), as GitHub names it on cli/cli's releases.
/// Each holds `<archive stem>/bin/gh`. None where trace doesn't install it.
pub fn gh_archive_on(version: &str, os: &str, arch: &str) -> Option<String> {
    let arch = match arch {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        _ => return None,
    };
    match os {
        "macos" => Some(format!("gh_{version}_macOS_{arch}.zip")),
        "linux" => Some(format!("gh_{version}_linux_{arch}.tar.gz")),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_os_gets_its_own_package_manager() {
        assert!(install_hint_on(Tool::Gh, "macos").contains("brew install gh"));
        assert!(install_hint_on(Tool::Gh, "windows").contains("winget"));
        assert!(install_hint_on(Tool::Gh, "linux").contains("apt"));
        assert!(install_hint_on(Tool::Git, "windows").contains("Git.Git"));
        assert!(install_hint_on(Tool::Claude, "windows").contains("install.ps1"));
        assert!(install_hint_on(Tool::Claude, "macos").contains("install.sh"));
    }

    #[test]
    fn gh_hints_end_with_signing_in_and_unknown_oses_fall_back() {
        for os in ["macos", "linux", "windows", "freebsd"] {
            assert!(
                install_hint_on(Tool::Gh, os).contains("gh auth login"),
                "{os}"
            );
        }
        assert_eq!(
            install_hint_on(Tool::Git, "freebsd"),
            install_hint_on(Tool::Git, "linux")
        );
    }

    #[test]
    fn installs_claude_and_gh_on_macos_and_linux_only() {
        for os in ["macos", "linux"] {
            assert!(can_install_on(Tool::Claude, os) && can_install_on(Tool::Gh, os));
            assert!(!can_install_on(Tool::Git, os) && !can_install_on(Tool::Codex, os));
        }
        assert!(!can_install_on(Tool::Claude, "windows"));
        assert!(!can_install_on(Tool::Gh, "windows"));
    }

    #[test]
    fn gh_archives_are_named_as_github_releases_them() {
        assert_eq!(
            gh_archive_on("2.103.3", "macos", "aarch64").as_deref(),
            Some("gh_2.103.3_macOS_arm64.zip")
        );
        assert_eq!(
            gh_archive_on("2.103.3", "macos", "x86_64").as_deref(),
            Some("gh_2.103.3_macOS_amd64.zip")
        );
        assert_eq!(
            gh_archive_on("2.103.3", "linux", "aarch64").as_deref(),
            Some("gh_2.103.3_linux_arm64.tar.gz")
        );
        assert_eq!(gh_archive_on("2.103.3", "windows", "x86_64"), None);
        assert_eq!(gh_archive_on("2.103.3", "linux", "riscv64"), None);
    }
}
