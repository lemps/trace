//! A Conductor setup script, as a trace `SetupConfig`.
//!
//! trace runs each command line on its own, in the new worktree, with the
//! `CONDUCTOR_*` variables set (`repo_catalog::setup`), so most lines carry over
//! unchanged. A `cp "$CONDUCTOR_ROOT_PATH/x" x` becomes a file copy instead. A
//! script whose lines depend on each other (`cd`, `export`, `if … fi`, a `\`
//! continuation) is kept whole, as one command.

use crate::repo_catalog::model::{is_inside_relative, SetupConfig};

const ROOT_VARS: &[&str] = &["$CONDUCTOR_ROOT_PATH/", "${CONDUCTOR_ROOT_PATH}/"];
const WORKSPACE_VARS: &[&str] = &["$CONDUCTOR_WORKSPACE_PATH/", "${CONDUCTOR_WORKSPACE_PATH}/"];

/// The script as setup steps, plus notes on anything the user should check.
pub fn setup_script(script: &str) -> (SetupConfig, Vec<String>) {
    let lines: Vec<&str> = script
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect();
    let mut setup = SetupConfig::default();
    if lines.is_empty() {
        return (setup, Vec::new());
    }
    if lines.iter().any(|l| is_stateful(l)) {
        setup.commands.push(whole_script(script.trim()));
        let note = "The setup script's lines depend on each other, so it runs as one command.";
        return (setup, vec![note.to_string()]);
    }
    for line in lines {
        match root_copy(line) {
            Some(files) => setup.copy_files.extend(files),
            None => setup.commands.push(line.to_string()),
        }
    }
    (setup, Vec::new())
}

/// A line that changes what the lines after it see, or spans several.
fn is_stateful(line: &str) -> bool {
    const WORDS: &[&str] = &[
        "cd", "pushd", "popd", "export", "source", ".", "set", "if", "then", "else", "elif", "fi",
        "for", "while", "until", "do", "done", "case", "esac", "function", "{", "}",
    ];
    let first = line.split_whitespace().next().unwrap_or("");
    let assigns = first.split_once('=').is_some_and(|(name, _)| {
        !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_')
    });
    WORDS.contains(&first) || assigns || line.ends_with('\\') || line.contains("<<")
}

/// The whole script on one line, for `/bin/sh -c`: `printf %b` turns the
/// escaped newlines back into a script, which `sh -c` then runs as it was.
fn whole_script(script: &str) -> String {
    let escaped = script
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace('\'', "'\\''");
    format!("sh -c \"$(printf '%b' '{escaped}')\"")
}

/// The files a plain `cp` from the main checkout copies to the same place in
/// the worktree, or None if the line does anything else.
fn root_copy(line: &str) -> Option<Vec<String>> {
    if line.contains([';', '&', '|', '<', '>', '`']) || line.contains("$(") {
        return None;
    }
    let words = split_words(line)?;
    let (cmd, args) = words.split_first()?;
    if cmd != "cp" {
        return None;
    }
    let mut paths = Vec::new();
    for arg in args {
        match arg.strip_prefix('-') {
            // Recursive or link-preserving copies aren't a file copy.
            Some(flags) if flags.chars().all(|c| "fpnv".contains(c)) => {}
            Some(_) => return None,
            None => paths.push(arg.as_str()),
        }
    }
    let (dest, sources) = paths.split_last()?;
    if sources.is_empty() {
        return None;
    }
    let dest = strip_any(dest, WORKSPACE_VARS).unwrap_or(dest);
    let dest = dest.strip_prefix("./").unwrap_or(dest);
    let mut files = Vec::new();
    for src in sources {
        let rel = strip_any(src, ROOT_VARS)?;
        if !is_inside_relative(rel) || rel.contains(['$', '*', '?', '[']) {
            return None;
        }
        let parent = rel.rsplit_once('/').map_or("", |(p, _)| p);
        let lands_in_place = match dest {
            "." | "" => parent.is_empty(),
            d if d.ends_with('/') => d.trim_end_matches('/') == parent,
            d => sources.len() == 1 && d == rel,
        };
        if !lands_in_place {
            return None;
        }
        files.push(rel.to_string());
    }
    Some(files)
}

fn strip_any<'a>(s: &'a str, prefixes: &[&str]) -> Option<&'a str> {
    prefixes.iter().find_map(|p| s.strip_prefix(p))
}

/// Shell words with quotes removed. None for anything quoting can't settle
/// (an unclosed quote, a backslash escape).
fn split_words(line: &str) -> Option<Vec<String>> {
    let mut words = Vec::new();
    let mut word = String::new();
    let mut in_word = false;
    let mut quote: Option<char> = None;
    for c in line.chars() {
        match (quote, c) {
            (_, '\\') => return None,
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => word.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                in_word = true;
            }
            (None, c) if c.is_whitespace() => {
                if in_word {
                    words.push(std::mem::take(&mut word));
                    in_word = false;
                }
            }
            (None, c) => {
                word.push(c);
                in_word = true;
            }
        }
    }
    if quote.is_some() {
        return None;
    }
    if in_word {
        words.push(word);
    }
    Some(words)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_copies_become_file_copies() {
        let (setup, notes) = setup_script(
            "cp \"$CONDUCTOR_ROOT_PATH/.env\" .\n\
             cp -f ${CONDUCTOR_ROOT_PATH}/config/local.json config/local.json\n\
             cp $CONDUCTOR_ROOT_PATH/a.txt $CONDUCTOR_ROOT_PATH/b.txt ./\n\
             pnpm i\n",
        );
        assert_eq!(
            setup.copy_files,
            vec![".env", "config/local.json", "a.txt", "b.txt"]
        );
        assert_eq!(setup.commands, vec!["pnpm i"]);
        assert!(notes.is_empty());
    }

    #[test]
    fn other_lines_stay_commands() {
        let (setup, _) = setup_script(
            "# comment\n\
             ln -sf \"$CONDUCTOR_ROOT_PATH/src/x.properties\" src/x.properties\n\
             cp $CONDUCTOR_ROOT_PATH/src/x.properties .\n\
             cp -r $CONDUCTOR_ROOT_PATH/certs certs\n\
             cp $CONDUCTOR_ROOT_PATH/../outside .\n",
        );
        assert!(setup.copy_files.is_empty());
        assert_eq!(setup.commands.len(), 4);
    }

    #[test]
    fn a_stateful_script_is_kept_whole() {
        let script = "cd web\nif [ -f x ]; then\n  echo 'it''s'\nfi";
        let (setup, notes) = setup_script(script);
        assert_eq!(setup.commands.len(), 1);
        assert!(setup.copy_files.is_empty());
        assert_eq!(notes.len(), 1);
        let line = &setup.commands[0];
        assert!(!line.contains('\n'));
        // Undo the quoting: what `sh` would see in the single-quoted argument,
        // then what `printf %b` would print.
        let arg = line
            .strip_prefix("sh -c \"$(printf '%b' '")
            .and_then(|s| s.strip_suffix("')\""))
            .unwrap()
            .replace("'\\''", "'");
        let printed = arg.replace("\\n", "\n").replace("\\\\", "\\");
        assert_eq!(printed, script);
    }

    #[test]
    fn words_respect_quotes() {
        assert_eq!(
            split_words(r#"cp "a b" 'c'd e"#).unwrap(),
            vec!["cp", "a b", "cd", "e"]
        );
        assert!(split_words("cp \"open").is_none());
    }
}
