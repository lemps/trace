//! A page on `localhost` means the agent's own machine, which for an agent in
//! a sandbox is the sandbox: its dev server is reached at the port's public
//! preview URL (`Preview`), not on this computer. Vercel routes a preview into
//! the sandbox's loopback, so a server bound to 127.0.0.1 (Vite's default)
//! answers there too (tried live: `vercel_live_preview`).

use super::Preview;

/// Whether `url` is on this machine's loopback: worth asking a sandbox about.
pub fn is_loopback(url: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|u| {
        matches!(
            u.host_str(),
            Some("localhost" | "127.0.0.1" | "0.0.0.0" | "[::1]")
        )
    })
}

/// `url` at the preview for its port, keeping its path, query and fragment.
/// None when it isn't a loopback URL or its port has no preview.
pub fn rewrite(previews: &[Preview], url: &str) -> Option<String> {
    if !is_loopback(url) {
        return None;
    }
    let u = reqwest::Url::parse(url).ok()?;
    let port = u.port_or_known_default()?;
    let preview = previews.iter().find(|p| p.port == port)?;
    let mut out = reqwest::Url::parse(&preview.url).ok()?;
    out.set_path(u.path());
    out.set_query(u.query());
    out.set_fragment(u.fragment());
    Some(out.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn previews() -> Vec<Preview> {
        vec![Preview {
            port: 5173,
            url: "https://sb-abc.vercel.run".into(),
        }]
    }

    #[test]
    fn a_local_dev_server_becomes_its_preview_with_its_path() {
        assert_eq!(
            rewrite(&previews(), "http://localhost:5173/app?x=1#top").as_deref(),
            Some("https://sb-abc.vercel.run/app?x=1#top")
        );
        assert_eq!(
            rewrite(&previews(), "http://127.0.0.1:5173").as_deref(),
            Some("https://sb-abc.vercel.run/")
        );
    }

    #[test]
    fn other_ports_and_hosts_are_left_alone() {
        assert_eq!(rewrite(&previews(), "http://localhost:3000/"), None);
        assert_eq!(rewrite(&previews(), "https://example.com:5173/"), None);
        assert_eq!(rewrite(&previews(), "not a url"), None);
        assert!(!is_loopback("https://localhost.example.com/"));
    }
}
