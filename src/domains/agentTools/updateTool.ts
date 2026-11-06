import type Anthropic from "@anthropic-ai/sdk";
import { setLiveUpdate } from "@/domains/live/sync";

const MAX_CHARS = 200;

// Lets an agent say how a long task is going, on the Fleet page, without ending its turn.
export const UPDATE_USER: Anthropic.Tool = {
  name: "update_user",
  description:
    "Tell the user how a long-running task is going, in one short line such as \"Migrated 40 of 200 tables\". It shows beside this agent on trace's Fleet page in place of its last message, and stays there until you send another or a new prompt arrives, so finish with one that says how it ended. It doesn't notify the user or wait for them, so don't use it to ask a question.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "One short line: what's done, or what's happening." },
    },
    required: ["message"],
  },
};

/** Run `update_user` for the agent that called it. */
export function runUpdateUser(input: unknown, caller: string): string {
  const raw = (input as { message?: unknown } | null)?.message;
  const message = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!message) throw new Error("Give a message to show the user.");
  if (!caller) throw new Error("trace couldn't tell which agent this update is from.");
  setLiveUpdate(
    caller,
    message.length > MAX_CHARS ? `${message.slice(0, MAX_CHARS - 1)}…` : message
  );
  return "Shown on the Fleet page.";
}
