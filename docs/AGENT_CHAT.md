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
| `diff` | a file change: `path`, `change` (add, edit, delete), `before`/`after` or a unified `patch` |
| `plan` | a task list: items with `text` and `status` (pending, in progress, done) |
| `approval` | a permission request: tool, title, detail, options (allow once, allow always, deny), `resolution` |
| `question` | one or more questions with options, multi-select, free text, `resolution` |
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
3. The Codex adapter. 4. The transport setting, "Open in terminal" and resume. 5. ACP.

## Prior art

- **Orca** runs agents in structured mode (Claude through the Agent SDK, Codex through
  `app-server`, others through ACP) into one journal, and in bridge mode (a PTY, with the chat
  rebuilt from transcript files). trace's terminal transport is the bridge; this adds the
  structured one.
- **claude-orchestrator** ran Claude headless, one process per message, and showed tool calls as
  one-line activity summaries without results. It moved to the PTY for billing reasons that the
  probe above no longer shows.
