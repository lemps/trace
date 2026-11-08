use super::*;

fn remote() -> RemoteRepo {
    RemoteRepo {
        host: "github.com".into(),
        owner: "noble1911".into(),
        name: "trace".into(),
    }
}

#[test]
fn the_token_is_only_in_the_clone_env() {
    let token = Token::new("ghp_secret123").expect("a token");
    let argv = clone_argv(&remote(), "/vercel/trace");
    assert_eq!(
        argv,
        [
            "git",
            "clone",
            "--",
            "https://github.com/noble1911/trace.git",
            "/vercel/trace"
        ]
    );
    assert!(argv.iter().all(|a| !a.contains("secret")));
    let env = clone_env(Some(&token));
    assert_eq!(env["GIT_CONFIG_COUNT"], "2");
    assert_eq!(
        env["GIT_CONFIG_KEY_0"],
        "http.https://github.com/.extraHeader"
    );
    assert!(env["GIT_CONFIG_VALUE_0"].starts_with("Authorization: Basic "));
    assert_eq!(env["GIT_CONFIG_KEY_1"], "credential.helper");
    assert_eq!(env["GIT_TERMINAL_PROMPT"], "0");
}

#[test]
fn a_public_clone_has_no_header() {
    let env = clone_env(None);
    assert!(!env.contains_key("GIT_CONFIG_COUNT"));
}

#[test]
fn file_content_is_an_argument_not_script() {
    let argv = write_home_file_argv(".tmux.conf", "it's \"quoted\" $HOME");
    assert_eq!(argv[0], "bash");
    assert_eq!(argv[4], "it's \"quoted\" $HOME");
    assert_eq!(argv[5], ".tmux.conf");
    assert!(!argv[2].contains("quoted"));
}

#[test]
fn claude_json_trusts_the_repo_and_approves_only_a_key() {
    let plain: serde_json::Value =
        serde_json::from_str(&claude_json("/vercel/trace", None)).expect("json");
    assert_eq!(plain["hasCompletedOnboarding"], true);
    assert_eq!(
        plain["projects"]["/vercel/trace"]["hasTrustDialogAccepted"],
        true
    );
    assert!(plain.get("customApiKeyResponses").is_none());
    let keyed: serde_json::Value =
        serde_json::from_str(&claude_json("/vercel/trace", Some("abc"))).expect("json");
    assert_eq!(keyed["customApiKeyResponses"]["approved"][0], "abc");
}

#[test]
fn the_agent_starts_in_tmux_with_its_prompt_last() {
    let agent = claude_argv(
        Some("opus"),
        &["--dangerously-skip-permissions".to_string()],
        Some("fix the bug; then test"),
        false,
    );
    let argv = tmux_start_argv("/vercel/trace", 120, 40, &agent);
    assert_eq!(&argv[..5], ["tmux", "new-session", "-d", "-s", "trace"]);
    assert!(argv.windows(2).any(|w| w == ["-x", "120"]));
    assert!(argv.windows(2).any(|w| w == ["-c", "/vercel/trace"]));
    assert_eq!(
        argv.last().map(String::as_str),
        Some("fix the bug; then test")
    );
    assert!(argv.windows(2).any(|w| w == ["--model", "opus"]));
}

#[test]
fn label_values_are_tidied_and_capped() {
    assert_eq!(label_value("Fix   the\nlogin bug!"), "Fix the login bug");
    assert_eq!(label_value("noble1911/trace"), "noble1911/trace");
    assert_eq!(label_value(&"x".repeat(300)).len(), 200);
}

#[test]
fn a_pushed_branch_is_picked_up_not_recreated() {
    let argv = branch_argv("/vercel/trace", "workspace/abc");
    assert_eq!(argv[0], "bash");
    // The branch and folder are arguments, never spliced into the script.
    assert!(!argv[2].contains("workspace/abc"));
    assert!(argv[2].contains("refs/remotes/origin/$2"));
    assert!(argv[2].contains("--track"));
    assert_eq!(&argv[4..], ["/vercel/trace", "workspace/abc"]);
}

#[test]
fn a_restarted_session_continues_its_conversation() {
    let argv = claude_argv(None, &[], None, true);
    assert_eq!(argv, ["claude", "--continue"]);
    assert!(!claude_argv(None, &[], None, false).contains(&"--continue".to_string()));
}
