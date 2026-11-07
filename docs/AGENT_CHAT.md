# Agent chat: a structured view for every agent

Design for showing an agent as a formatted conversation (messages, tool runs, diffs, plans,
approval and question cards, a composer) rather than a terminal, the same way for every agent
brand. Modelled on Orca's structured mode (see "Prior art" below).

## Two transports, chosen per agent

| Transport | How the agent runs | What the user sees |
| --- | --- | --- |
| **Chat** (new) | Headless, speaking a structured protocol on stdin/stdout | The chat view, built from structured events |
| **Terminal** (today) | The interactive TUI in a PTY | xterm, plus the read-only transcript view from the CLI's files |

A session or ticket agent is started as one or the other: Settings → Agents has the default and
the New session dialog can override it. They can't share one process. "Open in terminal" forks a
chat agent's conversation into a terminal agent (`--resume`), and the reverse works the same way.
How that's wired is under "Choosing and switching the transport" below.

**Billing:** a probe on 2026-11-07 (Claude Code 2.1.319) showed headless Claude on a claude.ai
login reports `apiKeySource: "none"` and the subscription's `rate_limit_event` windows, so it
draws on the subscription. This is why the transport is a per-agent choice rather than a switch.

## One journal for every brand

Every adapter turns its protocol into the same rows: `agent_session::journal` (Rust) mirrored by
`src/domains/agentChat/types.ts`. A row has a stable `id`, a `revision` that grows as it changes
(streaming text, a tool finishing, a prompt being answered), and a `body`:

| Body | Carries |
| --- | --- |
| `message` | `role` (user, assistant, reasoning, system), Markdown `text`, `streaming` |
| `tool` | `callId`, `name`, `input`, `state` (running, completed, failed), bounded `output`, `parentCallId` for subagents |
| `diff` | a file change: `path`, `change` (add, edit, delete; not `kind`, which is the body's tag), `before`/`after` or a unified `patch` |
| `plan` | a task list: items with `text` and `status` (pending, in progress, done) |
| `approval` | a permission request: tool, title, detail, options (allow once, allow always, deny), `resolution`. Answered with `{kind: "approval", optionId, note?}` |
| `question` | one or more questions with options, multi-select, free text, `resolution`. Answered with `{kind: "questions", answers: {<question id>: [labels or text]}}` |
| `status` | a notice with a tone (info, warning, error) |
| `turn` | a turn's `state` (running, completed, interrupted, failed), duration, token usage and cost |

Plans and diffs are adapter output, not UI guesses: Claude's `TodoWrite` and Codex's plan updates
both become `plan`; Claude's `Edit`/`Write` and Codex's file changes both become `diff`.

Session-wide facts (model, session id, slash commands, rate-limit windows) travel separately as
`SessionInfo`, not as rows.

## Adapters

`agent_session::AgentAdapter` is the only thing a brand implements:

- `launch(spec, sink)`: start the agent (fresh, or resuming its saved conversation) and stream
  rows into the `JournalSink`.
- `send(message)`: a user turn. While a turn runs, the UI queues it.
- `answer(request_id, answer)`: resolve an approval or question.
- `interrupt()`: stop the current turn, keep the agent. `stop()`: end it.

| Brand | Protocol | Notes |
| --- | --- | --- |
| Claude | `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio` | One long-lived process. Permissions and `AskUserQuestion` arrive as `control_request` (`can_use_tool`) and are answered with `control_response` on stdin. `--session-id` / `--resume` as today. trace's MCP tools and hooks are passed as for the terminal. |
| Codex | `codex app-server` (JSON-RPC over stdio) | `thread/start`/`resume`, `turn/start`/`interrupt`; approvals arrive as server requests. |
| Others | ACP (Agent Client Protocol) | Later: one generic adapter covers every ACP agent. |

Every process is spawned through `platform::process`; no OS checks outside `platform/`.

## Persistence

Rows are appended to `<config>/journals/<workspace id>.jsonl` (user-only, like all trace state;
there is no database). Loading keeps each id's highest revision. Reopening an agent replays its
journal; resuming it restarts the adapter against the saved conversation. Bounded payloads keep
the file small: tool output and file contents are capped, with a marker when cut.

As built (`agent_session::store`, `runtime`, `settle`):

- Streaming text isn't written until its final revision, or a long answer would be written once
  per token. It still reaches the renderer as every revision (`agent-journal`).
- A start rewrites the journal without superseded revisions once they outnumber its rows.
- Rows a vanished process left open (trace quit mid-turn) are settled: a start appends their
  ended revisions, and `load_journal` shows them ended while no agent runs. Prompts become
  cancelled, running tools failed, running turns interrupted.

## The Claude adapter, as built

`agent_session::claude`. One `claude -p … --permission-prompt-tool stdio` per agent, with the
conversation (`claude::conversations`), `--mcp-config`, `--settings` hooks, provider env and model
from `claude::launch`, the code the terminal transport uses too. Three threads: stdout and stderr
readers, and one that owns the child, its stdin and the translator, so nothing is shared or
locked. A terminal and a chat agent can't run on one workspace at once (one conversation).

The translator (`translate`) is pure and replayed in tests against recorded stream-json
(`claude/fixtures/`):

| Claude sends | Row |
| --- | --- |
| `stream_event` text / thinking deltas | `message` (assistant / reasoning), `streaming` until its block stops; the final `assistant` copy is skipped |
| `assistant` `tool_use` | `tool`, running; `parentCallId` from `parent_tool_use_id` |
| `user` `tool_result` | that `tool` completed or failed, output capped |
| … for Edit, MultiEdit, Write | plus `diff`: `before`/`after` from the input, `patch` from `structuredPatch`, Write's add vs edit from `tool_use_result.type` |
| `tool_use` TodoWrite | `plan`, one per turn (no tool row) |
| `control_request` `can_use_tool` | `approval`: allow once, one "always" option per `permission_suggestions` entry (sent back as `updatedPermissions`), deny (with the note as its message) |
| … for AskUserQuestion | `question`; the answer goes back as `updatedInput.answers`, keyed by question text, several labels joined with ", " |
| `control_cancel_request` | that prompt cancelled |
| `result` | `turn` with `usage`; `costUsd` is the turn's share of the cumulative `total_cost_usd`; interrupted if trace asked or `terminal_reason` is `aborted_*`; an error result adds a `status` |
| `system` `init`, `rate_limit_event` | `SessionInfo`: model, session id, slash commands, `unifiedWindows` limits |

Interrupt is the stream-json `control_request` `interrupt`; the process stays up. Other control
requests (hook callbacks, SDK MCP) are refused with an error response so Claude never waits on
one. Claude Code 2.1.319 has no TodoWrite tool, so its fixture is hand-made from a real turn.

## Choosing and switching the transport

**The choice.** Settings → Agents → *Shows as* is the default (Chat; stored in the renderer like
the other agent defaults). The New session dialog and the ticket's Start ▾ menu can pick the
other for one agent. Brands without a chat adapter (`agent_session::adapters::CHAT_BRANDS`, which
`chat_agent_brands` returns) always get the terminal, and those controls say so. Sessions with
Remote Control are terminals (it's a TUI feature).

**Kept with the workspace.** `agent_session::transport` stores each workspace's transport in
`transports.json` (config dir) when its agent starts, or when the New session dialog picks one
(`set_agent_transport`). A start's transport is: what the caller asked for, else the stored one,
else the terminal (the renderer passes Settings' default for a workspace that never ran). It moves
with a session linked to a ticket, and goes with a deleted session or companion (its journal too).

**Every start goes through `commands::agent::spawn_in`**, which routes by transport: a chat
agent to `agent_session::runtime::start`, a terminal one to the PTY. So the ticket start and
board kickoff (`start_agent`, which the orchestrator's `start_agent` tool reaches through the
board's kickoff), `start_session` (the session view and the MCP `start_session` tool),
`start_session_agent` (companions), the scheduled runs (always terminal) and resume-after-quit
(`resume_interrupted_agents`, the ledger records the transport) all honour it. A chat agent gets
the same model, provider and extra args as a terminal agent would, plus trace's MCP tools and
hooks (`adapters::wiring` → `claude::launch`). The kickoff brief (or, resuming a conversation
cut off by a quit, the "carry on" nudge) is sent as the first chat message once the agent is up.

**Stop, restart, state.** `stop_agent` stops either kind; `agent_running` and `live_workspaces`
include chat agents, so every Stop button, the command palette and reload adoption work
unchanged. A chat agent's exit emits `agent-run-state` and updates the interrupted ledger like a
PTY's. `chat_agent_state` returns a workspace's stored transport, whether a chat agent runs, and
its last `SessionInfo` (kept after exit), so a view mounted after a reload, or after the agent
started, shows the chat. In the renderer `agentChat/liveBridge` turns `SessionInfo.busy` and open
approval/question rows into the board's activity, the live store's ask, and the same
notifications a terminal agent's hooks and quiet timer give. The Inbox shows a chat agent's open
prompts as their chat cards (answered over stream-json; 1–9 pick an approval option) and its reply
box sends a chat message (or, with an approval open, denies it with the text as the reason). The
orchestrator's `send_to_agent` / `broadcast_to_agents` and the session tools' `send_to_session`
send chat messages to chat agents; `read_session` returns the end of the conversation.

**Restart and "Open in terminal".** The `…` menu of a ticket or session has *Restart agent*, and
*Open in terminal* (chat agent) or *Open as chat* (terminal agent, brand with a chat adapter).
Each is: stop, wait until the process is gone (`agentChat/switch.ts`), start again on the chosen
transport. Both transports key the conversation by workspace (`claude::conversations`), so the
start `--resume`s it. Switching is only offered while the agent is idle (not mid-turn, nothing
waiting on an answer). The chat journal covers only what ran as a chat; turns taken in the
terminal aren't replayed into it.

## The chat view

`src/domains/agentChat/`, shared by ticket agents and sessions:

- Rows group into turns; a finished turn folds its tool activity behind its answer.
- Tool calls pair with their output and show one summary line, expanding to the detail.
- Diff cards, plan cards, and inline approval and question cards answered in place.
- Assistant text streams in and renders as Markdown, with file links that open in an editor.
- A composer: Enter sends, messages typed during a turn queue (editable, reorderable), `/`
  lists the agent's slash commands, Esc interrupts.
- The header shows model, context and cost from `turn` rows and `SessionInfo`.

## Build order

1. The contract (this doc and the journal types).
2. In parallel: the runtime with the Claude adapter, and the chat UI against fixture journals.
3. The Codex adapter. 4. The transport setting, "Open in terminal" and resume (done; see above).
5. ACP.

Adding a brand: its adapter, then one entry in `adapters::CHAT_BRANDS` and one arm each in
`adapters::launch`, `adapters::wiring` and `adapters::resumable`. The renderer asks
`chat_agent_brands`, so its menus and Settings follow.

## Prior art

- **Orca** runs agents in structured mode (Claude through the Agent SDK, Codex through
  `app-server`, others through ACP) into one journal, and in bridge mode (a PTY, with the chat
  rebuilt from transcript files). trace's terminal transport is the bridge; this adds the
  structured one.
- **claude-orchestrator** ran Claude headless, one process per message, and showed tool calls as
  one-line activity summaries without results. It moved to the PTY for billing reasons that the
  probe above no longer shows.
