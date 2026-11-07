use super::*;

const SECRET: &str = "ghp_SECRETTOKEN0123456789";

fn git() -> Command {
    crate::claude::discovery::command("git")
}

fn remote(owner: &str, name: &str) -> RemoteRepo {
    RemoteRepo {
        host: "github.com".into(),
        owner: owner.into(),
        name: name.into(),
    }
}

fn with_token(dest: PathBuf) -> RepoCheckout {
    let mut c = RepoCheckout::new(remote("o", "r"), dest);
    c.token = Token::new(SECRET);
    c
}

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("trace-checkout-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn the_token_is_never_in_the_args_or_url() {
    let mut c = with_token(PathBuf::from("dest"));
    c.branch = Some("feat/x".into());
    let cmd = c.clone_command(git()).unwrap();
    let b64 = c.token.as_ref().unwrap().forms()[1].clone();
    let args: Vec<String> = cmd
        .get_args()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    assert_eq!(
        args[args.len() - 6..],
        [
            "clone",
            "--branch",
            "feat/x",
            "--",
            "https://github.com/o/r.git",
            "dest"
        ]
    );
    for a in &args {
        assert!(!a.contains(SECRET) && !a.contains(&b64), "{a}");
    }
    assert!(!c.url().contains(SECRET));
    // It's only in the env, as a header scoped to github.com.
    let envs: HashMap<String, String> = cmd
        .get_envs()
        .filter_map(|(k, v)| Some((k.to_string_lossy().into(), v?.to_string_lossy().into())))
        .collect();
    let n: usize = envs["GIT_CONFIG_COUNT"].parse().unwrap();
    let (k0, k1) = (n - 2, n - 1);
    assert_eq!(
        envs[&format!("GIT_CONFIG_KEY_{k0}")],
        "http.https://github.com/.extraHeader"
    );
    assert_eq!(
        envs[&format!("GIT_CONFIG_VALUE_{k0}")],
        format!("Authorization: Basic {b64}")
    );
    assert_eq!(envs[&format!("GIT_CONFIG_KEY_{k1}")], "credential.helper");
    assert_eq!(envs["GIT_TERMINAL_PROMPT"], "0");
    assert!(!format!("{c:?}").contains(SECRET), "Debug is redacted");
}

#[test]
fn without_a_token_no_header_is_configured() {
    let c = RepoCheckout::new(remote("o", "r"), PathBuf::from("d"));
    let cmd = c.clone_command(git()).unwrap();
    assert!(!cmd
        .get_envs()
        .any(|(_, v)| v.is_some_and(|v| v.to_string_lossy().contains("Authorization"))));
}

/// Config the platform already put on git (Windows' `core.longpaths`) is kept,
/// and the token's entries go after it.
#[test]
fn existing_git_config_entries_are_kept() {
    let mut base = git();
    base.env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "core.longpaths")
        .env("GIT_CONFIG_VALUE_0", "true");
    let cmd = with_token(PathBuf::from("d")).clone_command(base).unwrap();
    let env = |k: &str| {
        cmd.get_envs()
            .find(|(n, _)| *n == k)
            .and_then(|(_, v)| v)
            .map(|v| v.to_string_lossy().into_owned())
    };
    assert_eq!(env("GIT_CONFIG_COUNT").as_deref(), Some("3"));
    assert_eq!(env("GIT_CONFIG_KEY_0").as_deref(), Some("core.longpaths"));
    assert_eq!(
        env("GIT_CONFIG_KEY_1").as_deref(),
        Some("http.https://github.com/.extraHeader")
    );
    assert_eq!(
        env("GIT_CONFIG_KEY_2").as_deref(),
        Some("credential.helper")
    );
}

#[test]
fn branch_names_are_checked() {
    for good in ["main", "feat/x-1", "release/2.0"] {
        assert!(is_branch_name(good), "{good}");
    }
    for bad in ["", "-b", "--upload-pack=x", "a..b", "a b", "a:b", "a\nb"] {
        assert!(!is_branch_name(bad), "{bad:?}");
        let mut c = RepoCheckout::new(remote("o", "r"), PathBuf::from("d"));
        c.branch = Some(bad.into());
        assert!(c.clone_command(git()).is_err());
    }
}

fn run_git(dir: &std::path::Path, args: &[&str]) {
    let out = git()
        .args(["-c", "user.email=t@example.com", "-c", "user.name=t"])
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// A bare repo at `<root>/o/r.git` with `main` and `feat`, served as `file://`.
fn local_origin(root: &std::path::Path) -> String {
    let bare = root.join("o").join("r.git");
    std::fs::create_dir_all(&bare).unwrap();
    run_git(&bare, &["init", "--bare", "-q"]);
    let work = root.join("work");
    std::fs::create_dir_all(&work).unwrap();
    run_git(&work, &["init", "-q", "-b", "main"]);
    std::fs::write(work.join("a.txt"), "a").unwrap();
    run_git(&work, &["add", "."]);
    run_git(&work, &["commit", "-qm", "a"]);
    run_git(&work, &["branch", "feat"]);
    let bare_s = bare.to_string_lossy().replace('\\', "/");
    run_git(&work, &["push", "-q", &bare_s, "main", "feat"]);
    let root_s = root.to_string_lossy().replace('\\', "/");
    format!("file:///{}", root_s.trim_start_matches('/'))
}

#[test]
fn clones_a_branch_runs_setup_and_keeps_the_token_out_of_git_config() {
    let root = scratch("ok");
    let mut c = with_token(root.join("out").join("r"));
    c.base = local_origin(&root);
    c.branch = Some("feat".into());
    c.setup.commands = vec!["git rev-parse --abbrev-ref HEAD > setup.txt".into()];
    let env: HashMap<String, String> = std::env::vars().collect();
    c.run(git, &env).unwrap();
    let head = std::fs::read_to_string(c.dest.join("setup.txt")).unwrap();
    assert_eq!(
        head.trim(),
        "feat",
        "setup ran in the checkout, on the branch"
    );
    let config = std::fs::read_to_string(c.dest.join(".git").join("config")).unwrap();
    let b64 = c.token.as_ref().unwrap().forms()[1].clone();
    assert!(
        !config.contains(SECRET) && !config.contains(&b64),
        "{config}"
    );
    assert!(!config.to_lowercase().contains("extraheader"), "{config}");
    assert!(config.contains(&c.url()), "origin is the plain URL");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn errors_are_redacted_and_existing_folders_refused() {
    let root = scratch("fail");
    let mut c = with_token(root.join("missing"));
    c.base = format!("file:///{SECRET}-nowhere");
    let err = c.run(git, &HashMap::new()).unwrap_err();
    assert!(err.starts_with("Cloning o/r failed"), "{err}");
    assert!(!err.contains(SECRET), "{err}");
    let taken = with_token(root.clone());
    assert!(taken
        .run(git, &HashMap::new())
        .unwrap_err()
        .contains("already exists"));
    let _ = std::fs::remove_dir_all(&root);
}
