# UI review, November 2026

This review covered trace's buttons, copy, appearance, tabs and chat output, against claude-orchestrator (the previous app), Orca and Conductor. It also includes an importer for teammates leaving Conductor. Five read-only reviews of trace's code fed it, plus comparisons with those apps and a study of Conductor's data on disk. The findings below were checked against the code before batching.

## Status

The agreed batches shipped as #58–#68, then #70–#72 closed most of the remaining items, and the design-language batches (#73–#79) finished the consistency work.

**Shipped**

| Area | Item | PR |
|---|---|---|
| §1 Bugs | The cancelled-approval check mark; inline confirms for Clear activity, remove repo and reset appearance; + agent on sandbox sessions; the sandbox start hint; sandbox chat with no login; the resume toast showing a raw id | #58 |
| §1 Bugs | A shared disabled button style | #60 |
| §1 Bugs | Show all / Copy on long tool output | #59 |
| §2 Consistency | One name per action (Stop, Leave running, Disconnect, Vercel Sandbox/Join, Hide tab, Files on GitHub, PR states as words, Scheduled prompts); one `button.css`; readable text off `--fg-4`; Plug icon for connect; a shared Spinner; Tailscale shown as Preview | #60 |
| §2 Consistency | Chat state drawn with `StatusLight`; one glyph table for tools; one meaning each for Bolt and Download; "Tasks"; subagent action names; Stop only in the header | #59 |
| §2 Consistency | One meaning per glyph app-wide; the icon size scale; small icon-button tiers; `IconButton`; one tab-bar style; `InlineConfirm` everywhere; raw radii to tokens (incl. `.add-agent-btn`) | #73, #75, #77 |
| §3 Appearance | Density tokens, so Compact and Comfortable change the whole app; a compact chat layout | #60, #78 |
| §4 Chat output | Failure count in a folded turn; tall code blocks capped; Insight callouts; sent prompts fold | #59 |
| §4 Chat output | Copy on messages and tables; a message hover bar with right-click | #66, #76 |
| §4 Chat output | Attachment thumbnails | #68 |
| §4 Chat output | Context gauge | #67 |
| §5 Composer | Drafts per workspace; saved prompts | #62 |
| §5 Composer | Model, effort and permission pickers for chat agents (live where the CLI allows, otherwise from the next start) | #72 |
| §5 Composer | Send / Queue / Stop as one slot | #74 |
| §6 Remote sessions | A Vercel readiness checklist; location in the header and row; its own host chip; "Sandbox running/stopped"; sandbox state and time left in Details; the PR tab for sandbox sessions; no switch to chat without a login; stale comments fixed | #71 |
| §7 First run | Preflight checks; a three-step first run for new users | #61 |
| §8 Conductor | Import from Conductor: repos, setup, live workspaces, defaults | #63 |
| §8 Conductor | Custom prompts imported as saved prompts | #70 |
| Also | The PR tab redesigned as a centred page; PRs only shown in their tab; a session lists only PRs it raised; chat attachments; the chat box grows to fit; closable subagent tabs; the chat agent resumes after a restart; Plan documents centred | #48–#51, #57, #65 |

**Not started** (open; candidates for later work)

| Area | Item |
|---|---|
| §3 Appearance | System mode choosing a dark and a light theme; Code theme as its own group, plus syntax highlighting in Files; more accents; Mermaid following the theme; avatar hues outside the state colours; applying the scheme to Claude Code's own theme |
| §4 Chat output | Find in chat; an amber "Needs you" jump; one shared tool-row component (partly done in #59); a per-turn diff rollup |
| §5 Composer | `@` file mentions; slash command descriptions; saved prompts that run on start, and agent tools for them; pickers for terminal agents; a Codex model list and Codex plan mode |
| §6 Remote sessions | A PR the agent raises from a branch it named itself isn't found (its log stays in the sandbox); confirm time left on paid plans against a live sandbox |
| §7 First run | A base branch picker in New session |
| §8 Conductor | Archived notes as Plan documents; extra chats as companion agents; editable prompt titles |
| Upkeep | `schedules.css` is 502 lines and needs a split; `composer.css` (368) and `markdown.css` (355) are near the cap; `.status-pill` (24px) is off the three heights; `.key-btn` uses amber `--c-prog` |

The design-language follow-up (buttons, icons, symbols over words) is in [`2026-11-design-language.md`](2026-11-design-language.md). It shipped as #73–#78.

---

## Findings, as reviewed

Reviewed on the latest `main` (5c81652, v0.11.1 plus #54–#57).

**Sources**
- Five read-only reviews of trace itself:
  - chat output and tabs
  - buttons, copy and appearance
  - today's merges: remote execution, the Integrations dialogs, the PR tab
- Comparisons with claude-orchestrator (our old app) and Orca.
- A study of a Conductor install's data on disk, for an importer (§8).

The top findings were re-checked against the code before going in here.

**Overall:** trace is already ahead of claude-orchestrator on chat output and appearance, and ahead of Orca on the board, the Plan/Gallery tabs, agent tools, and having one rule for tabs. The gaps fall into four groups:

1. A handful of real bugs, mostly small.
2. The same action named or drawn three different ways.
3. The composer: no pickers, mentions or saved prompts.
4. A first-run experience: we have none.

---

## 1. Bugs to fix first

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | `agentChat/ApprovalCard.tsx:72` | A **cancelled** permission request shows a check mark next to "Cancelled", so it reads as allowed | Show `I.X` (or a neutral mark) unless the request was actually allowed |
| 2 | `agent/detail.css:111` | `.btn` has **no disabled style**, so *Raising…*, *Merging…*, *Saving…*, *Connecting…* and Tests *Run* look and hover like live buttons. Only two pages patch it in | One shared `.btn:disabled` (opacity .45, default cursor, no hover change); delete the patches |
| 3 | `activity/ActivityView.tsx:94` | **Clear** deletes the activity log in one click | Inline Cancel / Confirm (UI rule §5) |
| 4 | `settings/RepoRow.tsx:85` | Removing a repo (and its ticket mappings) has no confirm | Inline confirm |
| 5 | `settings/AppearanceSettings.tsx:128` | *Reset appearance* also wipes terminal font settings, in one click | Inline confirm |
| 6 | `sessions/SessionDetail.tsx:133` | **+ agent** is offered on Vercel sessions, but starting the agent fails: "A sandbox session can't have extra agents yet" | Disable it when `session.host` is set, with a tooltip saying why |
| 7 | `sessions/hooks/useSessionAgentRun.ts:35` | A Vercel session's start overlay says "runs in your repo root and shares your working tree", which is the opposite of the truth | Add a branch for host sessions: "Runs in a Vercel Sandbox cloned from owner/name" |
| 8 | `integrations/ClaudeLogin.tsx` | Login "None (/login)" can't work for a sandbox **chat**: it runs headless, so there's nowhere to type `/login` | Force Terminal when no login is saved, or warn in New session |
| 9 | `agentChat/ToolBody.tsx:12`, `transcript/ToolDetail.tsx` | Tool output over 40 lines loses its middle and **can't be expanded** | "Show all N lines" (as `DiffCard` has) plus Copy |
| 10 | `app/InterruptedAgents.tsx:75` | The resume-failure toast prints the raw workspace id | Use the readable title `describe()` already builds |

---

## 2. Consistency and copy

**One action, one name.**
- **Stop:** "Stop session" (ticket), "Stop claude" (session) and "Stop agent" (chat strip). A ticket in chat view shows two of them at once. Use **Stop agent** everywhere, and only in the header.
- **Agent/provider names:** the Start menu says "Claude · Kimi (Wafer)", but buttons and toasts say "Start kimi · wafer" and "Added a claude agent". Build both from one label table, capitalised.
- **Disconnect:** in the session header it means *leave running*; in Integrations it means *delete the token*. Rename the header one **Leave running**. Settle the Integrations wording on "Disconnect {name} and delete its token".
- **Vercel:** "Vercel Sandboxes", "Vercel sandbox", "in the cloud", "On Vercel", "Start on Vercel". The list says **Join**, the tooltips say **rejoins**. Use **Vercel Sandbox** the first time and **sandbox** after that, with one verb.
- **Hide vs close:** a tab's × tooltip says "Close Terminal", but per `tabs.md` it only hides the tab. Use **Hide {tab}** for tabs that come and go, and keep **Close** for subagent panes. *Close pane* uses the same × right beside it.
- **The PR tab's "Files"** opens GitHub, not trace's Files tab. Rename it **Files on GitHub**. Show PR states as words ("Merged", "Open", "Draft") rather than raw lowercase.
- **"Plan":** the TodoWrite card, the Plan tab and "Plan approval" all use the word. Call the TodoWrite card **Tasks**.
- **Scheduled vs Scheduled prompts:** the page title and the rail disagree.
- **Subtitles:** pages use three different classes instead of `.desc` (Inbox, Fleet, Board).

**Agent state drawn one way.** Subagent and tool rows say "Running", "running…", "Working…" and "waiting for you" in plain text. Route them through `StatusLight` (Working / Needs you), with Done and Failed as the only extra words.

**One glyph, one meaning.**
- `I.Bolt` means Start, a permission ask, a warning, *and* Connect / Sign in with token.
- `I.Download` means Latest and web tools.
- The Refresh icon doubles as a spinner.

**Buttons.**
- `.btn` lives in `agent/detail.css`, `.btn.danger` in `sessions.css` and `.btn.icon` in `menu.css`. Move them into one `components/button.css`, and give `.danger` a hover state.
- The Back button is a fixed 28px; everything else in the header is `--control-h` (30px).
- Modal Cancel is a ghost button in four dialogs and bordered in three.
- The chat strip's *Stop agent* is a ghost button with an `I.X` icon, inside a header.

**Readable text in `--fg-4`** (about 2.6:1 on Light): form hints (`.field .hint`, `.field-note`, including the new "Stored in a private file…" notes), PR entry times and counts, `.pr-muted`. Move readable text to `--fg-3`.

**No emoji:** the orchestrator's error text starts with ⚠️ (`orchestrator/chatStore.ts:148`).

---

## 3. Appearance settings

1. **Density only partly applies.** There are 37 hard-coded heights and many raw px font sizes: `.btn`, Settings rows, `.page-head .desc`, `pr-pane.css`, `agent/panes.css`. Compact and Comfortable leave much of the app unchanged. Finish moving these to the `--control-h*` and `--text-*` tokens.
2. **System mode only picks Dark or Light.** Let people choose which dark theme and which light theme it uses, so Midnight and Paper users can follow the OS too.
3. **"Code theme" sits under Chat & transcript**, but it applies to every code block in the app. The Files tab doesn't syntax-highlight at all. Give Code its own group and use the code theme in the file viewer.
4. **Accents:** only four, all between violet and rose. Add a teal or indigo, clear of the state colours, and preview each on a real focus ring and selection.
5. **Theme gaps:**
   - Mermaid diagrams use the library's stock themes.
   - Avatar hues span all 360°, including the amber, blue and green kept for agent state.
   - Claude Code's own TUI colours don't follow trace's theme. Offer "Apply to agents" next to the terminal scheme.

---

## 4. Chat output

- **Find in chat** (Orca has it; trace only has find in the terminal).
- **Show failures in a folded turn.** The chat fold hides that a tool failed; the transcript shows "N failed". Add the red count to `FoldHead`.
- **One tool-row component.** Chat and transcript draw the same tool differently (edit is *File* in one, *Pencil* in the other) and each has its own `toolSummary`/`trimLines`. Share the glyph table, summary, trimming and failure count.
- **Make "Needs you" impossible to miss.** When an approval or question is off-screen or in a subagent's tab, turn the Latest button amber ("Needs you · Permission · Bash") and make it jump to the ask.
- **`★ Insight` blocks** from Claude Code's explanatory style come through as raw lines. claude-orchestrator rendered them as a callout card (`MarkdownMessage.tsx`).
- **Cap tall code blocks** at about 50vh, scrolling inside (`styles/markdown.css` has no cap; the old app had one).
- **Sent bubbles** are capped at 220px and scroll inside, but the composer now grows to 75vh. Use a "Show more" fold.
- **Attachments:** sent messages name their files but show no images. Add thumbnails on the composer chips and in the sent bubble (Orca does both).
- **Context gauge:** trace has `inputTokens` but no indicator of how full the context is (Orca has a ring).
- **Diffs per turn:** a rollup of what each turn changed (Orca; already on the roadmap).

---

## 5. Composer (claude-orchestrator and Orca both beat us here)

Ranked:

1. **Model, effort and permission-mode pickers in the composer**, kept per workspace. This needs backend support for switching mid-session. It was the most-used control in the old app.
2. **Keep drafts per workspace.** Closing the detail view unmounts the composer and loses a half-written prompt. Small fix: move the draft into a store.
3. **Saved prompts**, run as `/name` from the existing slash menu, with optional run-on-start. Built-in ones: *Open PR*, *Code review*. (Conductor users have these as `custom_prompt_*`; see §8.)
4. **`@file` mentions** (on the roadmap, started).
5. **Slash command descriptions** in `SlashMenu` (it lists names only).

---

## 6. Remote sessions (Vercel)

- **Setup steps are hidden until something fails.** People only learn about the token, the Claude login, a GitHub origin and a GitHub account that can push from errors. Add a readiness checklist to the Vercel dialog, and list only GitHub-backed repos when Vercel is picked.
- **The sandbox's state only appears in tooltips.** Show "Sandbox: saved · ends in 32m" in the header or Details (the 45-minute Hobby limit is mentioned once).
- **Tailscale shows as Connected** but can't run sessions yet. Mark it *Preview*, or describe it as status only, and remove the "coming next" text.
- **The header and row show no location** for Vercel sessions. Show `owner/name` and the sandbox.
- **Chips and statuses:**
  - The "Vercel" chip uses `.session-cli`, so it reads as an agent type. Give it its own host chip.
  - Raw sandbox status ("stopped") sits next to agent states. Prefix it: "Sandbox stopped".
- **Comments out of date:** several say sandboxes are terminal-only, but the backend supports chat (`sandbox/host.rs:71`).
- **The Pull request tab is hidden** for host sessions, though the sandbox pushes to GitHub.

---

## 7. First run (from Orca)

- **Preflight checks:** explain a missing `git`, a missing `gh`, or `gh` not signed in, each with a fix.
- **A three-step first run:** default agent and view, theme, integrations. Today trace just lands on Sessions.
- **Base branch picker** in New session. Today a session always branches from `origin/<default>`.

---

## 8. Importing from Conductor

Conductor is shutting down, and teammates are moving to trace. This section is based on one developer's Conductor install. Its database was opened read-only, from a copy that has since been deleted, and no secrets were printed.

### What Conductor keeps

**`~/Library/Application Support/com.conductor.app/conductor.db`** is SQLite (sqlx, about 90 migrations). Open it only from a copy, as immutable, because the live file has a WAL.

| Table | Rows here | What matters |
|---|---|---|
| `repos` | 6 | `root_path` (the real checkout), `remote_url`, `default_branch`, `setup_script` / `run_script` / `archive_script`, `run_script_mode`, `custom_prompt_*` (general, create PR, code review, fix errors, merge conflicts, rename branch), `storage_version`, `hidden` |
| `workspaces` | 240 (238 archived, 2 ready) | `repository_id`, `directory_name` (city names like `<city>-v1`), `branch`, `state`, `initialization_parent_branch`, `intended_target_branch`, `pr_title` / `pr_description`, `notes`, `active_session_id` |
| `sessions` | 391 | **`claude_session_id`** (Claude Code's own id; 377 set), `model`, `permission_mode`, `title`, `status` |
| `session_messages` | 140,967 | The full conversation as Agent SDK stream-json (display only) |
| `settings` | 14 | `default_model`, `branch_prefix_type`, `default_open_in`. **Also two secrets: `conductor_api_token` and `claude_env_vars` (Bedrock and AWS credentials). The importer must never read these.** |

**On disk:**
- **Workspaces:** `~/conductor/workspaces/<repo>/<dir>` when the repo's `storage_version` is 3, `<root_path>/.conductor/<dir>` when it's 2.
- **Notes:** `~/conductor/archived-contexts/<repo>/<ws>/` holds `notes.md`, `todos.md` and `plans/`, and each live workspace has a `.context/` folder with the same.

**Repo config comes in three formats:**
- the DB columns
- the older `conductor.json` (`scripts.setup/run`, `runScriptMode`; found in another)
- the current `.conductor/settings.toml` (`[scripts] setup/run/archive/run_mode`; found in one repo)

The TOML files layer, from highest to lowest: `~/.conductor/settings.managed.toml` → `<repo>/.conductor/settings.local.toml` → `<repo>/.conductor/settings.toml` → `~/.conductor/settings.toml`. Files to copy into a workspace come from `file_include_globs` or `.worktreeinclude`. Scripts get `CONDUCTOR_ROOT_PATH`, `CONDUCTOR_WORKSPACE_PATH`, `CONDUCTOR_WORKSPACE_NAME` and `CONDUCTOR_PORT`.

### Can sessions be resumed?

Yes, while the transcript still exists. `claude_session_id` is a real Claude Code session id, with its transcript at `~/.claude/projects/<workspace-path slug>/<id>.jsonl`, the same place trace looks. **Claude Code deletes transcripts after 30 days by default.**

On an install last used a few months ago, every transcript had already expired and only one worktree was still on disk. A teammate who used Conductor in the last few weeks would still have both. **Teammates should import soon.**

### Mapping to trace

| Conductor | trace | How |
|---|---|---|
| `repos.root_path`, `remote_url`, `default_branch` | `repos.json` + `repo_catalog` | Copy. Skip missing paths. Handle ssh aliases like `github.com-noble1911`. |
| Setup script (DB column, then `conductor.json`, then the `settings.toml` layers) | `SetupConfig.commands` | Translate. Set the `CONDUCTOR_*` variables while trace's setup runs, so existing scripts work unchanged (Orca does this too). |
| `cp $CONDUCTOR_ROOT_PATH/x .`, `file_include_globs`, `.worktreeinclude` | `SetupConfig.copy_files` | Translate. Expand globs; keep `ln -sf` lines as commands. |
| Run / archive scripts | none | Not imported; list them in the summary. |
| `custom_prompt_*` | Saved prompts (§5.3), once they exist | Import as saved prompts; until then list them in the summary. |
| Live workspace + its active session | A `ScratchSession` (repo, `worktree: true`) + the session's Claude id | **Adopt the worktree.** `git worktree move` it to `<repo>/.worktrees/<dir>`, set `dir_overrides[sessionId] = dir` (already in `commands/repos.rs`), copy the transcript JSONL into the new path's slug folder, then `upsert_session_id`. Keep the branch name. Other sessions in the same workspace can become companions. |
| Archived workspaces | none | Skip by default. Optionally import their `notes.md` / `todos.md` / `plans/` as Plan documents. |
| `default_model`, `permission_mode`, `default_open_in` | Agent defaults, editor action | Copy. |
| `session_messages` | none | Skip. Never fabricate a transcript for `--resume`. |
| `claude_env_vars`, `conductor_api_token`, `diff_comments`, `attachments` | none | Skip. The env vars are secrets: tell the user to set up their Bedrock or AWS access again, and never read them. |

> Moving a worktree changes its path, and Claude's transcript is stored by path. That's why the transcript has to be copied too. Without it, `--resume` silently starts a new conversation. Adopting the worktree where it is would avoid the copy, but `ScratchSession` would need an absolute-path field.

### Proposed import flow

**In the app:** Settings → Repositories → **Import from Conductor**.
1. Trace detects `conductor.db`. If it isn't there, the button is hidden.
2. Ask the user to quit Conductor, since moving a worktree breaks Conductor while it's running.
3. **Preview** with checkboxes:
   - repos, with their setup translated into an editable `SetupConfig`
   - live workspaces, each marked **resumable**, **transcript missing** or **folder missing**
   - default settings
4. **Import**, then a summary of what was skipped and why: run and archive scripts, prompts, secrets.

**In the backend:** a new `src-tauri/src/conductor_import/` module.
- `db.rs`: copy the database, open it read-only and immutable, look columns up by name with `PRAGMA table_info`, and never select the settings secrets.
- `config.rs`: merge `conductor.json` and the TOML layers into a `SetupConfig`.
- `workspaces.rs`: resolve paths by `storage_version`, then trust `git worktree list` over the DB. The branches in the DB are already stale here.
- `adopt.rs`: `git_busy_check`, `git worktree move`, `dir_overrides`, copy the transcript, `upsert_session_id`.
- A thin `commands/conductor_import.rs` (`preview`, `apply`), plus `ipc/conductorImport.ts` and `domains/settings/ConductorImport.tsx`.
- New dependency: `rusqlite`.

**Risks:**
- The schema keeps changing: about 90 migrations, and some columns are marked `DEPRECATED_`. Look columns up by name and skip what's missing rather than fail.
- Transcripts expire after 30 days.
- The DB's branch, state and path fields can be stale, so check them against git.
- Repo config comes in three formats.

**Security note:** Conductor's own `conductor.db` is readable by all users (`-rw-r--r--`) and can hold cloud credentials (e.g. AWS keys in its saved Claude environment). Teammates may want to `chmod 600` it, or delete it once they've imported.

---

## Suggested order

| Batch | What | Size |
|---|---|---|
| **A: bugs** | §1 items 1–7 and 10 | small, one PR |
| **B: one name, one look** | §2: Stop/Disconnect/Vercel/Hide wording, one `button.css` with a disabled style, `--fg-4` text to `--fg-3`, glyph clean-up | medium |
| **C: Conductor import** | §8, done soon because transcripts expire after 30 days. Start with repos and setup translation (no DB needed for `conductor.json` / `settings.toml`), then the adoption of live workspaces. | medium to large |
| **D: chat readability** | Show all / Copy on tool output, failure count in the fold, tall code blocks, Insight callouts, sent-bubble fold | medium |
| **E: composer** | per-workspace drafts, then saved prompts (also the home for Conductor's custom prompts), then pickers (needs backend) | large, staged |
| **F: first run and density** | preflight, a short first run, finishing the density tokens | medium |
