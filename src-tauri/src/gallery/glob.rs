//! `show_images`' optional `glob`: `*`, `?`, `**` and `{a,b}`, case-insensitive,
//! matched against a path relative to the named folder with `/` separators. A pattern
//! without a `/` matches the file name alone, so `*.png` finds PNGs at any depth.

use regex::Regex;

#[derive(Debug, Clone)]
pub struct Glob {
    re: Regex,
    name_only: bool,
}

const MAX_PATTERN: usize = 200;

impl Glob {
    pub fn new(pattern: &str) -> Result<Glob, String> {
        let pattern = pattern.trim().replace('\\', "/");
        if pattern.is_empty() || pattern.len() > MAX_PATTERN {
            return Err("Give a glob like *.png or shots/**/*.webp.".into());
        }
        let mut re = String::from("(?i)^");
        let mut chars = pattern.chars().peekable();
        let mut in_group = false;
        while let Some(c) = chars.next() {
            match c {
                '*' if chars.peek() == Some(&'*') => {
                    chars.next();
                    if chars.peek() == Some(&'/') {
                        chars.next();
                        re.push_str("(?:.*/)?");
                    } else {
                        re.push_str(".*");
                    }
                }
                '*' => re.push_str("[^/]*"),
                '?' => re.push_str("[^/]"),
                '{' if !in_group => {
                    in_group = true;
                    re.push_str("(?:");
                }
                '}' if in_group => {
                    in_group = false;
                    re.push(')');
                }
                ',' if in_group => re.push('|'),
                c => re.push_str(&regex::escape(&c.to_string())),
            }
        }
        if in_group {
            return Err(format!("The glob \"{pattern}\" has a {{ without its }}."));
        }
        re.push('$');
        let re = Regex::new(&re).map_err(|_| format!("\"{pattern}\" isn't a glob trace reads."))?;
        Ok(Glob {
            re,
            name_only: !pattern.contains('/'),
        })
    }

    /// Whether `rel` (relative to the set's folder, `/`-separated) matches.
    pub fn matches(&self, rel: &str) -> bool {
        let target = if self.name_only {
            rel.rsplit('/').next().unwrap_or(rel)
        } else {
            rel
        };
        self.re.is_match(target)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_patterns_match_at_any_depth() {
        let g = Glob::new("*.png").unwrap();
        assert!(g.matches("a.png"));
        assert!(g.matches("deep/er/A.PNG"));
        assert!(!g.matches("a.jpg"));
        assert!(!g.matches("a.png.txt"));
    }

    #[test]
    fn path_patterns() {
        let g = Glob::new("shots/**/*.webp").unwrap();
        assert!(g.matches("shots/a.webp"));
        assert!(g.matches("shots/x/y/a.webp"));
        assert!(!g.matches("other/a.webp"));
        let g = Glob::new("shot-??.{png,jpg}").unwrap();
        assert!(g.matches("shot-01.png"));
        assert!(g.matches("x/shot-02.JPG"));
        assert!(!g.matches("shot-1.png"));
        let g = Glob::new("a/*.png").unwrap();
        assert!(g.matches("a/b.png"));
        assert!(!g.matches("a/c/b.png"));
    }

    #[test]
    fn regex_characters_are_literal() {
        let g = Glob::new("a+(1).png").unwrap();
        assert!(g.matches("a+(1).png"));
        assert!(!g.matches("aa(1).png"));
    }

    #[test]
    fn bad_patterns() {
        assert!(Glob::new("").is_err());
        assert!(Glob::new("{a,b").is_err());
        assert!(Glob::new(&"*".repeat(300)).is_err());
    }
}
