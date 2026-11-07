use super::*;
use crate::plans::model::PlanSource;
use serde_json::json;

fn new(series: &str, body: &str, reference: Option<&str>) -> NewDoc {
    NewDoc {
        series: series.into(),
        title: "Plan".into(),
        source: PlanSource::PlanMode,
        format: PlanFormat::Markdown,
        body: body.into(),
        reference: reference.map(str::to_string),
    }
}

#[test]
fn a_new_plan_in_a_series_is_its_next_version_and_keeps_the_old_one() {
    let mut file = PlanFile::default();
    let v1 = add(&mut file, new("plan-mode", "one", Some("call-1")), 10).unwrap();
    let v2 = add(&mut file, new("plan-mode", "two", Some("call-2")), 20).unwrap();
    let other = add(&mut file, new("published:x", "x", None), 30).unwrap();
    assert_eq!((v1.version, v2.version, other.version), (1, 2, 1));
    assert_eq!(file.docs.len(), 3);
}

#[test]
fn a_capture_seen_twice_or_saying_nothing_new_is_not_a_version() {
    let mut file = PlanFile::default();
    assert!(add(&mut file, new("plan-mode", "one", Some("call-1")), 10).is_some());
    assert!(add(&mut file, new("plan-mode", "changed", Some("call-1")), 11).is_none());
    assert!(add(&mut file, new("plan-mode", "one", Some("call-2")), 12).is_none());
    assert_eq!(file.docs.len(), 1);
}

#[test]
fn a_removed_version_does_not_come_back_on_a_rescan() {
    let mut file = PlanFile::default();
    let doc = add(&mut file, new("plan-mode", "one", Some("call-1")), 10).unwrap();
    assert!(remove(&mut file, &doc.id, false));
    assert!(add(&mut file, new("plan-mode", "one", Some("call-1")), 11).is_none());
    assert!(file.docs.is_empty());
}

#[test]
fn removing_all_versions_takes_the_whole_series_only() {
    let mut file = PlanFile::default();
    let v1 = add(&mut file, new("a", "1", None), 1).unwrap();
    add(&mut file, new("a", "2", None), 2).unwrap();
    add(&mut file, new("b", "x", None), 3).unwrap();
    assert!(remove(&mut file, &v1.id, true));
    assert_eq!(file.docs.len(), 1);
    assert_eq!(file.docs[0].series, "b");
}

#[test]
fn versions_and_series_are_capped_newest_kept() {
    let mut file = PlanFile::default();
    for i in 0..(MAX_VERSIONS + 5) {
        add(&mut file, new("a", &format!("v{i}"), None), i as u64).unwrap();
    }
    for i in 0..(MAX_SERIES + 3) {
        add(&mut file, new(&format!("s{i}"), "x", None), 1000 + i as u64).unwrap();
    }
    trim(&mut file);
    let series: std::collections::HashSet<_> = file.docs.iter().map(|d| &d.series).collect();
    assert_eq!(series.len(), MAX_SERIES);
    // "a" is the least recently updated, so it's the one dropped.
    assert!(!series.contains(&"a".to_string()));
    let mut only_a = PlanFile::default();
    for i in 0..(MAX_VERSIONS + 5) {
        add(&mut only_a, new("a", &format!("v{i}"), None), i as u64).unwrap();
    }
    trim(&mut only_a);
    assert_eq!(only_a.docs.len(), MAX_VERSIONS);
    assert_eq!(
        only_a.docs.last().unwrap().body,
        format!("v{}", MAX_VERSIONS + 4)
    );
}

#[test]
fn long_markdown_is_cut_and_oversized_html_refused() {
    let long = "x".repeat(MAX_MARKDOWN + 10);
    let cut = fit_body(PlanFormat::Markdown, long).unwrap();
    assert!(cut.len() < MAX_MARKDOWN + 100 && cut.ends_with("too long to keep)"));
    assert!(fit_body(PlanFormat::Html, "x".repeat(MAX_HTML + 1)).is_none());
}

#[test]
fn loading_drops_bad_entries_and_keeps_good_ones() {
    let good = json!({"id": "d1", "series": "plan-mode", "title": "  T ", "source": "planMode",
        "format": "markdown", "body": "b", "createdAt": 5, "version": 1});
    let raw = RawFile {
        docs: vec![
            good.clone(),
            good.clone(), // repeated id
            json!({"id": "d2", "series": "s", "title": "t", "source": "nonsense",
                "format": "markdown", "body": "b", "createdAt": 5, "version": 1}),
            json!({"id": "", "series": "s", "title": "t", "source": "published",
                "format": "html", "body": "b", "createdAt": 5, "version": 1}),
            json!({"id": "d3", "series": "s", "title": "t", "source": "published",
                "format": "html", "body": "b", "createdAt": 5, "version": 0}),
            json!("not a doc"),
        ],
        tasks: Some(json!({"items": [{"text": "a", "status": "done"}], "updatedAt": 1})),
        refs: vec![json!("r1"), json!(3)],
    };
    let file = validate(raw);
    assert_eq!(file.docs.len(), 1);
    assert_eq!(file.docs[0].title, "T");
    assert_eq!(file.tasks.unwrap().items.len(), 1);
    assert_eq!(file.refs, vec!["r1".to_string()]);
}

#[test]
fn an_unchanged_task_list_is_not_rewritten() {
    use crate::agent_session::journal::{PlanItem, PlanStatus};
    let mut file = PlanFile::default();
    let list = |status| TaskList {
        items: vec![PlanItem {
            text: "a".into(),
            status,
        }],
        updated_at: 1,
    };
    assert!(set_tasks(&mut file, list(PlanStatus::Pending)));
    assert!(!set_tasks(&mut file, list(PlanStatus::Pending)));
    assert!(set_tasks(&mut file, list(PlanStatus::Done)));
}

#[test]
fn a_reference_is_kept_for_a_capture_that_said_nothing_new() {
    let mut file = PlanFile::default();
    add(&mut file, new("plan-mode", "v1", Some("call-1")), 1).unwrap();
    // The next call first arrives with the old text, then with its own.
    assert!(add(&mut file, new("plan-mode", "v1", Some("call-2")), 2).is_none());
    assert_eq!(
        add(&mut file, new("plan-mode", "v2", Some("call-2")), 3)
            .unwrap()
            .version,
        2
    );
}
