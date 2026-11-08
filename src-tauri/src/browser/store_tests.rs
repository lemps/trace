use serde_json::json;

use super::*;

fn raw(pages: Vec<Value>, active: Option<&str>) -> RawFile {
    RawFile {
        pages,
        active: active.map(|a| Value::String(a.into())),
    }
}

fn page(id: &str, url: &str, at: i64) -> Value {
    json!({ "id": id, "title": "t", "url": url, "history": [url], "openedBy": "agent", "updatedAt": at })
}

#[test]
fn loading_drops_pages_the_tab_would_refuse() {
    let file = validate(raw(
        vec![
            page("a", "http://localhost:5173/", 1),
            page("b", "file:///C:/secret.txt", 2),
            page("c", "javascript:alert(1)", 3),
            page("d", "http://tauri.localhost/", 4),
            json!({ "id": "e", "url": 7 }),
            page("a", "http://localhost:9999/", 5),
            page("", "http://localhost/", 6),
        ],
        Some("b"),
    ));
    let ids: Vec<_> = file.pages.iter().map(|p| p.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
    // The active page was dropped: the last one kept is active instead.
    assert_eq!(file.active.as_deref(), Some("a"));
}

#[test]
fn loading_filters_history_and_clips_titles() {
    let mut v = page("a", "http://localhost:5173/", 1);
    v["history"] = json!([
        "http://localhost:5173/",
        "data:text/html,x",
        "https://example.com/"
    ]);
    v["title"] = json!("x".repeat(500));
    let file = validate(raw(vec![v], None));
    assert_eq!(
        file.pages[0].history,
        ["http://localhost:5173/", "https://example.com/"]
    );
    assert_eq!(file.pages[0].title.chars().count(), MAX_TITLE);
}

#[test]
fn open_reuses_the_active_page_unless_asked_for_a_new_one() {
    let mut file = BrowserFile::default();
    let a = open(
        &mut file,
        "http://localhost:5173/",
        Some("App"),
        false,
        Opener::Agent,
        1,
    );
    let b = open(
        &mut file,
        "http://localhost:5173/about",
        None,
        false,
        Opener::Agent,
        2,
    );
    assert_eq!(a.id, b.id);
    assert_eq!(file.pages.len(), 1);
    assert_eq!(file.pages[0].history.len(), 2);
    let c = open(
        &mut file,
        "https://example.com/",
        None,
        true,
        Opener::User,
        3,
    );
    assert_ne!(c.id, a.id);
    assert_eq!(file.active.as_deref(), Some(c.id.as_str()));
    assert_eq!(file.pages.len(), 2);
}

#[test]
fn history_skips_repeats_and_is_capped() {
    let mut file = BrowserFile::default();
    open(&mut file, "http://localhost/", None, false, Opener::User, 0);
    for i in 0..(MAX_HISTORY + 20) {
        let url = format!("http://localhost/{i}");
        visit(&mut file.pages[0], &url, i as i64);
        visit(&mut file.pages[0], &url, i as i64);
    }
    trim(&mut file);
    let h = &file.pages[0].history;
    assert_eq!(h.len(), MAX_HISTORY);
    assert_eq!(
        h.last().unwrap(),
        &format!("http://localhost/{}", MAX_HISTORY + 19)
    );
    // A refused URL is never recorded.
    visit(&mut file.pages[0], "file:///etc/passwd", 999);
    assert!(!file.pages[0].url.starts_with("file:"));
}

#[test]
fn pages_are_capped_least_recently_used_first() {
    let mut file = BrowserFile::default();
    for i in 0..(MAX_PAGES + 3) {
        open(
            &mut file,
            &format!("http://localhost/{i}"),
            None,
            true,
            Opener::Agent,
            i as i64,
        );
    }
    trim(&mut file);
    assert_eq!(file.pages.len(), MAX_PAGES);
    assert_eq!(file.pages[0].url, "http://localhost/3");
    assert!(file.active.is_some());
}
