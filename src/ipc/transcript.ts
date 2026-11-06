import { invoke } from "@tauri-apps/api/core";

// Typed wrapper around `commands/transcript.rs`: an agent's conversation, read
// from Claude Code's own transcript file (never parsed from the PTY screen).

/** One piece of the conversation (`claude::transcript::TranscriptItem`). */
export type TranscriptItem =
  | { kind: "prompt"; id: string; text: string; at: string | null }
  | { kind: "reply"; id: string; text: string; at: string | null }
  | {
      kind: "toolCall";
      id: string;
      toolUseId: string;
      name: string;
      /** The call's arguments, long strings clipped. Shape depends on the tool. */
      input: unknown;
      at: string | null;
    }
  | { kind: "toolResult"; id: string; toolUseId: string; text: string; isError: boolean }
  | { kind: "command"; id: string; text: string }
  | { kind: "notice"; id: string; text: string }
  | { kind: "turnEnd"; id: string; durationMs: number };

export interface TranscriptPage {
  /** The Claude conversation these items belong to. */
  sessionId: string;
  /** Where the next read starts. */
  offset: number;
  /** The items replace what the caller holds instead of extending it. */
  reset: boolean;
  items: TranscriptItem[];
}

/**
 * Read a workspace's conversation from `offset` on (0 and `sessionId: null` on a
 * first read). Null until the agent has a conversation on disk; codex never does.
 */
export function readTranscript(
  workspaceId: string,
  sessionId: string | null,
  offset: number
): Promise<TranscriptPage | null> {
  return invoke("read_transcript", { workspaceId, sessionId, offset });
}
