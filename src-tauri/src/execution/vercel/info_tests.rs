use super::*;

#[test]
fn a_listed_sandbox_reads_its_tags_and_session() {
    let v = json!({
        "name": "trace-abc", "status": "running", "currentSessionId": "sbx_1",
        "createdAt": 1794139313082u64, "tags": { "trace": "session", "trace.ws": "abc" }
    });
    let i = info(&v, None);
    assert!(i.is_running());
    assert_eq!(i.session_id.as_deref(), Some("sbx_1"));
    assert_eq!(i.labels.get("trace.ws").map(String::as_str), Some("abc"));
}

#[test]
fn a_created_sandbox_prefers_its_new_session() {
    let i = info(
        &json!({ "currentSessionId": "old" }),
        Some(&json!({ "id": "new" })),
    );
    assert_eq!(i.session_id.as_deref(), Some("new"));
}

#[test]
fn a_running_sandbox_says_when_it_stops() {
    let i = info(
        &json!({ "status": "running", "currentSnapshotId": "snap_old" }),
        Some(&json!({ "status": "running", "startedAt": 1_000u64, "timeout": 2_700_000u64 })),
    );
    assert_eq!(i.stops_at, Some(2_701_000));
    assert_eq!(
        i.saved_until, None,
        "a running sandbox's snapshot isn't the save"
    );
    // A list has no session, so no stop time.
    assert_eq!(info(&json!({ "status": "running" }), None).stops_at, None);
}

#[test]
fn a_stopped_sandbox_says_until_when_its_snapshot_is_kept() {
    let stopped = json!({
        "status": "stopped", "currentSnapshotId": "snap_1",
        "statusUpdatedAt": 5_000u64, "snapshotExpiration": 604_800_000u64,
    });
    let i = info(
        &stopped,
        Some(&json!({ "status": "stopped", "timeout": 1u64 })),
    );
    assert!(i.saved);
    assert_eq!(i.stops_at, None);
    assert_eq!(i.saved_until, Some(604_805_000));
    let unsaved = info(&json!({ "status": "stopped" }), None);
    assert!(!unsaved.saved);
    assert_eq!(unsaved.saved_until, None);
}

#[test]
fn routes_become_previews_by_port_and_odd_subdomains_are_dropped() {
    let routes = json!([
        { "port": 5173, "subdomain": "sb-b", "url": "x" },
        { "port": 3000, "subdomain": "sb-a", "url": "x" },
        { "port": 8080, "subdomain": "evil.example/", "url": "x" },
    ]);
    let p = previews(&routes);
    assert_eq!(
        p,
        vec![
            Preview {
                port: 3000,
                url: "https://sb-a.vercel.run".into()
            },
            Preview {
                port: 5173,
                url: "https://sb-b.vercel.run".into()
            },
        ]
    );
}
