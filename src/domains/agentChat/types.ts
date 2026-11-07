// The journal: every chat agent's conversation, whatever its brand. Mirrors
// src-tauri/src/agent_session/journal.rs and mod.rs; keep the two in step.
// See docs/AGENT_CHAT.md.

/** One row, upserted by `id`; a higher `revision` replaces a lower one. */
export interface JournalRow {
  id: string;
  revision: number;
  /** Order of first appearance. */
  seq: number;
  /** Unix milliseconds. */
  at: number;
  turnId?: string;
  body: JournalBody;
}

export type JournalBody =
  | ({ kind: "message" } & Message)
  | ({ kind: "tool" } & ToolCall)
  | ({ kind: "diff" } & FileDiff)
  | ({ kind: "plan" } & Plan)
  | ({ kind: "approval" } & Approval)
  | ({ kind: "question" } & QuestionSet)
  | ({ kind: "status" } & Status)
  | ({ kind: "turn" } & Turn);

export type Role = "user" | "assistant" | "reasoning" | "system";

export interface Message {
  role: Role;
  /** Markdown. */
  text: string;
  /** True while text is still arriving. */
  streaming: boolean;
}

export type ToolState = "running" | "completed" | "failed";

export interface ToolCall {
  callId: string;
  /** The agent's own tool name ("Bash", "Edit", "shell", …). */
  name: string;
  input: unknown;
  state: ToolState;
  /** Capped result text. */
  output?: string;
  /** Set when a subagent made this call. */
  parentCallId?: string;
}

export type ChangeKind = "add" | "edit" | "delete";

export interface FileDiff {
  callId?: string;
  path: string;
  /** Named `change`, not `kind`: `kind` is the body's own tag. */
  change: ChangeKind;
  before?: string;
  after?: string;
  patch?: string;
}

export type PlanStatus = "pending" | "inProgress" | "done";

export interface Plan {
  items: { text: string; status: PlanStatus }[];
}

export type ApprovalKind = "allowOnce" | "allowAlways" | "deny";

export interface ApprovalOption {
  id: string;
  label: string;
  kind: ApprovalKind;
}

export type Answer =
  | { kind: "approval"; optionId: string; note?: string }
  /** Per question id: chosen option labels, or typed text. */
  | { kind: "questions"; answers: Record<string, string[]> };

export type Resolution = { state: "answered"; answer: Answer } | { state: "cancelled" };

export interface Approval {
  requestId: string;
  callId?: string;
  tool: string;
  title: string;
  detail?: string;
  options: ApprovalOption[];
  resolution?: Resolution;
}

export interface Question {
  id: string;
  header?: string;
  text: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
  allowFreeText: boolean;
}

export interface QuestionSet {
  requestId: string;
  questions: Question[];
  resolution?: Resolution;
}

export type Tone = "info" | "warning" | "error";

export interface Status {
  text: string;
  tone: Tone;
}

export type TurnState = "running" | "completed" | "interrupted" | "failed";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd?: number;
}

export interface Turn {
  turnId: string;
  state: TurnState;
  durationMs?: number;
  usage?: Usage;
}

/** A user turn. */
export interface UserMessage {
  text: string;
  /** Absolute paths of attached files or images. */
  attachments: string[];
}

export interface LimitWindow {
  name: string;
  /** 0–1. */
  utilization: number;
  /** Unix seconds. */
  resetsAt?: number;
}

/** Facts about the running agent that aren't rows. */
export interface SessionInfo {
  agent: string;
  model?: string;
  conversationId?: string;
  slashCommands: string[];
  busy: boolean;
  limits: LimitWindow[];
}

/** Events the backend emits, one per agent. */
export interface JournalEvent {
  workspaceId: string;
  rows: JournalRow[];
}

export interface SessionInfoEvent {
  workspaceId: string;
  info: SessionInfo;
}
