//! Locate a coding-agent CLI binary (claude, codex, ...). Trimmed from the
//! previous project to just the discovery path — PTY mode never needs
//! `--help` capability probing.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::platform::ports::ToolLocator;
use crate::platform::Os;

fn first_existing(candidates: Vec<PathBuf>) -> Option<String> {
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().to_string())
}

fn find_in_path<L: ToolLocator>(path_value: &str, name: &str) -> Option<String> {
    let names = L::executable_names(name);
    first_existing(
        std::env::split_paths(path_value)
            .flat_map(|dir| names.iter().map(move |n| dir.join(n)).collect::<Vec<_>>())
            .collect(),
    )
}

fn find_with<L: ToolLocator>(
    name: &str,
    env_map: Option<&HashMap<String, String>>,
    home: &Path,
) -> Option<String> {
    first_existing(L::user_tool_paths(home, name))
        .or_else(|| {
            env_map
                .and_then(|map| map.get("PATH"))
                .and_then(|p| find_in_path::<L>(p, name))
        })
        .or_else(|| {
            std::env::var("PATH")
                .ok()
                .and_then(|p| find_in_path::<L>(&p, name))
        })
        .or_else(|| first_existing(L::system_tool_paths(name)))
}

/// Find a CLI binary by name, preferring the user's local install, then the
/// supplied/process `PATH`, then common system locations. `env_map` is the
/// effective CLI environment so we resolve the same binary the user would.
pub fn find_cli_with_env(name: &str, env_map: Option<&HashMap<String, String>>) -> Option<String> {
    let home = env_map
        .and_then(|map| map.get("HOME").map(PathBuf::from))
        .or_else(dirs::home_dir)
        .unwrap_or_default();
    find_with::<Os>(name, env_map, &home)
}

/// A `Command` for a helper CLI (`gh`, …) at its resolved absolute path.
///
/// Spawning a bare name searches the *process* `PATH`, and a macOS app opened
/// from Finder or the Dock gets a minimal one (`/usr/bin:/bin:/usr/sbin:/sbin`)
/// — no Homebrew. So a bare `gh` works under `tauri dev` (launched from a shell)
/// and fails in the shipped app with "No such file or directory". Windows also
/// only finds `.exe` files by bare name, which misses npm's `.cmd`s.
/// Falls back to the bare name, so a missing tool still reports as missing.
pub fn command(name: &str) -> std::process::Command {
    crate::platform::process::command(
        find_cli_with_env(name, None).unwrap_or_else(|| name.to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A fake OS, so the search order is tested without touching the real one.
    struct FakeOs;

    impl ToolLocator for FakeOs {
        fn executable_names(name: &str) -> Vec<String> {
            vec![format!("{name}.fake")]
        }
        fn user_tool_paths(home: &Path, name: &str) -> Vec<PathBuf> {
            vec![home.join("user").join(format!("{name}.fake"))]
        }
        fn system_tool_paths(name: &str) -> Vec<PathBuf> {
            vec![PathBuf::from(format!("/no/such/system/{name}.fake"))]
        }
        fn project_wrapper(dir: &Path, name: &str) -> PathBuf {
            dir.join(name)
        }
        fn pty_invocation(tool: &str) -> Vec<String> {
            vec![tool.to_string()]
        }
    }

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "").unwrap();
    }

    #[test]
    fn user_installs_beat_path_and_only_executable_names_match() {
        let home = std::env::temp_dir().join(format!("trace-find-{}", crate::helpers::new_id()));
        let on_path = home.join("onpath");
        // The bare name, like npm's Unix script on Windows, is not an executable here.
        touch(&on_path.join("tool"));
        let env: HashMap<String, String> =
            [("PATH".to_string(), on_path.to_string_lossy().to_string())].into();
        assert_eq!(find_with::<FakeOs>("tool", Some(&env), &home), None);

        touch(&on_path.join("tool.fake"));
        let found = find_with::<FakeOs>("tool", Some(&env), &home).unwrap();
        assert!(found.contains("onpath"));

        touch(&home.join("user/tool.fake"));
        let found = find_with::<FakeOs>("tool", Some(&env), &home).unwrap();
        assert!(found.contains("user"));
        fs::remove_dir_all(&home).unwrap();
    }
}
