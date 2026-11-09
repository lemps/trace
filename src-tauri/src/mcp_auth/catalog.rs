//! Popular hosted MCP servers, offered on Integrations → MCP servers with one
//! click to connect. Each was checked live (2026-11-09) at its URL: those that
//! log in with OAuth let a client register itself, so Connect needs no setup;
//! the open ones answer without a login. Servers whose OAuth can't register
//! clients (Stripe, Asana, Box) aren't here: they'd need trace registered by
//! hand first, which "Add your own" can still do with a client ID.

use serde::Serialize;

/// How a server is logged in to.
#[derive(Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Auth {
    /// OAuth in the browser (`flow`).
    Oauth,
    /// No login: anyone can call it.
    Open,
    /// A key sent in a header, pasted once.
    Key,
}

/// One server in the list.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Known {
    /// Stable id; the renderer picks the logo by it.
    pub id: &'static str,
    /// Also its tools' prefix (`mcp__<name>__`).
    pub name: &'static str,
    pub url: &'static str,
    pub auth: Auth,
    /// What it's for, in a few words.
    pub about: &'static str,
    /// For `Key`: the header it goes in, and what to paste.
    pub key_header: Option<&'static str>,
    pub key_hint: Option<&'static str>,
}

const fn oauth(
    id: &'static str,
    name: &'static str,
    url: &'static str,
    about: &'static str,
) -> Known {
    Known {
        id,
        name,
        url,
        auth: Auth::Oauth,
        about,
        key_header: None,
        key_hint: None,
    }
}

const fn open(
    id: &'static str,
    name: &'static str,
    url: &'static str,
    about: &'static str,
) -> Known {
    Known {
        id,
        name,
        url,
        auth: Auth::Open,
        about,
        key_header: None,
        key_hint: None,
    }
}

pub const CATALOG: &[Known] = &[
    oauth(
        "sentry",
        "sentry",
        "https://mcp.sentry.dev/mcp",
        "Errors, issues and traces",
    ),
    oauth(
        "linear",
        "linear",
        "https://mcp.linear.app/mcp",
        "Issues, projects and cycles",
    ),
    oauth(
        "notion",
        "notion",
        "https://mcp.notion.com/mcp",
        "Pages and databases",
    ),
    oauth(
        "atlassian",
        "atlassian",
        "https://mcp.atlassian.com/v1/mcp",
        "Jira and Confluence",
    ),
    Known {
        id: "github",
        name: "github",
        url: "https://api.githubcopilot.com/mcp/",
        auth: Auth::Key,
        about: "Repositories, issues and pull requests",
        key_header: Some("Authorization"),
        key_hint: Some("A GitHub personal access token"),
    },
    oauth(
        "figma",
        "figma",
        "https://mcp.figma.com/mcp",
        "Designs, components and variables",
    ),
    oauth(
        "vercel",
        "vercel",
        "https://mcp.vercel.com",
        "Projects, deployments and logs",
    ),
    oauth(
        "supabase",
        "supabase",
        "https://mcp.supabase.com/mcp",
        "Databases, auth and storage",
    ),
    oauth(
        "neon",
        "neon",
        "https://mcp.neon.tech/mcp",
        "Serverless Postgres",
    ),
    oauth(
        "posthog",
        "posthog",
        "https://mcp.posthog.com/mcp",
        "Product analytics and flags",
    ),
    oauth(
        "pylon",
        "pylon",
        "https://mcp.usepylon.com",
        "Support issues and accounts",
    ),
    oauth(
        "intercom",
        "intercom",
        "https://mcp.intercom.com/mcp",
        "Conversations and contacts",
    ),
    oauth(
        "granola",
        "granola",
        "https://mcp.granola.ai/mcp",
        "Meeting notes",
    ),
    oauth(
        "canva",
        "canva",
        "https://mcp.canva.com/mcp",
        "Designs and brand assets",
    ),
    oauth(
        "webflow",
        "webflow",
        "https://mcp.webflow.com/mcp",
        "Sites, pages and CMS",
    ),
    oauth(
        "paypal",
        "paypal",
        "https://mcp.paypal.com/mcp",
        "Payments, invoices and orders",
    ),
    oauth(
        "square",
        "square",
        "https://mcp.squareup.com/mcp",
        "Payments, catalog and orders",
    ),
    open(
        "context7",
        "context7",
        "https://mcp.context7.com/mcp",
        "Up-to-date library docs",
    ),
    open(
        "exa",
        "exa",
        "https://mcp.exa.ai/mcp",
        "Web search for agents",
    ),
    open(
        "huggingface",
        "huggingface",
        "https://huggingface.co/mcp",
        "Models, datasets and Spaces",
    ),
    open(
        "cloudflare",
        "cloudflare-docs",
        "https://docs.mcp.cloudflare.com/mcp",
        "Cloudflare's docs",
    ),
];

/// The catalog entry for `url`, if it's one.
pub fn by_url(url: &str) -> Option<&'static Known> {
    let norm = |u: &str| u.trim_end_matches('/').to_ascii_lowercase();
    CATALOG.iter().find(|k| norm(k.url) == norm(url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_and_names_are_unique_and_urls_are_https() {
        let mut ids: Vec<&str> = CATALOG.iter().map(|k| k.id).collect();
        let mut names: Vec<&str> = CATALOG.iter().map(|k| k.name).collect();
        ids.sort_unstable();
        names.sort_unstable();
        ids.dedup();
        names.dedup();
        assert_eq!(ids.len(), CATALOG.len());
        assert_eq!(names.len(), CATALOG.len());
        assert!(CATALOG.iter().all(|k| k.url.starts_with("https://")));
        assert!(CATALOG.iter().all(|k| k.name != "trace"), "trace is taken");
        let keyed = CATALOG.iter().filter(|k| k.auth == Auth::Key);
        assert!(keyed.into_iter().all(|k| k.key_header.is_some()));
    }

    #[test]
    fn found_by_url_whatever_the_trailing_slash() {
        assert_eq!(
            by_url("https://mcp.sentry.dev/mcp/").map(|k| k.id),
            Some("sentry")
        );
        assert_eq!(
            by_url("https://api.githubcopilot.com/mcp").map(|k| k.id),
            Some("github")
        );
        assert!(by_url("https://example.com/mcp").is_none());
    }
}
