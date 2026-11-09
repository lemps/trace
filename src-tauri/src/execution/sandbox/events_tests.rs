use super::*;

fn b64(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(s)
}

fn reader(log: &str, seq: u64) -> Reader {
    Reader {
        offset: Offset {
            log: log.into(),
            seq,
        },
        ..Reader::default()
    }
}

fn feed_all(r: &mut Reader, lines: &[String]) -> Vec<Action> {
    lines.iter().flat_map(|l| r.feed(l)).collect()
}

#[test]
fn a_backlog_passes_on_only_its_newest_turn_but_every_pr() {
    let pr = b64(r#"{"url":"https://github.com/o/r/pull/7"}"#);
    let mut r = reader("", 0);
    let got = feed_all(
        &mut r,
        &[
            "log1 4".into(),
            "1 prompt e30=".into(),
            format!("2 pr {pr}"),
            "3 stop AAA".into(),
            "4 needs-input BBB".into(),
            "5 stop CCC".into(),
        ],
    );
    assert_eq!(
        got,
        [
            Action::Pr("https://github.com/o/r/pull/7".into()),
            Action::Hook("needs-input BBB".into()),
            Action::Hook("stop CCC".into()),
        ]
    );
    assert_eq!(
        r.offset,
        Offset {
            log: "log1".into(),
            seq: 5
        }
    );
}

#[test]
fn a_backlog_ending_in_a_pr_still_passes_on_the_turn_before() {
    let pr = b64(r#"{"url":"https://github.com/o/r/pull/8"}"#);
    let mut r = reader("", 0);
    let got = feed_all(
        &mut r,
        &["l 2".into(), "1 stop X".into(), format!("2 pr {pr}")],
    );
    assert_eq!(
        got,
        [
            Action::Pr("https://github.com/o/r/pull/8".into()),
            Action::Hook("stop X".into()),
        ]
    );
}

#[test]
fn what_was_read_before_is_skipped_on_the_same_log() {
    let mut r = reader("log1", 3);
    // The tail started after line 3, but a reconnect replays from the start.
    let got = feed_all(
        &mut r,
        &["log1 3".into(), "2 stop OLD".into(), "4 stop NEW".into()],
    );
    assert_eq!(got, [Action::Hook("stop NEW".into())]);
}

#[test]
fn a_new_log_is_read_from_its_start() {
    let mut r = reader("old-sandbox", 40);
    let got = feed_all(&mut r, &["fresh 0".into(), "1 stop X".into()]);
    assert_eq!(got, [Action::Hook("stop X".into())]);
    assert_eq!(r.offset.log, "fresh");
}

#[test]
fn junk_lines_and_bad_pr_payloads_do_nothing() {
    let mut r = reader("l", 0);
    let got = feed_all(
        &mut r,
        &[
            "l 0".into(),
            "garbage".into(),
            "x stop".into(),
            "1 pr notbase64!".into(),
        ],
    );
    assert!(got.is_empty());
}
