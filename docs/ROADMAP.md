# Roadmap

Features trace may build. **Wanted** items are decided; **Candidates** came from a review of
[Orca](https://github.com/stablyai/orca) on 2026-11-06 and still need a decision.

## Updating this list

- Change it in the same PR as the work: tick an item when it ships, and link the PR.
- Mark work in progress with `[~]`, and move an item between sections when a decision changes.
- Keep each item to one or two lines. Design detail belongs in the PR or ticket.

## Wanted

- [~] **Windows and Linux builds:** the current priority. See
      [the plan](WINDOWS_LINUX_PLAN.md).
- [x] **GitHub integration:** browse your repos and clone one into a folder you choose, added to
      trace's repositories and set up for agents. ([#11](https://github.com/noble1911/trace/pull/11))
      trace now holds its own GitHub token (paste, import from `gh`, or device flow), no `gh` needed.
- [ ] **Cloud VMs:** move sessions to the Vercel cloud and interact with them there, through a new
      Vercel integration. This comes after the Windows and Linux builds. A sandbox checks its repo out
      with `github::checkout::RepoCheckout` (clone at a branch with trace's token, then run setup),
      which has no desktop dependencies.
- [ ] **iPhone and Android apps.**
- [x] **Rebindable shortcuts:** Settings → Shortcuts lists every shortcut in this OS's keys and
      rebinds them, refusing keys a terminal or the system needs and ones already taken.
      ([#13](https://github.com/noble1911/trace/pull/13)) Shortcuts show in menus, tooltips, the
      search palette and a cheat sheet (`?`, Ctrl+/, the rail's keyboard button), not as chips on
      buttons unless Settings → Shortcuts' "Show shortcut hints on buttons" is on.
- [x] **Themes and appearance:** Settings → Appearance: Dark, Light, Midnight, Paper or System,
      plus accent, interface size, density, UI font, terminal scheme and cursor, reduced motion.
      ([#14](https://github.com/noble1911/trace/pull/14)) Each group shows a live preview, and
      Chat & transcript styles agent Markdown (fonts, sizes, spacing, width, code theme, tool
      activity); fenced code is highlighted.

## Candidates

### Chat and terminal views

- [~] **Switch views on the same session:** one shortcut flips a running agent between chat and
      terminal without restarting it. *Started:* a Transcript | Terminal switch in ticket and
      session chat panes, ⌘⇧T / Ctrl+Shift+T; the transcript lies over the live terminal, which
      stays mounted. Codex shows the terminal only for now.
- [~] **Formatted transcript:** messages, tool activity, visuals and file links, without the
      terminal's status lines. *Started:* prompts, Markdown replies, folded tool runs (commands,
      edit diffs, todos, results), slash commands and turn ends, tailed from Claude Code's own
      JSONL (`claude/transcript/`); file links open in an editor. Not yet: visuals, thinking,
      subagent sections, codex.
- [ ] **Chat composer that drives the terminal:** `/` commands, `@` file mentions, attachments and
      model/effort pills; half-typed terminal text carries over to chat.
- [~] **Question cards in the transcript:** answer `AskUserQuestion` and permission prompts inline.
      The Inbox has these today, but a chat view doesn't. *Started:* the chat transport
      (`agent_session/`, `domains/agentChat/`, docs/AGENT_CHAT.md) turns both into approval and
      question rows answered in place, for Claude and Codex (`agent_session/codex/`). The terminal
      transcript still doesn't.
- [~] **Queued messages:** edit or reorder messages waiting to be sent while the agent works.
      *Started:* the chat view queues messages typed during a turn (editable, removable, sent in
      order). Not yet: reordering.
- [ ] **Transcript navigation:** message rail, per-turn diffs, grouped subagent sections and rewind.
- [x] **Default view setting:** choose chat or CLI globally or per agent. Settings → Agents →
      Shows as (Chat by default; brands without a chat adapter stay Terminal), overridden per
      agent from the New session dialog or the ticket's Start menu, and kept with the workspace so
      restarts, resumes and resume-after-quit use the same one. "Open in terminal" / "Open as
      chat" moves an idle agent across, resuming its conversation (docs/AGENT_CHAT.md).

### Reviewing agent work

- [ ] **Diff annotations:** comment on specific lines and send them to the agent as one batch;
      comments follow the line as the diff changes.
- [ ] **Fix with AI:** one click sends failing checks, hook failures or merge conflicts to an agent.
- [ ] **AI commit and PR drafts:** prompt templates can be set per repo.
- [ ] **AI line attribution:** gutter markers show which lines an agent or a human wrote.
- [ ] **Stacked PRs:** create them and merge through a stack.

### Keeping agents running

- [ ] **Agents survive quitting:** a background daemon owns the PTYs through quits, updates and app
      crashes. Today trace offers interrupted agents back on the next launch.
- [ ] **Hibernation:** stop idle finished agents to save memory, and resume them when reopened.
- [ ] **Session history browser:** search past conversations from the CLI's own files, and resume
      them or copy the resume command.
- [x] **Restart chip:** one click restarts an agent that has exited, from its detail header or
      its pane, resuming the conversation.

### Visibility

- [ ] **Usage and rate limits:** status bar readout with time to reset and a warning at 80%.
- [ ] **Multiple Claude/Codex accounts:** switch accounts or run them side by side, each with its
      own login.
- [ ] **Worktree status comment:** agents post a short "what I'm doing now" note, which could show
      on board cards.
- [ ] **Cost estimates:** a stats breakdown by model.

### Workspace

- [x] **Split panes:** a detail's tabs (agents, Plan, Files, terminals) side by side or stacked,
      resizable, remembered per workspace (`domains/panes`). Tabs come with content and hide on ×
      (`panes/coming.ts`, `.claude/rules/tabs.md`); Settings → Tabs turns each off.
- [ ] **Embedded browser with Design Mode:** click an element to send its HTML, styles and selector
      to the agent. The browser itself has started: the Browser tab shows pages an agent opens with
      `open_browser` (or you do) in an isolated native webview laid over its pane (`domains/browser`,
      `src-tauri/src/browser/`). Design Mode is still to come.
- [x] **Worktree setup hooks:** run commands like `npm install` or restoring `.env` after a worktree
      is created. Per repo, in Settings → Repositories; suggested from lockfiles after a clone.
      ([#11](https://github.com/noble1911/trace/pull/11))
- [x] **Scheduled run prechecks:** a shell command decides whether a scheduled run goes ahead.
- [x] **Quick Open:** fuzzy file search within a worktree (⌘P / Ctrl+Shift+P); results open in
      the Files tab or your editor.
- [ ] **File previews:** images, PDFs and Markdown next to the agent. Images have started: the
      Gallery tab shows folders of images an agent points you at with `show_images`, with a
      full-size viewer and side-by-side compare (`domains/gallery`, `src-tauri/src/gallery/`).
- [ ] **Dictation:** speak into the prompt or terminal.
- [x] **Terminal extras:** find in scrollback (⌘F / Ctrl+Shift+F), a menu on links and file paths
      (Open, Copy, Open in editor) and on right-click, and Copy Context (the selection or last 100
      lines, headed with the agent and worktree). Theme import was left out.

## Not planned

- **Orchestration runs and task graphs:** overlaps with the trace orchestrator and agent tools.
- **SSH hosts.**
- **Plugins and 30+ agent support:** don't fit an app focused on Claude and Codex.
- **Computer use and mobile emulators:** niche for this workflow.
