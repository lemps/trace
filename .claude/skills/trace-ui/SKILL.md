---
name: trace-ui
description: trace's design language — tokens, the three control sizes, which control to use for what, the glyph table, where panels go, how agent state is drawn. Load before any change to trace's UI (components, CSS, layout, a new screen or control), and use its checklist before calling UI work done.
---

# trace UI

trace is a dense, dark, keyboard-friendly tool for supervising many agents at once.
Its UI should read as **one system**: same heights, same corners, same words, and
colour reserved for state. When a screen looks "off", it is almost always one of the
rules below being broken — fix it by applying the rule, not by tuning pixels.

Three rules sit above the rest:

1. **Content first, chrome recedes.** Secondary controls stay quiet until wanted (§5's
   reveal recipe).
2. **One meaning per glyph, one glyph per meaning** (§4's glyph table).
3. **Symbols for universal actions, words for consequences** (§1).

Tokens live in `src/styles/tokens.css`. **Never hardcode a hex, oklch or px value a
token already names** — in CSS or inline styles.

**Themes.** Dark is only the default: `styles/themes.css` redefines the base tokens for
Light, Midnight and Paper (Settings → Appearance, `domains/appearance`), so never assume a
dark background. A tint is `color-mix(in oklch, var(--token) N%, transparent)`, not an
`oklch(… / a)` literal; text on a bright fill (avatars, the amber answer button) is
`--on-bright` / `--on-needs`; a top sheen is `--sheen`, a scrim `--overlay`. Anything
painted with literal colours (xterm, Vega, mermaid) re-reads on `useThemeKey()` or
subscribes to the appearance store. Check a UI change in a light theme too.

## 1. Controls: three heights, one corner

Every interactive control is one of three heights, so any row of them lines up:

| Token | Size | Used for |
|---|---|---|
| `--control-h` | 30px | buttons, icon buttons, split buttons, a header's status pill |
| `--control-h-sm` | 26px | filter chips, segmented controls, toolbar filters, pane strips |
| `--control-h-xs` | 20px | pills and icon buttons inside cards and list rows |

Corners: controls `--radius-sm` (6px); inline chips in text (`.kbd`, counts, code,
tags) `--radius-xs` (4px); cards `--radius` (10px); columns and panels `--radius-lg`
(14px). Only *state* pills are fully round (999px) — and in a header even they take
the control's height and corner (`StatusLight size="lg"`). The one other round thing
is the floating jump-to-latest pill (`agentChat/LatestButton`), which is also the one
control allowed to float over content.

A header you click to expand (a thought, a tool run, a diff, a subagent card) is a
control: `--control-h`, not a row height of its own. A row of controls is one tier
end to end — the composer's Attach, pickers and Send are all `--control-h`.

**Which control** (all in `components/button.css` unless named):

- **`.btn`** — any action. `.btn.success` merges, `.btn.danger` destroys,
  `.btn.primary-needs` answers an agent that needs you (its Deny is a plain `.btn`).
  Worded buttons have the same tiers as icon buttons: `.btn` 30, **`.btn.sm`** 26
  (pane strips, in-content toolbars, 36px rows), **`.btn.xs`** 20 (inside cards and
  dense rows). Never hand-make a small button.
- **`.btn.primary` — one per screen, and it follows state.** The header's Start
  becomes Stop while it runs; the composer's Send and Stop share one slot. When the
  header (or a page head) has the primary, the empty states and bands below it use
  plain `.btn` — an empty state's action is `.btn.empty-action`.
- **`IconButton`** (`components/IconButton.tsx`) — *the* icon-only control. `label`
  (required) is both its tooltip and `aria-label`; `shortcut` adds the chord to the
  tooltip ("Close (⌘W)") and `aria-keyshortcuts`; `size` picks the tier; `className`
  adds `ghost`, `danger` or a domain class. Never hand-roll a `.btn.icon`.

  | Tier | Size | Where | Glyph |
  |---|---|---|---|
  | `md` (`.btn.icon`) | 30 | headers, page toolbars | 14 |
  | `sm` | 26 | pane strips, in-content toolbars, beside chips | 14 |
  | `xs` | 20 | inside rows, chips and inputs | 12 |

  All three are `--radius-sm`. A toggle sets `aria-pressed`, which lights it in the
  accent while on.
- **`.btn.ghost`** — only in dense in-content toolbars (Refresh, Reset order). Never
  in a header row beside bordered buttons — that's what made headers look mixed.
- **`.link-btn`** — the tertiary tier: an underlined in-text toggle or escape hatch
  (StartPrompt's "Start fresh conversation"). Never the main way to do something.
- **`Segmented`** (`.seg`, `components/segmented.css`) — mutually exclusive view
  options (card density, a run's views). 26px outside to outside. Never a hand-written
  `.seg` or a private switch.
- **`FilterChip`** (`components/FilterChip.tsx`) — a toggleable filter (Board, Fleet,
  Inbox), with an optional `count`. `--control-h-sm` and `--radius-sm`: a chip is a
  control, so it has the control's corner, which keeps it distinct from a round state
  pill. Its on state is `aria-pressed`.
- **`SplitButton`** — a main action plus a caret that opens its choices (Start ▾, the
  composer's Send now ▾, a table's copy). **`MenuCaret`** is the one dropdown caret,
  inside it or after a picker's label; never a hand-rotated `Chevron`.
- **A menu trigger** sets `aria-haspopup="menu"` and `aria-expanded`, and looks
  pressed while open (`menu.css`). `MoreTrigger` takes `open` and `size`.
- **Menus** are `PopMenu` (from a trigger) or `ContextMenu` (at a point); both draw
  the shared `MenuList`. A disabled item's reason goes in `MenuItem.detail`, never in
  its label.
- **`InlineConfirm`** — every destructive action (§5). `ConfirmPrompt` is its armed
  half, for one triggered from a menu.
- **No panel toggles in headers.** A side panel's own strip is its toggle (§3).

**Icon or word.**

- **Icon-only:** close, more, copy, edit, refresh, open externally, send, attach,
  expand/collapse, split, filter, sort, jump to latest, reset order. A composer's
  Send is icon-only even though it's the primary: the slot is universal.
- **Words:** primary actions (Start, Merge #12, Raise PR, Answer), destructive
  confirms, anything with a count or a subtle pair (*Leave running* vs *Stop & save*).
- **A control that shows a value is text** ("Opus 5.5 · High", "Accept edits"),
  optionally led by a glyph naming the setting; actions and on/off switches are icons.
- **Under pressure, labels collapse to icons, never truncate** (`useTabFit` for tabs;
  a container query for header buttons, and for a composer's pickers, which step
  down to glyphs as it narrows: `agentChat/agentOptions.css`).
- **"…" on a label means it opens more** — a dialog or a picker ("Choose a file…",
  "New session…"). Not for an inline form, an inline confirm or a find bar.
- **Busy buttons say the verb, in reserved width**: "Merging…", "Raising…",
  "Saving…", pre-sized so the row doesn't jump. By duration: under 100ms nothing;
  under 1s disabled; 1–3s the verb or a `Spinner`; 3s and longer, stage labels.

**Tooltips only name.** An icon-only control's tooltip is *name + shortcut*. Never a
tooltip that repeats visible text; keep `title` for a *why* — a disabled reason, a
consequence, a last-updated time (`IconButton`'s `title` prop is only for that).

**Shortcut hints go where people look for them, not on every button.** Menus
(`MenuItem.hint`), the search palette's and Quick Open's rows and footers, Settings →
Shortcuts, the top search box's one chip, and the cheat sheet (`domains/cheatSheet`,
`?` / Ctrl+/) show them as `.kbd`. A button, tab or header names its shortcut in its
tooltip: `IconButton`'s `shortcut`, or `useTitleWithHint(label, id)` +
`aria-keyshortcuts={useAriaKeys(id)}` on a worded button. For learners, `<KeyHint id=… />`
puts the chip back on the button only while Settings → Shortcuts' "Show shortcut hints
on buttons" is on. No always-visible hint lines ("↵ sends · Esc interrupts"). Users can
rebind shortcuts, so never type a key: take the label (`useHint(id)`) and the key check
(`isShortcut(id, e)`) from `src/platform/shortcuts.ts`. A new shortcut is an entry in
`src/platform/shortcuts/definitions.ts`; `⌘` chords are `Ctrl+Shift` off macOS.

## 2. Agent state is drawn one way: `StatusLight`

`src/components/StatusLight.tsx` + `status-light.css`, fed by the live store
(`domains/live`). Four states, four colours, same words everywhere — **shape + word,
never colour alone**:

| State | Token | Look | Word |
|---|---|---|---|
| attention | `--state-needs` (amber) | blinking dot | **Needs you** — or the ask: "Permission · Bash", "Question", "Plan approval" |
| working | `--state-working` (blue) | spinner | **Working** |
| ready | `--state-ready` (green) | solid dot | **Ready** |
| stopped | `--state-stopped` (grey) | hollow ring | **Stopped** |
| working, quiet (a look, not a state: `quiet` prop, `live/quietStore`) | `--state-stopped` (grey) | still dashed ring | **No recent update** — nothing heard for `QUIET_AFTER_MS` (10m); not while background tasks run |

Variants: `dot` (tabs, compact lists), `word` (list rows), `pill` (cards, rows,
inbox), `pill` + `size="lg"` (detail headers). State is drawn once per row: a row
whose first column is its light names the ask beside its title with `word` +
`dotless`, not a second pill. Never draw agent state with ad-hoc
text or colour (`.thinking`/`.waiting` are legacy). Tracker status (To do / In
review) is `<StatusPill>` — a different thing; don't mix them.

**Colour means state.** Amber/blue/green are reserved for agent state. Violet
(`--c-accent`) is the brand: focus rings, selection, drop indicators, epics, a toggle
that's on. PR and CI state use outlined `.pr-pill` chips so a green check never reads
as "agent ready". Diff `+`/`−` use `--state-ready` / `--c-danger`. "New since you
looked" is **weight** (a bold title); **colour + count** is only for Needs you.

## 3. Layout: left navigates, right explains

```
┌──────┬───────────────────────────────────────────┬─────────────┬──┐
│ rail │ topbar / page or detail                    │ side panel  │  │
│ 56px │                                            │ Det. | Orch.│  │
│ ⌂    │                                            │  — or —     │▕ │ ← folded strip,
│ ◉ ── ┼─▶ recents flyout (rest on Sessions)        │             │  │   vertical label
│      │                                            │             │  │
└──────┴───────────────────────────────────────────┴─────────────┴──┘
```

- **Left = navigation, and it lives in the rail.** The rail is 56px of icons and
  badges. A view's own navigation (recent sessions) is a flyout from that view's
  rail button while the view is selected, once the user turns it on (it's off by
  default; Settings → Sidebar sets it and the rest before it slides out; it slides
  back on leave; `RailRecents`, `.rail-group`). One surface per job; no columns docked beside the rail.
- **Right = the helper beside your work**: one `<SidePanel>` (`components/SidePanel`)
  docked on the window's right edge, showing **one view at a time**:

  | Where | Views |
  |---|---|
  | Session | Details (once it has a PR or started sessions) · Orchestrator |
  | Ticket | Details (next step, workspace, ticket) · Orchestrator |
  | Board, Sessions page | Orchestrator (`app/PagePanel`) |
  | Inbox, Fleet, others | none — they have their own detail area, or don't need it |

  Open, its header has a tab per view; closed, it folds to a `--side-w-closed` strip
  naming each view vertically (with counts), so the strip *is* the toggle. State comes
  from `useSidePanel(place, views)`. ⌘J shows/folds the orchestrator in whichever panel
  is in front. Render it as the last child of `.detail` or `.main`. Nothing floats over
  content — no FABs or floating windows.
- **Never two pull-out panels**, and never panels on both edges for the same view.

**Detail header** (`.detail-top`), left to right:
`← <page it returns to>` (`BackButton`; Esc in its tooltip) · identity (mono key, title
at `--text-detail-title`) · *right group:* status (`StatusLight size="lg"`) → primary
action → secondary actions → `…` (`MoreTrigger`). All `--control-h`, gap 8px.

**Pages** (`.page` / `.page-head`): `h1` at `--text-title`, a one-line `.desc`, actions
right-aligned. **Every tab row is `.detail-tabs` / `.detail-tab`** — a detail's panes,
a page's tabs (Settings, Pull requests, Sessions) and the orchestrator's; a page insets
it to 24px. A state filter is `.filter-chip`s, not tabs. Esc closes a detail (not from
inside a terminal or while a modal/menu is open); ⌘1–9 switch its tabs.

**Settings** (`domains/settings/`): a tab is `SettingSection`s (a section label in a
fixed `--control-h` head, `actions` right — a reset there is an `InlineConfirm` — then an
optional description) holding `SettingRow`s, never an `h2` that repeats the tab's name.
A row whose option another rules out stays mounted: `inactive` + `inactiveReason`
dims it, makes its control `inert` and swaps its hint for the reason in the same cell,
so changing an option never moves the page. A textarea, key field or wide control is
`SettingRow block` (control full width beneath), not a hand-made block. Inputs there
are `--control-h`, like the buttons beside them (`--control-h-sm` in a list's rows);
there's no taller input tier. The page body keeps `scrollbar-gutter: stable` and
starts each tab at the top; the tabs are words, so a narrow window sends the last to
`TabMore` (`useTabFit`) rather than folding them to icons.

**A detail has exactly three rows above its content:** the header, the pane tabs, and
one 36px fact strip that follows the tab (an agent's `ChatHeader`; a subagent's
`SubagentBar`, in the same place and metrics). An agent's subagents are pane tabs
right after it, one run with it, the divider after the last. Never a second tab row
inside a pane.

**Lists of agents** keep a stable order (opened order, or the user's drag): state
changes recolour a row, never move it. Reorderable rows show `I.Grip`; ⌥↑/⌥↓ does
the same from the keyboard; "Reset to opened order" is one ghost `RotateCcw`
(`live/ResetOrderButton`).

## 4. Type, space, icons

- Type tokens: `--text-title` 18 · `--text-detail-title` 15 · `--text-body` 13.5 ·
  `--text-ui` 12.5 · `--text-meta` 11.5 · `--text-label` 10.5. Section labels are
  `--text-label`, uppercase, `letter-spacing: 0.08em`, `--fg-3`.
- **The scale is a hard rule, and a test enforces it** (`styles/typeScale.test.ts`):
  a font size is one of those tokens — never `calc()` on a token, never a raw px, never
  an inline `fontSize`. Between two tokens, pick one.
- Agent output and what you type to an agent (chat, transcript, plan documents, the
  composer's input) take their font, size and line height from `--chat-*` (Settings →
  Appearance → Chat & transcript), via `.md.prose` — not from `--text-body`.
- `--font-mono` for keys, ids, branches, paths, counts, ages and diffs; Geist for
  everything else.
- Text colour: `--fg-0` titles, `--fg-1` body, `--fg-2` secondary, `--fg-3` meta.
  `--fg-4` is ~3:1 on the dark surfaces — decoration and disabled only.
- Spacing steps 4 · 6 · 8 · 10 · 12 · 16 · 20; rows 36–46px; card padding 10×12.
  Pages, dialogs, tab panes and the side panel use 14px and 18px as their container
  padding: those are the container values, not violations of the control/row scale,
  and stay as they are.

**Icons** are `I.*` from `components/Icon.tsx` only (glyphs live in `iconsNav`,
`iconsActions`, `iconsCode`, `iconsViewer`): stroked, no emoji, no inline SVG — add a
glyph to its family file. **Sizes follow the control heights** (`ICON_SIZE` in
`components/iconScale.ts`): **12** in `xs` controls and in-row pills, **14** in `.btn`
and `sm` controls, **16** in the rail, nav and small in-panel empty states, **28**
(`ICON_SIZE.empty`) in a full-page or full-pane `.empty-state`. The stroke is compensated
(`strokeFor`) so every size draws ~1.1px; don't pass `stroke`.

**One meaning per glyph.** Pick by meaning; if none fits, add a glyph rather than
borrowing one:

| Meaning | Glyph | Not |
|---|---|---|
| Close or dismiss (reversible) | `X` | delete, stop |
| Delete permanently | `Trash` | `X` |
| Stop a run or agent | `Stop` | `X` |
| Start, run, restart (agent, tests, Run now, preview) | `Play` | `Bolt` |
| An action the orchestrator proposes | `Bolt` | Start |
| Merge | `GitMerge` | `Check` |
| Done, passed, copied, selected | `Check` | merge |
| Failed, error, warning | `Alert` | `X` |
| Denied, cancelled; *Don't ask* mode (refuses what isn't allowed) | `Ban` | `X` |
| Edit (a name, a message, a file); *Accept edits* mode | `Pencil` | |
| *Ask* mode: asks before edits and commands | `Hand` | `Alert` |
| *Full access* mode: runs everything without asking | `ShieldAlert` | `Alert`, a colour |
| *Auto* mode: permissions checked for it | `ShieldCheck` | `Check` |
| Permissions; a mode with no glyph of its own | `Shield` | |
| An agent's model and effort (the composer's pill, collapsed) | `Sliders` | `Settings`, `Sparkles` |
| A tool call with no glyph of its own | `Wrench` | `Code` |
| Reload, re-check | `Refresh` | restart, reset |
| Reset to default, undo an order | `RotateCcw` | `Refresh` |
| Restore from the archive | `ArchiveRestore` | `Back` |
| Back navigation | `Back` | restore |
| Expand, disclose, forward, "N more" | `Chevron` (rotated) | `More` |
| More actions (⋯) | `More` | overflow |
| Open outside trace (browser, GitHub, editor) | `External` | `Code` |
| Files tab, code | `Code` | "Open in…" |
| A PR's diff on GitHub | `FileDiff` | `Code` |
| Pull request | `GitPR` | |
| Epic | `Layers` | `Branch` |
| Branch, worktree | `Branch` | epic |
| Queue a message | `ListPlus` | |
| Slash commands (the composer's `/` menu) | `Slash` | `Code` |
| Task list | `ListChecks` | `Check` |
| A plan: the Plan tab, its documents, *Plan* mode | `Plan` | `ListChecks` |
| Import ↓ / Export ↑ | `Download` / `Upload` | |
| Integrations, connect | `Plug` | |
| Sign in with GitHub / with a token | `GitHub` / `Key` | `Plug` |
| One / side by side / swipe (Gallery) | `Square` / `Compare` / `MoveHorizontal` | words |
| AI, the assistant | `Sparkles` | |

## 5. States and affordances

- **The reveal recipe** for secondary row actions: `opacity: 0`, shown on row
  `:hover`, row `:focus-within`, and while in a state ("Copied"); always shown under
  `@media (hover: none)`. A close × keeps its slot but is transparent until hover or
  focus, so labels never shift. Write the rules that show it at least as specific as
  the one that hides it (`.btn.icon.x:hover`, not `.x:hover`), or it goes clear under
  the pointer. A control in its own strip (a code block's copy, in
  the block's head) may instead rest quiet at 60%; one laid over content (a table's
  copy) follows the recipe.
- **The hover bar is a shortcut layer; ⋯ and right-click are the full list.** A row
  shows 2–4 frequent icon actions on hover; its ⋯ menu and its right-click menu list
  everything, built from the same items (`agentMenu.ts`, `editorItems`). A row
  declares one list of `RowAction`s and `useRowMenu` + `RowBar` / `RowMore` /
  `RowMenuPopover` (`components/RowMenu.tsx`) draw all three from it: session rows,
  board cards, Fleet and Inbox rows. The menu is laid beside the row, never inside it.
- Anything hover-revealed also has a visible or keyboard path (an always-visible
  Start, a row's open arrow as well as double-click).
- Empty: a dashed box with one plain sentence that says what would fill it
  (`.ib-empty`, `.col-empty`, `.fl-empty`); full-page ones use `.empty-state`, whose
  action is a plain `.btn.empty-action` when the header has the primary.
- **Destructive actions confirm inline with `InlineConfirm`** (message, Cancel, the
  verb), never a dialog and never a hand-rolled Cancel / Confirm pair or a two-click
  button.
- **Changing an option never moves the page under the pointer.** The Settings page
  keeps Standard density whatever the setting (`appearance.css` pins the tokens; the
  previews carry `data-density` and show it). An option never mounts or unmounts a
  row: it makes it inactive (`SettingRow`'s `inactive`, dimmed, reason in the hint's
  place). Previews sit in fixed-height frames (`appearance/previews/PreviewFrame`), so
  bigger text shows less. Typed values (font names, sizes) apply on Enter or blur,
  never per keystroke; Escape restores the applied value.
- Errors go to `toast.error` with the reason, not a bare red line.
- Chat cards: `--border-faint` around the agent's own activity (tools, diffs,
  subagents, reports); a card you act on is the amber `.ac-card.ac-ask`, whose head
  says what it is with a `StatusLight` pill ("Permission · Bash", "Question",
  "Plan approval"). Every "answer the agent" surface (the chat's cards, the Inbox's,
  the terminal view's answer bar) is neutral (`--bg-1`) with a `--state-needs-border`
  border and the attention pill: no amber tint behind the content. The Inbox shows
  the chat's own card, once, never framed in a second one.
- The two chats and the transcript are one design: the orchestrator's chat and the
  Transcript view reuse the agent chat's pieces (`PromptBubble`, `WorkingRow`,
  `DiffCard`, `PlanCard`, `LatestButton`, `summarizeTool`, `formatDuration`). Change
  the piece, not a copy.

## 6. Where code goes

- Shared primitives (`StatusLight`, `SidePanel`, `Modal`, `PopMenu`, `ContextMenu`,
  `MenuList`, `RowMenu`, `SplitButton`, `MenuCaret`, `Icon`, `IconButton`, `InlineConfirm` (with a
  `size` for rows), `FilterChip`, `Segmented`, `BusyLabel`, `BackButton`, `Spinner`)
  live in `src/components/`;
  reuse them before writing a look-alike.
- A domain's CSS lives in its folder and is imported once in `src/main.tsx`; class
  names are prefixed per domain (`ib-`, `fl-`, `rs-`). Keep CSS files under the
  ~400-line cap like everything else.
- Inline `style={{}}` only for genuinely dynamic values (a width, a computed colour).

## Before you call UI work done

- [ ] Every control in a row shares a height token and `--radius-sm`; no raw radius a token names.
- [ ] One `.btn.primary` on the screen; empty states and bands under it are plain.
- [ ] Icon-only controls are `IconButton`s (named, tier by place); tooltips name or say why, never repeat text.
- [ ] Each glyph means what §4's table says; icons are 12 / 14 / 16 by place, with no `stroke`.
- [ ] Words only for primaries, confirms and counts; labels collapse to icons, never truncate.
- [ ] Agent state uses `StatusLight`; colour appears only for state, accent or diff.
- [ ] No new raw hex/oklch/px where a token exists; every font size is a plain type token.
- [ ] Tab rows are `.detail-tabs`; filters are `FilterChip`; small worded buttons are `.btn.sm` / `.btn.xs`.
- [ ] Menu triggers set `aria-expanded`; carets are `MenuCaret`; disabled reasons are in `detail`.
- [ ] Destructive actions use `InlineConfirm`; busy buttons say the verb in reserved width.
- [ ] Hover-only actions reveal on `:focus-within` and under `hover: none`, and have another path.
- [ ] Navigation is in the rail, context in the right-edge `SidePanel`, one side panel at most.
- [ ] Empty and error states say something useful.
- [ ] A workspace tab that comes and goes follows `.claude/rules/tabs.md` (`panes/coming.ts`): × hides, never deletes.
- [ ] `npx tsc --noEmit`, `npx @biomejs/biome check src` and `npm test` pass.

Legacy to migrate when you touch it (don't copy): inline `oklch(... / alpha)` literals, `.thinking`/`.waiting`, and `--c-prog`/`--c-warn`
for agent state. Raw radii left on purpose: 1–3px drop lines and bars, miniature
previews, and avatars (their corners scale with their size).
