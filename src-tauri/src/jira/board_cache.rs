//! What a Jira board *is*, kept for a few minutes: its columns, saved filter,
//! settings, name and type (`SCOPE_TTL`), the sprint it's running (`SPRINT_TTL`),
//! and the site's statuses (`STATUS_TTL`). They took five or six requests in a row
//! on every load and refresh, and rarely change. Issues are never kept: each load
//! searches them afresh, so the board still shows exactly what Jira has.

use std::collections::HashMap;
use std::time::Duration;

use super::board::{board_config, board_filter_jql, fetch_status_meta};
use super::{client, scope, JiraConnection};
use crate::helpers::ttl_cache::TtlCache;
use crate::issues::models::BoardColumn;

const SCOPE_TTL: Duration = Duration::from_secs(10 * 60);
const SPRINT_TTL: Duration = Duration::from_secs(2 * 60);
const STATUS_TTL: Duration = Duration::from_secs(30 * 60);

/// A status id's name and category.
pub type StatusMeta = HashMap<String, (String, String)>;

/// Everything about a board but its issues and its sprint.
#[derive(Clone)]
pub struct BoardScope {
    pub name: String,
    pub board_type: String,
    pub columns: Vec<BoardColumn>,
    pub filter_jql: Option<String>,
    pub sub_query: Option<String>,
    pub settings: scope::BoardSettings,
}

static SCOPES: TtlCache<BoardScope> = TtlCache::new(SCOPE_TTL);
static SPRINTS: TtlCache<Option<String>> = TtlCache::new(SPRINT_TTL);
static STATUSES: TtlCache<StatusMeta> = TtlCache::new(STATUS_TTL);

/// The site and account a cached value belongs to, so two accounts never share one.
fn site_key(conn: &JiraConnection) -> String {
    format!("{}|{}", conn.base_url(), conn.email)
}

/// The board's scope: cached, else fetched with independent requests side by side.
pub async fn board_scope(conn: &JiraConnection, board_id: i64) -> Result<BoardScope, String> {
    let key = format!("{}|{board_id}", site_key(conn));
    if let Some(scope) = SCOPES.get(&key) {
        return Ok(scope);
    }
    let board_path = format!("/rest/agile/1.0/board/{board_id}");
    let (config, board) =
        tokio::join!(board_config(conn, board_id), client::get(conn, &board_path));
    let config = config?;
    let board = board.ok();
    let field = |k: &str| {
        board
            .as_ref()
            .and_then(|b| b.get(k))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
    };
    let name = field("name").unwrap_or_else(|| format!("Board {board_id}"));
    let board_type = field("type").unwrap_or_else(|| "kanban".to_string());
    let filter = async {
        match &config.filter_id {
            Some(id) => board_filter_jql(conn, id).await,
            None => None,
        }
    };
    let (filter_jql, settings) =
        tokio::join!(filter, scope::fetch_settings(conn, board_id, &board_type));
    let scope = BoardScope {
        name,
        board_type,
        columns: config.columns,
        filter_jql,
        sub_query: config.sub_query,
        settings,
    };
    SCOPES.put(key, scope.clone());
    Ok(scope)
}

/// The board's running sprint's name, if it runs sprints (cached briefly).
pub async fn open_sprint(conn: &JiraConnection, board_id: i64, sprints: bool) -> Option<String> {
    if !sprints {
        return None;
    }
    let key = format!("{}|{board_id}", site_key(conn));
    if let Some(name) = SPRINTS.get(&key) {
        return name;
    }
    let name = scope::open_sprint_name(conn, board_id).await;
    SPRINTS.put(key, name.clone());
    name
}

/// The site's statuses, by id (cached).
pub async fn status_meta(conn: &JiraConnection) -> StatusMeta {
    let key = site_key(conn);
    if let Some(meta) = STATUSES.get(&key) {
        return meta;
    }
    let meta = fetch_status_meta(conn).await;
    // An empty answer is a failed read: try again next time rather than keep it.
    if !meta.is_empty() {
        STATUSES.put(key, meta.clone());
    }
    meta
}
