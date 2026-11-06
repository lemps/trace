//! A first guess at a repo's worktree setup, from the files at its root. Offered
//! after a clone for the user to edit — never run without them saving it.

use std::path::Path;

use super::model::SetupConfig;

/// Lockfile → the install command for it. First match per ecosystem wins, so a
/// repo with both `pnpm-lock.yaml` and a stale `package-lock.json` gets pnpm.
const INSTALLERS: &[(&str, &[(&str, &str)])] = &[
    (
        "node",
        &[
            ("pnpm-lock.yaml", "pnpm install --frozen-lockfile"),
            ("yarn.lock", "yarn install --frozen-lockfile"),
            ("bun.lockb", "bun install"),
            ("bun.lock", "bun install"),
            ("package-lock.json", "npm ci"),
            ("package.json", "npm install"),
        ],
    ),
    (
        "python",
        &[("uv.lock", "uv sync"), ("poetry.lock", "poetry install")],
    ),
    ("ruby", &[("Gemfile.lock", "bundle install")]),
    ("rust", &[("Cargo.lock", "cargo fetch")]),
    ("go", &[("go.sum", "go mod download")]),
];

/// Untracked files a worktree usually needs, offered when the repo ships a
/// template for them (so `.env.example` → copy `.env`).
const ENV_TEMPLATES: &[(&str, &str)] = &[
    (".env.example", ".env"),
    (".env.sample", ".env"),
    (".env.template", ".env"),
    (".env.local.example", ".env.local"),
];

/// The setup to suggest for a repo whose root holds `names`.
pub fn from_root_names(names: &[String]) -> SetupConfig {
    let has = |n: &str| names.iter().any(|x| x == n);
    let commands = INSTALLERS
        .iter()
        .filter_map(|(_, options)| options.iter().find(|(file, _)| has(file)))
        .map(|(_, cmd)| cmd.to_string())
        .collect();
    let mut copy_files: Vec<String> = Vec::new();
    for (template, target) in ENV_TEMPLATES {
        if has(template) && !copy_files.iter().any(|c| c == target) {
            copy_files.push(target.to_string());
        }
    }
    SetupConfig {
        copy_files,
        commands,
    }
}

/// [`from_root_names`] for the checkout at `dir`; empty if it can't be read.
pub fn for_dir(dir: &Path) -> SetupConfig {
    let names: Vec<String> = std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(Result::ok)
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    from_root_names(&names)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn picks_the_lockfile_installer_per_ecosystem() {
        let s = from_root_names(&names(&[
            "package.json",
            "package-lock.json",
            "Cargo.toml",
            "Cargo.lock",
            "README.md",
        ]));
        assert_eq!(s.commands, vec!["npm ci", "cargo fetch"]);
        let s = from_root_names(&names(&[
            "package.json",
            "pnpm-lock.yaml",
            "package-lock.json",
        ]));
        assert_eq!(s.commands, vec!["pnpm install --frozen-lockfile"]);
        let s = from_root_names(&names(&["package.json"]));
        assert_eq!(s.commands, vec!["npm install"]);
    }

    #[test]
    fn env_templates_suggest_copying_the_real_file_once() {
        let s = from_root_names(&names(&[
            ".env.example",
            ".env.sample",
            ".env.local.example",
        ]));
        assert_eq!(s.copy_files, vec![".env", ".env.local"]);
    }

    #[test]
    fn a_bare_repo_suggests_nothing() {
        assert!(from_root_names(&names(&["README.md", "LICENSE"])).is_empty());
    }
}
