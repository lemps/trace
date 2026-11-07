import { submitLine } from "@/domains/agent/submitLine";
import { loadJournal, sendChatMessage } from "@/ipc/agentChat";
import { useAgentChatStore } from "./store";
import { summarizeTool } from "./toolSummary";
import { knownTransport } from "./transport";

// Talking to an agent from outside its view (the Inbox reply, the orchestrator's
// send_to_agent / broadcast, the session tools) the same way whichever transport
// it runs on: a chat agent gets a chat message, a terminal agent the typed line.

/** Send `text` to the workspace's running agent as a user turn. */
export async function sendToAgent(workspaceId: string, text: string): Promise<void> {
  if ((await knownTransport(workspaceId)) === "chat") {
    await sendChatMessage(workspaceId, { text, attachments: [] });
    return;
  }
  // Enter goes separately, or a long message lands as an unsent paste.
  await submitLine(workspaceId, text);
}

/** Whether the workspace's agent runs as a chat (asking the backend if not known yet). */
export async function runsAsChat(workspaceId: string): Promise<boolean> {
  return (await knownTransport(workspaceId)) === "chat";
}

/**
 * The end of a chat agent's conversation as plain text, at most `max`
 * characters: what `read_session` shows for it instead of a screen.
 */
export async function chatTail(workspaceId: string, max: number): Promise<string> {
  const store = useAgentChatStore.getState();
  let rows = store.journals[workspaceId]?.rows;
  if (!store.loaded[workspaceId]) {
    const loaded = await loadJournal(workspaceId).catch(() => []);
    store.applyRows(workspaceId, loaded);
    store.markLoaded(workspaceId);
    rows = useAgentChatStore.getState().journals[workspaceId]?.rows;
  }
  const lines: string[] = [];
  for (const row of rows ?? []) {
    const b = row.body;
    if (b.kind === "message" && b.role !== "reasoning") {
      const who = b.role === "user" ? "You" : b.role === "assistant" ? "Agent" : "Note";
      lines.push(`${who}: ${b.text}`);
    } else if (b.kind === "tool") {
      const line = summarizeTool(b.name, b.input);
      lines.push(`  · ${line.label} ${line.target} (${b.state})`);
    } else if (b.kind === "approval" && !b.resolution) {
      lines.push(`[Waiting for approval: ${b.title}]`);
    } else if (b.kind === "question" && !b.resolution) {
      lines.push(`[Waiting for an answer: ${b.questions.map((q) => q.text).join(" / ")}]`);
    } else if (b.kind === "status") {
      lines.push(`[${b.text}]`);
    }
  }
  const text = lines.join("\n");
  return text.length > max ? `…${text.slice(text.length - max)}` : text;
}
