//! Atlassian Document Format (Jira's rich text) as Markdown, so a description or
//! comment keeps its headings, lists, code, links and tables: the Ticket tab renders
//! it with the app's Markdown renderer, and agents read it in their kickoff brief.
//! Anything without a Markdown form keeps its text (a panel becomes a quote, an
//! attachment a placeholder); unknown nodes fall back to their children.

use serde_json::Value;

/// `doc` (an ADF document, or any node of one) as Markdown.
pub fn to_markdown(doc: &Value) -> String {
    blocks(children(doc), "\n\n").trim().to_string()
}

fn kind(n: &Value) -> &str {
    n.get("type").and_then(Value::as_str).unwrap_or("")
}

fn children(n: &Value) -> &[Value] {
    n.get("content")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn attr<'a>(n: &'a Value, key: &str) -> Option<&'a Value> {
    n.get("attrs")?.get(key)
}

fn attr_str<'a>(n: &'a Value, key: &str) -> Option<&'a str> {
    attr(n, key)?.as_str()
}

/// Block nodes, each rendered and joined by `sep` (a blank line between paragraphs,
/// a newline inside a list item so the list stays tight).
fn blocks(nodes: &[Value], sep: &str) -> String {
    nodes
        .iter()
        .map(block)
        .filter(|b| !b.trim().is_empty())
        .collect::<Vec<_>>()
        .join(sep)
}

fn block(n: &Value) -> String {
    match kind(n) {
        "paragraph" => inline(children(n)),
        "heading" => {
            let level = attr(n, "level").and_then(Value::as_u64).unwrap_or(2);
            format!(
                "{} {}",
                "#".repeat(level.clamp(1, 6) as usize),
                inline(children(n))
            )
        }
        "bulletList" => list(n, None),
        "orderedList" => list(
            n,
            Some(attr(n, "order").and_then(Value::as_u64).unwrap_or(1)),
        ),
        "taskList" | "decisionList" => checklist(n),
        "codeBlock" => code_block(n),
        "blockquote" => quote(&blocks(children(n), "\n\n")),
        "panel" => {
            let label = match attr_str(n, "panelType").unwrap_or("info") {
                "warning" => "Warning",
                "error" => "Error",
                "success" => "Success",
                "note" => "Note",
                _ => "Info",
            };
            quote(&format!("**{label}:** {}", blocks(children(n), "\n\n")))
        }
        "rule" => "---".to_string(),
        "table" => table(n),
        "expand" | "nestedExpand" => {
            let body = blocks(children(n), "\n\n");
            match attr_str(n, "title").filter(|t| !t.is_empty()) {
                Some(title) => format!("**{}**\n\n{body}", escape(title)),
                None => body,
            }
        }
        "mediaSingle" | "mediaGroup" | "media" => "_(attachment)_".to_string(),
        "blockCard" | "embedCard" => attr_str(n, "url").unwrap_or_default().to_string(),
        // Unknown blocks keep their content: blocks if they hold any, else inline.
        _ if children(n).iter().any(|c| is_block(kind(c))) => blocks(children(n), "\n\n"),
        _ => inline(children(n)),
    }
}

fn is_block(kind: &str) -> bool {
    matches!(
        kind,
        "paragraph"
            | "heading"
            | "bulletList"
            | "orderedList"
            | "taskList"
            | "codeBlock"
            | "blockquote"
            | "panel"
            | "table"
            | "rule"
            | "mediaSingle"
            | "mediaGroup"
            | "expand"
    )
}

/// A list, each item's continuation lines indented under its marker.
fn list(n: &Value, start: Option<u64>) -> String {
    children(n)
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let marker = match start {
                Some(s) => format!("{}. ", s + i as u64),
                None => "- ".to_string(),
            };
            item_with(&marker, &blocks(children(item), "\n"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn checklist(n: &Value) -> String {
    children(n)
        .iter()
        .map(|item| {
            let done = matches!(attr_str(item, "state"), Some("DONE") | Some("DECIDED"));
            let marker = if done { "- [x] " } else { "- [ ] " };
            let body = if children(item).iter().any(|c| is_block(kind(c))) {
                blocks(children(item), "\n")
            } else {
                inline(children(item))
            };
            item_with(marker, &body)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn item_with(marker: &str, body: &str) -> String {
    let pad = " ".repeat(marker.len());
    let mut lines = body.lines();
    let first = lines.next().unwrap_or("");
    let rest: Vec<String> = lines
        .map(|l| {
            if l.is_empty() {
                String::new()
            } else {
                format!("{pad}{l}")
            }
        })
        .collect();
    std::iter::once(format!("{marker}{first}"))
        .chain(rest)
        .collect::<Vec<_>>()
        .join("\n")
}

fn quote(body: &str) -> String {
    body.lines()
        .map(|l| {
            if l.is_empty() {
                ">".to_string()
            } else {
                format!("> {l}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn code_block(n: &Value) -> String {
    let code: String = children(n)
        .iter()
        .filter_map(|c| c.get("text").and_then(Value::as_str))
        .collect();
    // A fence longer than any run of backticks inside, so the code can't close it.
    let longest = code.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    let fence = "`".repeat((longest + 1).max(3));
    let lang = attr_str(n, "language").unwrap_or("");
    format!("{fence}{lang}\n{}\n{fence}", code.trim_end_matches('\n'))
}

/// A GitHub table; its first row is the header, as Markdown needs one.
fn table(n: &Value) -> String {
    let rows: Vec<Vec<String>> = children(n)
        .iter()
        .map(|row| {
            children(row)
                .iter()
                .map(|cell| {
                    blocks(children(cell), " ")
                        .replace('\n', " ")
                        .replace('|', "\\|")
                })
                .collect()
        })
        .filter(|cells: &Vec<String>| !cells.is_empty())
        .collect();
    let Some(width) = rows.iter().map(Vec::len).max() else {
        return String::new();
    };
    let line = |cells: &[String]| {
        let mut padded: Vec<&str> = cells.iter().map(String::as_str).collect();
        padded.resize(width, "");
        format!("| {} |", padded.join(" | "))
    };
    let mut out = vec![line(&rows[0]), format!("|{}", " --- |".repeat(width))];
    out.extend(rows[1..].iter().map(|r| line(r)));
    out.join("\n")
}

fn inline(nodes: &[Value]) -> String {
    nodes.iter().map(inline_node).collect()
}

fn inline_node(n: &Value) -> String {
    match kind(n) {
        "text" => marked(n),
        "hardBreak" => "  \n".to_string(),
        "mention" => {
            let name = attr_str(n, "text").unwrap_or("someone");
            let name = name.trim_start_matches('@');
            format!("@{}", escape(name))
        }
        "emoji" => attr_str(n, "text")
            .or_else(|| attr_str(n, "shortName"))
            .unwrap_or_default()
            .to_string(),
        "inlineCard" => attr_str(n, "url").unwrap_or_default().to_string(),
        "status" => format!("`{}`", attr_str(n, "text").unwrap_or_default()),
        "date" => attr_str(n, "timestamp")
            .and_then(|t| t.parse::<i64>().ok())
            .map(date_of)
            .unwrap_or_default(),
        "placeholder" => String::new(),
        _ => inline(children(n)),
    }
}

/// A text node with its marks. Spaces stay outside the markers (`** bold**` isn't
/// bold); code takes its text verbatim.
fn marked(n: &Value) -> String {
    let raw = n.get("text").and_then(Value::as_str).unwrap_or("");
    let marks: Vec<&Value> = n
        .get("marks")
        .and_then(Value::as_array)
        .map(|m| m.iter().collect())
        .unwrap_or_default();
    let has = |k: &str| marks.iter().any(|m| kind(m) == k);
    let lead = &raw[..raw.len() - raw.trim_start().len()];
    let trail = &raw[raw.trim_end().len()..];
    let core = raw.trim();
    if core.is_empty() {
        return raw.to_string();
    }
    let mut s = if has("code") {
        let ticks = if core.contains('`') { "``" } else { "`" };
        format!("{ticks}{core}{ticks}")
    } else {
        escape(core)
    };
    if has("strike") {
        s = format!("~~{s}~~");
    }
    if has("em") {
        s = format!("*{s}*");
    }
    if has("strong") {
        s = format!("**{s}**");
    }
    if let Some(href) = marks
        .iter()
        .find(|m| kind(m) == "link")
        .and_then(|m| attr_str(m, "href"))
    {
        s = format!("[{s}]({})", href.replace(')', "%29").replace(' ', "%20"));
    }
    format!("{lead}{s}{trail}")
}

/// Plain text made safe to read as Markdown. `_` is escaped only where it could
/// open or close emphasis, so `snake_case` reads as written.
fn escape(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    for (i, &c) in chars.iter().enumerate() {
        let intraword = |j: Option<usize>| {
            j.and_then(|j| chars.get(j))
                .is_some_and(|c| c.is_alphanumeric())
        };
        let needs = match c {
            '\\' | '`' | '*' | '[' | ']' | '<' => true,
            '_' => !(intraword(i.checked_sub(1)) && intraword(Some(i + 1))),
            _ => false,
        };
        if needs {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A Unix-ms timestamp as `YYYY-MM-DD` (UTC), without a date crate.
fn date_of(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
#[path = "adf_tests.rs"]
mod tests;
