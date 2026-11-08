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
}
