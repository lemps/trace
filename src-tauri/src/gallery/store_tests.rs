use serde_json::json;

use super::*;

fn set(id: &str, at: i64) -> Value {
    let root = std::env::temp_dir().join("pics");
    json!({
        "id": id, "title": "Shots", "roots": [{ "path": root, "folder": true }],
        "recursive": false, "createdAt": at
    })
}

#[test]
fn loading_drops_bad_sets_and_sorts_newest_first() {
    let mut relative = set("rel", 5);
    relative["roots"] = json!([{ "path": "pics", "folder": true }]);
    let mut no_roots = set("none", 6);
    no_roots["roots"] = json!([]);
    let mut bad_glob = set("glob", 7);
    bad_glob["glob"] = json!("{a,b");
    let mut long_title = set("long", 8);
    long_title["title"] = json!("x".repeat(500));
    let sets = validate(RawFile {
        sets: vec![
            set("a", 1),
            set("b", 3),
            relative,
            no_roots,
            bad_glob,
            json!({ "id": "junk" }),
            set("a", 9),
            set("", 4),
            long_title,
        ],
    });
    let ids: Vec<_> = sets.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["long", "b", "a"]);
    assert_eq!(sets[0].title.chars().count(), MAX_TITLE);
}

#[test]
fn sets_are_capped_oldest_first() {
    let sets = validate(RawFile {
        sets: (0..(MAX_SETS as i64 + 5))
            .map(|i| set(&format!("s{i}"), i))
            .collect(),
    });
    assert_eq!(sets.len(), MAX_SETS);
    assert_eq!(sets[0].id, format!("s{}", MAX_SETS + 4));
    assert!(sets.iter().all(|s| s.id != "s0"));
}
