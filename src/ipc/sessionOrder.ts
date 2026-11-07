import { invoke } from "@tauri-apps/api/core";

// Each Sessions-page list's sort and manual order (`commands/session_order.rs`),
// stored beside the sessions. A list is a section id, or `tab:<id>` (`tab:` for
// the default tab) for a tab's unsectioned area.

export interface StoredSessionList {
  sort: string;
  order: string[];
}

export interface StoredSessionOrder {
  lists: Record<string, StoredSessionList>;
}

/** Every list's sort + order, with gone sessions and sections dropped. */
export function listSessionOrder(): Promise<StoredSessionOrder> {
  return invoke("list_session_order");
}

/** Save one list; returns it as stored (unknown ids dropped, unknown sort = manual). */
export function setSessionList(
  key: string,
  sort: string,
  order: string[]
): Promise<StoredSessionList> {
  return invoke("set_session_list", { key, sort, order });
}
