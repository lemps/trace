use serde_json::{json, Value};

use super::to_markdown;

fn doc(content: Value) -> Value {
    json!({ "type": "doc", "version": 1, "content": content })
}

fn text(t: &str) -> Value {
    json!({ "type": "text", "text": t })
}

fn para(content: Value) -> Value {
    json!({ "type": "paragraph", "content": content })
}

#[test]
fn paragraphs_are_separated_by_a_blank_line() {
    let d = doc(json!([
        para(json!([text("One")])),
        para(json!([text("Two")]))
    ]));
    assert_eq!(to_markdown(&d), "One\n\nTwo");
}

#[test]
fn headings_keep_their_level() {
    let d =
        doc(json!([{ "type": "heading", "attrs": { "level": 3 }, "content": [text("Steps")] }]));
    assert_eq!(to_markdown(&d), "### Steps");
}

#[test]
fn marks_wrap_the_words_and_leave_spaces_outside() {
    let d = doc(json!([para(json!([
        text("Run "),
        { "type": "text", "text": "cargo test ", "marks": [{ "type": "code" }] },
        { "type": "text", "text": "now", "marks": [{ "type": "strong" }, { "type": "em" }] },
        text(" or "),
        { "type": "text", "text": "read this", "marks": [{ "type": "link", "attrs": { "href": "https://x.dev/a b" } }] }
    ]))]));
    assert_eq!(
        to_markdown(&d),
        "Run `cargo test` ***now*** or [read this](https://x.dev/a%20b)"
    );
}

#[test]
fn nested_lists_stay_tight_and_indented() {
    let item = |t: &str, nested: Option<Value>| {
        let mut content = vec![para(json!([text(t)]))];
        content.extend(nested);
        json!({ "type": "listItem", "content": content })
    };
    let inner = json!({ "type": "orderedList", "attrs": { "order": 3 }, "content": [item("c", None), item("d", None)] });
    let d = doc(
        json!([{ "type": "bulletList", "content": [item("a", Some(inner)), item("b", None)] }]),
    );
    assert_eq!(to_markdown(&d), "- a\n  3. c\n  4. d\n- b");
}

#[test]
fn task_lists_become_checkboxes() {
    let d = doc(json!([{ "type": "taskList", "content": [
        { "type": "taskItem", "attrs": { "state": "DONE" }, "content": [text("Ship it")] },
        { "type": "taskItem", "attrs": { "state": "TODO" }, "content": [text("Tell people")] }
    ] }]));
    assert_eq!(to_markdown(&d), "- [x] Ship it\n- [ ] Tell people");
}

#[test]
fn code_blocks_are_fenced_longer_than_any_backticks_inside() {
    let d = doc(
        json!([{ "type": "codeBlock", "attrs": { "language": "md" }, "content": [text("a ``` b\n")] }]),
    );
    assert_eq!(to_markdown(&d), "````md\na ``` b\n````");
}

#[test]
fn tables_take_their_first_row_as_the_header() {
    let cell = |kind: &str, t: &str| json!({ "type": kind, "content": [para(json!([text(t)]))] });
    let d = doc(json!([{ "type": "table", "content": [
        { "type": "tableRow", "content": [cell("tableHeader", "Field"), cell("tableHeader", "Rule")] },
        { "type": "tableRow", "content": [cell("tableCell", "id"), cell("tableCell", "a|b")] }
    ] }]));
    assert_eq!(
        to_markdown(&d),
        "| Field | Rule |\n| --- | --- |\n| id | a\\|b |"
    );
}

#[test]
fn quotes_panels_mentions_and_breaks_read_naturally() {
    let d = doc(json!([
        { "type": "panel", "attrs": { "panelType": "warning" }, "content": [para(json!([text("Careful")]))] },
        para(json!([
            { "type": "mention", "attrs": { "text": "@Ada Lovelace" } },
            text(" line one"),
            { "type": "hardBreak" },
            text("line two")
        ]))
    ]));
    assert_eq!(
        to_markdown(&d),
        "> **Warning:** Careful\n\n@Ada Lovelace line one  \nline two"
    );
}

#[test]
fn plain_text_is_escaped_but_snake_case_is_left_alone() {
    let d = doc(json!([para(json!([text(
        "set max_retries to *2* [not a link] _x_"
    )]))]));
    assert_eq!(
        to_markdown(&d),
        "set max_retries to \\*2\\* \\[not a link\\] \\_x\\_"
    );
}

#[test]
fn dates_and_unknown_nodes_keep_their_text() {
    let d = doc(json!([
        para(json!([{ "type": "date", "attrs": { "timestamp": "1786060800000" } }])),
        { "type": "someFutureBlock", "content": [para(json!([text("still here")]))] }
    ]));
    assert_eq!(to_markdown(&d), "2026-08-07\n\nstill here");
}
