import { createContext, useContext } from "react";

// What every card in one chat view shares, so it isn't threaded through each row.

export interface ChatView {
  workspaceId: string;
  /** The workspace's directory, so paths inside it show relative to it. */
  root: string | null;
  /** Open every collapsible card (the fixture page's screenshot mode). */
  expandAll: boolean;
}

export const ChatViewContext = createContext<ChatView>({
  workspaceId: "",
  root: null,
  expandAll: false,
});

export function useChatView(): ChatView {
  return useContext(ChatViewContext);
}

/** An absolute form of a path an agent wrote, relative ones taken from the workspace. */
export function resolvePath(path: string, root: string | null): string {
  if (!root || /^([a-zA-Z]:[\\/]|[\\/])/.test(path)) return path;
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${path.replace(/^\.[\\/]/, "")}`;
}
