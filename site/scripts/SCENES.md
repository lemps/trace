# Scene plan

How to record the clips for the homepage sections in `../features.json`.
This was checked against `main` at f904989 (8 Nov), after the design batches #58–#81.

**Every clip on the page predates those batches.** They were all recorded on 7 Nov, so
they show the old Send button, the old "Latest" text, header pills and so on. Re-record
all of them, including the scenes marked **keep**. *Keep* means the scene's script and
storyboard are still right once the shared helpers below are fixed. *Rewrite* means
the scene itself has to change. *New* means there's no scene yet.

| # | Section (`features.json` id) | Scene file | State | Recorded (9 Nov, new UI) |
|---|---|---|---|---|
| | Hero (still) | `scenes/hero.mjs` | keep | not yet |
| 1 | Agents as a chat (`chat`) | `scenes/chat.mjs` | **rewritten** | yes |
| | ↳ more: Subagents | `scenes/subagents.mjs` | keep (Explore subagents now) | yes |
| 2 | The composer (`composer`) | `scenes/composer.mjs` | **written** | not yet |
| 3 | Fleet (`fleet`) | `scenes/fleet.mjs` | keep | not yet |
| 4 | Inbox (`inbox`) | `scenes/inbox.mjs` | keep (Answer only if shown) | not yet |
| 5 | Panes, Files and Terminal (`panes`) | `scenes/panes.mjs` | keep | not yet |
| | ↳ more: Files and Quick Open | `scenes/files.mjs` | keep | not yet |
| | ↳ more: Terminal extras | `scenes/terminal.mjs` | keep | not yet |
| 6 | Plans, Browser and Gallery (`plan`) | `scenes/plan.mjs` | keep | not yet |
| | ↳ more: Gallery | `scenes/gallery.mjs` | keep | not yet |
| | ↳ more: Browser (still) | `scenes/browser.mjs` | **written** | yes |
| 7 | Tickets and pull requests (`tickets`) | `scenes/tickets.mjs` | placeholder still (needs demo Jira + GitHub) | still re-shot |
| 8 | Run it anywhere (`sessions`) | `scenes/sessions.mjs` | keep | not yet |
| | ~~↳ more: Vercel Sandbox~~ | — | dropped from `features.json` until there's a demo Vercel account | — |
| 9 | Orchestrator (`orchestrator`) | `scenes/orchestrator.mjs` | keep | not yet |
| 10 | Scheduled prompts (`schedules`) | `scenes/schedules.mjs` | **fixed** (confirm, CLI flags, grep) | not yet |
| 11 | Coming from Conductor (`conductor`) | `scenes/conductor.mjs` | **written** | yes |
| 12 | Make it yours (`appearance`) | `scenes/appearance.mjs` | keep | yes |

**Status, 9 Nov.** The helpers below are fixed (`lib/ui.mjs`), and the macOS driver
mirrors `:hover`, so hover bars and row actions show. "Not yet" scenes have run-ready
scripts but weren't recorded: the recording machine's screen locked partway, and a
hidden WKWebView page stops `requestAnimationFrame` and CSS animations, so details
stay at their first, invisible keyframe and xterm draws nothing. The runner now
refuses a hidden page. Record the rest with the screen unlocked, in this order (later
scenes reuse earlier sessions, and a Browser page or a Conductor import changes what
others show): composer, hero, panes, files, terminal, plan, gallery, sessions, inbox,
fleet, orchestrator, schedules; then `demo-setup.mjs --conductor` and conductor last.

A section's `more` clips are separate scenes with their own media (`record.mjs
subagents` and so on). The build shows whichever are recorded, and leaves a section off
until at least one is. `tickets` has a `placeholder`, so a still of the Integrations
page shows until its clip exists.

## Fix these helpers first (`lib/ui.mjs`)

These no longer match `main`. Fix them before recording anything, because most scenes
call them in `setup`.

1. **`followTurn` and `stateWords`** read `.detail-top span[aria-label]`, which is gone.
   The header's state is now a `StatusLight` pill with no aria-label:
   `.detail-top .light-pill .light-text` (`components/StatusLight.tsx:54-57`,
   `sessions/SessionHeader.tsx`). Its words are Working, Ready, Needs you, Stopped and
   No recent update. While the agent needs you, they're "Question", "Permission · <Tool>"
   or "Turn finished" (`live/ask.ts`). As it stands, `followTurn` never sees the agent
   working, so it waits out its full 240 s and marks `timeout`, never `turn ended`.
   That breaks the segments of chat, subagents, plan and gallery, and makes every seeded
   `ensureSession` take four minutes. `waitNeedsYou` reads `innerText` and still works.
   - Also, `.ac-ask .btn.primary-needs` now matches a question card's **Answer** button
     as well as an approval's **Allow once** (`agentChat/QuestionCard.tsx:97`).
     `followTurn` would click Answer with no option picked. Check for `.ac-q-option` first.
2. **`archiveSessions`** clicks `button[aria-label="Archive session"]` in the detail
   header, then an "Archive"/"Confirm" button. Neither exists now. Archive is:
   - a hover icon button labelled **Archive** in the row's `.sr-actions`
     (`sessions/SessionRow.tsx:189`); it's transparent until hover but laid out, so a
     click lands;
   - **Archive** in the row's right-click menu (`sessions/sessionRowMenu.ts:41`);
   - or a drag onto the Archived bin.

   All three archive at once, with no confirm. Archive from the Sessions list: find the
   `.session-row` whose `.sr-title` matches, hover it, and click its
   `button[aria-label="Archive"]`. As it stands, the helper throws. That breaks the setup
   of chat, subagents, plan, gallery, and of inbox and fleet (through `seedWaiting`).
3. **`resetPanes` and `ideLayout`** click `button[aria-label="claude"]`. Agent tabs are
   named from a capitalised table now, so it's **`Claude`** (`agent/providerLabel.ts:9,18`,
   `panes/PaneTab.tsx:55`). That breaks hero, panes, files and terminal.

These still work and need no change: `rail` (labels such as "Inbox, 2 need you" and
"Fleet — every running agent" still start with the page name), `pick` (New session's
fields are still `<select>`s), `sendChat` (Enter still sends), `newSession`,
`ensureStarted`, `paneMenu`, `openTab` (the ⋯ → Tabs items read "Terminal" plus a mark,
which still matches by prefix), `openSidebar`, `termPoint` and `setTheme`.

Labels a new or rewritten scene should use:
- Composer: the Send / Queue / Stop slot is one icon button, `.ac-send`. Its aria-label
  is **Send**, **Queue** while a turn runs, and **Stop** while the agent works with
  nothing typed (`agentChat/SendSlot.tsx`).
- Header Stop: `button.btn.fit`, visible text **Stop**, title "Stop the agent", no
  aria-label. "Stop agent" is only in the command palette. A Vercel session shows
  **Leave running** and **Stop & save** instead.
- A tab's ×: **Hide <Tab>** for tabs that come and go, **Close <Tab>** for the rest
  (`panes/PaneTab.tsx:76`).
- **Jump to latest**: `.jump-latest`, an icon button (`agentChat/LatestButton.tsx:23`).
- Inline confirms (`components/InlineConfirm.tsx`): the confirm button's label comes from
  its caller. For a scheduled prompt it's **Delete** again, not "Confirm delete".
- Never click a Copy button in a take: it would overwrite the recording machine's
  clipboard. Point at it instead, as the terminal scene does.

Other things to watch in `lib/`:
- `connect()` takes the first `page` target. A **Browser** tab is a native child
  webview, which can show up as a second page target. If one is open, `connect()` may
  attach to it. It's also why the Browser tab can't be recorded: a screencast of the
  main webview doesn't include it (see Plans, Browser and Gallery below).
- `record.mjs` only hides `.ac-head-limits`. The new context ring (`.ac-context`) sits
  beside it in the chat header. It's demo data, so leave it shown.

## Demo data

The demo setup is in `../README.md`: a demo config dir, plus `tinyroute` (TypeScript),
`pixelsort` (Rust) and `weatherline` (Python) with bare local origins. A few sections
need more:

| Needed for | What |
|---|---|
| composer | `<config>/trace/saved-prompts.json` with a `repro` prompt (`demo-setup.mjs` writes it; `/review` would clash with Claude Code's own command). The pasted screenshot is drawn on a canvas in the page, so nothing comes from the clipboard |
| tickets, sandbox | A **demo GitHub** account or org that owns a copy of `tinyroute`, with an Actions workflow running `node --test`. trace signed in to it (Integrations → GitHub). `gh` signed in to it too, through a demo `GH_CONFIG_DIR` set for the trace process, because PR watching still uses `gh` |
| tickets | A **demo Jira Cloud** site (free plan) with one Kanban project, e.g. `TINY`, holding three or four tickets about tinyroute. Connect it in Integrations → Jira, so the token lands in the demo config |
| sandbox | A **demo Vercel** token (Hobby). "Run on" only shows while Vercel is connected |
| conductor | `demo-setup.mjs --conductor`, and `TRACE_DEV_CONDUCTOR_DIR=<work>/conductor` (a recording build only) |

Never use your own accounts. The leak check only looks for your home folder and user
name; it can't see a real email, avatar or org. Check those frames by eye.

## Storyboards

Times are after `segments` speed-ups. Each clip is 8–12 s and under 1.5 MB.

### Hero: `hero.mjs` (still), keep

Chat | Files over Terminal: `npm test` passing below, `router.ts`'s diff on the right.
The script is unchanged; it needs the `resetPanes`/`ideLayout` fix. **Risk:** it's the
first image on the page, so re-shoot it with the new look.

### 1. Agents as a chat: `chat.mjs`, rewrite

**What's changed:** the scene's own selectors still exist. It relies on `followTurn` and
`archiveSessions` (both broken), and its storyboard has to show what's new: a table in
the reply, and the message hover bar.

1. A fresh "Router: add delete()" chat in tinyroute. The prompt is typed (1.4×), using a
   scene-local prompt: *"Add a delete() helper to Router next to get() and post(), with a
   test in test/router.test.ts. Then run npm test, and reply with a Markdown table of the
   tests and whether each passed."*
2. Read cards come in. The Edit approval card waits; pause to read it, then click **Allow once**.
3. The diff card, the `npm test` card, and the turn folding into one line.
4. The Markdown reply with its table. The pointer rests on the reply to show its hover
   bar (Copy, time), then on the table to show **Copy table**. Don't click either.

Marks: `typing`, `sent`, `approval`, `allowed`, `turn ended`, `hover`.
**Risks:** Claude may skip the table, so ask for it explicitly. Insight cards only appear
with Claude Code's explanatory output style, so don't plan on one. The approval only
appears in Ask mode; a fresh session starts there.

### 1b. Subagents: `subagents.mjs`, keep

Unchanged: two parallel subagents, two live cards, **Open beside**, the report arrives,
and the other card turns Done. It needs the `followTurn` and `archiveSessions` fixes.
Subagent rows now draw their state with `StatusLight`, so the re-take looks different.

### 2. The composer: `composer.mjs`, new

Setup: the saved prompt above. Session "Router: composer" in tinyroute, Claude, Chat,
started, with one short seeded turn so the context ring has a value (*"Read src/router.ts
and say in one line what it exports."*). Its Model, Effort and Mode back at their
defaults: set them back through the pickers, since picks are kept per workspace.

1. Click `button[aria-label^="Model:"]`; the menu opens. Pick **Opus**.
2. `Effort:` → **High**. `Mode:` → **Plan**; the pill turns accent.
3. Type `/`. The slash menu lists the agent's commands and the saved prompts. Type
   `/rep`, then Enter: the `repro` saved prompt's text fills the composer.
4. Paste a screenshot (a failing `curl` against the router, drawn on a canvas in the page). A thumbnail chip appears.
5. Enter sends. The sent bubble shows the thumbnail, the slot turns to Stop, and the
   ring in the header moves. Cut before the turn ends.

Marks: `model`, `slash`, `pasted`, `sent`.
**Risks:**
- There's no file input to set: Attach opens a native dialog. Paste by dispatching a
  `ClipboardEvent("paste", { clipboardData })` with a `DataTransfer` holding a `File`
  on `textarea.ac-input`; `composer.mjs` builds the `File` from a canvas in the page. `onPaste` reads
  `clipboardData.files` (`agentChat/Composer.tsx:130`). Try CDP
  `Input.dispatchDragEvent` as the fallback.
- A model pick while the agent runs is sent live, which can take a moment to show.
- Plan mode answers with a plan, which is fine because the clip ends at `sent`.

### 3. Fleet: `fleet.mjs`, keep

Unchanged. Five agents (ROUTER, SORTER, two waiting weatherline ones, and SORTER set
working just before the take). Try **Needs you**, **Working**, **All**; the working row
finishes in place. The filter chips now read "Needs you 2" and so on, which still match
by prefix. It needs the `archiveSessions` fix (through `seedWaiting`).

*Optional:* have the working agent call trace's `update_user` first (*"Call trace's
update_user tool with 'Reading sort.rs, 1 of 3 files', then …"*), so its row shows a
progress note. The section's copy mentions notes.

### 4. Inbox: `inbox.mjs`, keep

Unchanged. Metric is now `button.ac-q-option`, which the scene's selector already
includes. It needs the `archiveSessions` fix. **Risk:** the Inbox's own keys (J/K, 1–9)
are active while focus is in the list, so don't type there.

### 5. Panes, Files and Terminal: `panes.mjs`, `files.mjs`, `terminal.mjs`, keep

All three are unchanged and need the `resetPanes`/`ideLayout` fix.
- **panes:** chat → Files split right → Terminal moved down → `npm test` → a diff.
- **files:** All files → `src/path.ts` → Quick Open, `rtest`, Enter.
- **terminal:** `git status` → right-click a path (menu) → **Find…** → `router`.

The ⋯ menus and tab tooltips now name shortcuts, and pane chrome shows on hover; the
re-take picks that up. **Risk:** three stacked clips make this the page's heaviest
section (about 4 MB). If that's too much, fold Quick Open into `panes` and drop `files`
from `more`.

### 6. Plans, Browser and Gallery: `plan.mjs`, `gallery.mjs`, keep (never recorded)

Both scripts are valid against `main`, and need the `followTurn` and `archiveSessions`
fixes.
- **plan:** `publish_document` → the Plan tab appears with a dot → scroll → the list of
  plans slides out.
- **gallery:** four SVG icons → `show_images` → Gallery tab → full size → arrow keys.

**The Browser tab is a still** (`browser.mjs`, in `plan`'s `more`): a native child
webview isn't in a recorded clip, but the macOS driver's stills snapshot it and lay it
over the page. The scene serves a tinyroute playground on `localhost` from the runner,
opens it from the empty tab's address bar (no agent turn) and splits it right of the
chat.

### 7. Tickets and pull requests: `tickets.mjs`, rewrite (still → clip)

**What's changed:** the old scene was a still of Integrations, since the demo had no
tracker. The section now promises a ticket → agent → PR clip, so it needs a demo Jira
and a demo GitHub (see Demo data).

Setup: Board page on the demo Jira board. One ticket, e.g. TINY-2, already started
earlier: its agent has raised a PR on the demo GitHub repo, the checks have run, and
someone has left one review comment.

1. Board: columns from the Jira board; cards with keys, assignee avatars and priority.
2. Right-click TINY-3 → **Start agent**. The detail opens on its new worktree, and the
   chat starts on the kickoff prompt (cut fast).
3. Back to TINY-2's detail → its **Pull request** tab: the title, Open state,
   `workspace/tiny-2 → main`, **Checks** passing and the **Conversation** with the
   review comment. **Merge #N** waits in the header. Don't click it.

Marks: `board`, `started`, `pr`.
**Risks:**
- Dragging a card to In Progress is HTML5 drag-and-drop, which CDP mouse events don't
  trigger. Use the card's right-click **Start agent**, or `Input.setInterceptDrags` with
  `Input.dispatchDragEvent`.
- Real accounts and avatars: use demo ones only.
- PR watching polls through `gh`. Wait for the checks to show before cutting.
- Every take starts another worktree for TINY-3, so archive it between takes.

**Fallback:** keep the `placeholder` still. Or record only step 3 as the clip, from a
tinyroute session whose own agent raised the PR: a session lists only the PRs it raised.

### 8. Run it anywhere: `sessions.mjs` keep, `sandbox.mjs` new

**sessions** (keep): sort by **Started by** (the agent-started session nests under its
parent), then **Status**, then **Manual**; open the agent-started one ("Started by …" in
its header).

**sandbox** (new). Live sandboxes need a Vercel token. This plan doesn't start one:
1. Integrations → **Vercel** → the dialog's readiness checklist: "Vercel token saved
   (demo user)", "Claude login saved for sandboxes" (or its fix line), and the GitHub row.
2. Close. Sessions → **New session**. **Run on** switches from **This computer** to
   **Vercel**: Agent locks to Claude, the field becomes **Repository**, it lists only
   repos with a GitHub origin, and the note explains the sandbox.
3. **Cancel.**

Marks: `checklist`, `run on`.
*Live variant* (with time and a token): Create → the header shows "Vercel Sandbox ·
owner/tinyroute" with **Leave running** and **Stop & save**, and Details show "Sandbox
running" and the time left.
**Risks:**
- Without a token, there's no Run on at all. Then only the checklist's unconnected
  state ("No Vercel token", "Connect Vercel first…") can be shown, which is thin: skip
  the clip, and the section shows `sessions` alone.
- Only repos with a GitHub origin are offered. With the demo repos' local origins, it
  reads "No GitHub repositories", so it needs the demo GitHub copy of tinyroute.
- The checklist shows the Vercel account's name, so use a demo account.

### 9. Orchestrator: `orchestrator.mjs`, keep

Unchanged: ask **What are my agents doing?** → reply with a chart → **Stats**. It needs
Settings → Assistant → "Claude CLI (-p mode)" (still there) and the `followTurn` fix for
its seeds.

### 10. Scheduled prompts: `schedules.mjs`, rewrite (setup only)

**What's changed:** setup clicks **Delete**, then **Confirm delete**. The second button
is gone. The confirm is now an `InlineConfirm` whose button is **Delete** again
(`btn danger`). Click `button.danger` after the first Delete. **Weekly** and **Daily**
are now `role=tab` buttons, which still match. The take is unchanged: fill in "Morning
test run", Daily, allowed tools, precheck, **Schedule**, then its detail.
**Risk:** the precheck uses `findstr` (Windows). On macOS or Linux, use `grep behind`.

### 11. Coming from Conductor: `conductor.mjs`, new

1. Settings → **Repositories** → **Import from Conductor** (it shows only when a Conductor
   database is found).
2. Step 1 says to quit Conductor. Click **Conductor is closed**.
3. The preview lists:
   - **Repositories:** two repos, each with its setup script translated
     (`npm install`, a `cp $CONDUCTOR_ROOT_PATH/.env .` line as a copied file);
   - **Workspaces:** one live workspace marked **Resumable**, plus the folded archived
     ones;
   - **Saved prompts:** two custom prompts, e.g. `review` and `pr`;
   - the defaults.
4. **Import N items** → the summary: Imported, and what was skipped and why (the run
   script, archived workspaces). Then **Done**.

Marks: `preview`, `import`, `summary`.

Demo data: `demo-setup.mjs --conductor` (`lib/demo-conductor.mjs`) builds it in
`<work>/conductor`, which a recording build reads through `TRACE_DEV_CONDUCTOR_DIR`:
- `repos`: `storefront` and `docs-site`, clones of tinyroute under
  `<work>/conductor/repos`, so they're new to trace, with `storage_version` 2, setup
  and run scripts, and `review` / `pr` custom prompts;
- `workspaces`: `storefront/lisbon` live, a real worktree at `.conductor/lisbon`, and
  two archived ones with no folder;
- `sessions`: lisbon's, whose `claude_session_id` is a real one-turn `claude -p`
  conversation, so the preview marks it **Resumable**;
- `settings`: only `default_open_in`. No `conductor_api_token` or `claude_env_vars` rows.

Run `--conductor` again before each take: it rebuilds the install and forgets what the
last take imported (its sessions and catalog records); repos.json and the saved prompts
are rewritten anyway. The demo config's clone folder is `<work>/clones`, since the
default (`~/src`) showed the home folder on Settings → Repositories behind the dialog.
The transcripts live in the real `~/.claude/projects`, as every demo session's do.

### 12. Make it yours: `appearance.mjs`, keep

Unchanged: Light, Paper, Midnight, Dark → Rose → Comfortable → Standard + Violet →
Sidebar → the cheat sheet.
**Risk:** "Standard" also labels Chat & transcript's spacing and heading options. The
scene clicks the first "Standard" under `main`, which is Density today. Scope the click
to the Density group if that order changes.
