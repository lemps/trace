//! Which URLs the Browser tab will load. Only `http` and `https`, never trace's own
//! origins (its custom protocols are registered on every webview, the browser's
//! too), and never a URL carrying a user name or password. Loopback hosts (an
//! agent's dev server) open quietly; any other host is "external", which the tab
//! announces when an agent opened it.

use std::net::{IpAddr, Ipv6Addr};

use tauri::Url;

/// trace's own protocols, served on Windows and Android at `http(s)://<name>.localhost`.
/// The browser must never load one: it would be trace's own page (or files) in a
/// webview that isn't trace's.
pub const APP_SCHEMES: &[&str] = &["tauri", "ipc", "asset", crate::gallery::SCHEME];

/// Longest URL the tab loads or keeps.
pub const MAX_URL: usize = 4096;

/// Where a URL points, which decides how the tab shows it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Reach {
    /// localhost, 127.0.0.0/8, ::1 (and 0.0.0.0, ::): the user's own machine.
    Loopback,
    External,
}

/// A URL the tab may load, or why not (worded for the agent or the user to act on).
pub fn check(raw: &str, app_origins: &[Url]) -> Result<(Url, Reach), String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Give a URL to open, e.g. http://localhost:5173.".into());
    }
    let url = Url::parse(raw).map_err(|_| {
        format!("\"{raw}\" isn't a full URL. Include the scheme, e.g. http://localhost:5173.")
    })?;
    let url = loopback_for_any(&url).unwrap_or(url);
    check_url(&url, app_origins).map(|reach| (url, reach))
}

/// [`check`] for a parsed URL: also what every navigation inside the tab goes through.
pub fn check_url(url: &Url, app_origins: &[Url]) -> Result<Reach, String> {
    if url.as_str().len() > MAX_URL {
        return Err(format!("That URL is over {MAX_URL} characters."));
    }
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!(
            "The Browser tab only opens http and https pages, not {scheme}: URLs."
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URLs with a user name or password in them aren't opened.".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "That URL has no host.".to_string())?
        .to_ascii_lowercase();
    if is_app_host(&host) || app_origins.iter().any(|o| same_origin(o, url)) {
        return Err("That address is trace's own, so the Browser tab won't load it.".into());
    }
    Ok(if is_loopback(&host) {
        Reach::Loopback
    } else {
        Reach::External
    })
}

/// `tauri.localhost`, `ipc.localhost`, … (and their subdomains).
fn is_app_host(host: &str) -> bool {
    let Some(name) = host.strip_suffix(".localhost") else {
        return false;
    };
    let first = name.rsplit('.').next().unwrap_or(name);
    APP_SCHEMES.contains(&first)
}

/// `url` with `0.0.0.0` or `[::]` (what a server listening on every interface
/// prints, `python -m http.server`'s "Serving HTTP on 0.0.0.0 port 8000") swapped for
/// the loopback address that reaches it: Windows refuses to connect to 0.0.0.0, so
/// the page would only fail. `None` for any other host.
pub fn loopback_for_any(url: &Url) -> Option<Url> {
    let host = url.host_str()?;
    let to = match host.trim_start_matches('[').trim_end_matches(']').parse() {
        Ok(IpAddr::V4(ip)) if ip.is_unspecified() => "127.0.0.1",
        Ok(IpAddr::V6(ip)) if ip.is_unspecified() => "[::1]",
        _ => return None,
    };
    let mut out = url.clone();
    out.set_host(Some(to)).ok()?;
    Some(out)
}

/// The machine itself: `localhost` (and `*.localhost`), 127.0.0.0/8, `::1`,
/// IPv4-mapped loopback, and the any-address (`0.0.0.0`, `::`), which a browser that
/// connects to it at all reaches this machine through.
pub fn is_loopback(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host == "localhost" || host.ends_with(".localhost") {
        return true;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_unspecified(),
        Ok(IpAddr::V6(ip)) => {
            ip == Ipv6Addr::LOCALHOST
                || ip.is_unspecified()
                || ip
                    .to_ipv4_mapped()
                    .is_some_and(|v4| v4.is_loopback() || v4.is_unspecified())
        }
        Err(_) => false,
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str().map(str::to_ascii_lowercase) == b.host_str().map(str::to_ascii_lowercase)
        && a.port_or_known_default() == b.port_or_known_default()
}

/// The host as the tab names it ("example.com", "localhost:5173").
pub fn display_host(url: &Url) -> String {
    let host = url.host_str().unwrap_or_default();
    match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    }
}

#[cfg(test)]
#[path = "url_rules_tests.rs"]
mod tests;
