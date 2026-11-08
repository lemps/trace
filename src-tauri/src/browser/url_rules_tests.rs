use super::*;

fn ok(raw: &str) -> Reach {
    check(raw, &[])
        .map(|(_, r)| r)
        .unwrap_or_else(|e| panic!("{raw}: {e}"))
}

fn refused(raw: &str) -> String {
    match check(raw, &[]) {
        Ok(_) => panic!("{raw} should be refused"),
        Err(e) => e,
    }
}

#[test]
fn loopback_hosts_open_quietly() {
    assert_eq!(ok("http://localhost:5173"), Reach::Loopback);
    assert_eq!(ok("http://LOCALHOST:5173/x"), Reach::Loopback);
    assert_eq!(ok("http://127.0.0.1:8080/"), Reach::Loopback);
    assert_eq!(ok("http://127.4.5.6/"), Reach::Loopback);
    assert_eq!(ok("http://[::1]:3000/"), Reach::Loopback);
    assert_eq!(ok("http://[::ffff:127.0.0.1]/"), Reach::Loopback);
    assert_eq!(ok("http://app.localhost:3000/"), Reach::Loopback);
    assert_eq!(ok("https://localhost/"), Reach::Loopback);
}

#[test]
fn other_hosts_are_external() {
    assert_eq!(ok("https://example.com"), Reach::External);
    assert_eq!(ok("http://192.168.1.10:8000/"), Reach::External);
    assert_eq!(ok("http://10.0.0.1/"), Reach::External);
    // Look-alikes of localhost aren't loopback.
    assert_eq!(ok("http://localhost.evil.com/"), Reach::External);
    assert_eq!(ok("http://127.0.0.1.nip.io/"), Reach::External);
}

#[test]
fn only_http_and_https() {
    for raw in [
        "file:///C:/Windows/win.ini",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "blob:http://localhost/abc",
        "ftp://example.com/",
        "vscode://file/x",
        "about:blank",
        "trace-img://localhost/x",
        "tauri://localhost/",
    ] {
        let why = refused(raw);
        assert!(why.contains("only opens http and https"), "{raw}: {why}");
    }
}

#[test]
fn not_a_url() {
    assert!(refused("").contains("Give a URL"));
    assert!(refused("localhost:5173").contains("only opens http"));
    assert!(refused("example.com/page").contains("isn't a full URL"));
}

#[test]
fn trace_own_origins_are_refused() {
    for raw in [
        "http://tauri.localhost/",
        "https://tauri.localhost/index.html",
        "http://ipc.localhost/plugin%3Aevent%7Clisten",
        "http://asset.localhost/C:/x.png",
        "http://trace-img.localhost/a/b/c",
        "http://x.tauri.localhost/",
    ] {
        assert!(refused(raw).contains("trace's own"), "{raw}");
    }
    let dev = Url::parse("http://localhost:1420").unwrap();
    assert!(check("http://localhost:1420/#/board", &[dev.clone()]).is_err());
    assert!(check("http://localhost:1421/", &[dev]).is_ok());
}

#[test]
fn credentials_are_refused() {
    assert!(refused("https://user:pw@example.com/").contains("user name"));
    assert!(refused("http://user@localhost:3000/").contains("user name"));
}

#[test]
fn host_label() {
    let u = Url::parse("http://localhost:5173/a").unwrap();
    assert_eq!(display_host(&u), "localhost:5173");
    let u = Url::parse("https://example.com/a").unwrap();
    assert_eq!(display_host(&u), "example.com");
}
