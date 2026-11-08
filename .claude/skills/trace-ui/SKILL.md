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
the control's height and corner (`StatusLight size="lg"`).

**Which control** (all in `components/button.css` unless named):

- **`.btn`** — any action. `.btn.success` merges, `.btn.danger` destroys,
  `.btn.primary-needs` answers an agent that needs you.
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
- **`.seg`** (`Segmented`) — mutually exclusive view options (card density).
- **`.filter-chip`** — a toggleable filter (Board, Fleet, Inbox), with `aria-pressed`.
- **`InlineConfirm`** — every destructive action (§5). `ConfirmPrompt` is its armed
  half, for one triggered from a menu.
- **No panel toggles in headers.** A side panel's own strip is its toggle (§3).

**Icon or word.**

- **Icon-only:** close, more, copy, edit, refresh, open externally, send, attach,
  expand/collapse, split, filter, sort, jump to latest, reset order.
- **Words:** primary actions (Start, Merge #12, Raise PR, Answer), destructive
  confirms, anything with a count or a subtle pair (*Leave running* vs *Stop & save*).
- **Under pressure, labels collapse to icons, never truncate** (`useTabFit` for tabs;
  a container query for header buttons).
- **"…" on a label means it opens more** — a dialog or a picker ("Choose a file…").
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

Variants: `dot` (tabs, compact lists), `word` (list rows), `pill` (cards, rows,
inbox), `pill` + `size="lg"` (detail headers). Never draw agent state with ad-hoc
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
  rail button while the view is selected (~350ms rest, slides back on leave;
  `RailRecents`, `.rail-group`). One surface per job; no columns docked beside the rail.
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

**Lists of agents** keep a stable order (opened order, or the user's drag): state
changes recolour a row, never move it. Reorderable rows show `I.Grip`; ⌥↑/⌥↓ does
the same from the keyboard; "Reset to opened order" is one ghost `RotateCcw`
(`live/ResetOrderButton`).

## 4. Type, space, icons

- Type tokens: `--text-title` 18 · `--text-detail-title` 15 · `--text-body` 13.5 ·
  `--text-ui` 12.5 · `--text-meta` 11.5 · `--text-label` 10.5. Section labels are
  `--text-label`, uppercase, `letter-spacing: 0.08em`, `--fg-3`.
- `--font-mono` for keys, ids, branches, paths, counts, ages and diffs; Geist for
  everything else.
- Text colour: `--fg-0` titles, `--fg-1` body, `--fg-2` secondary, `--fg-3` meta.
  `--fg-4` is ~3:1 on the dark surfaces — decoration and disabled only.
- Spacing steps 4 · 6 · 8 · 10 · 12 · 16 · 20; rows 36–46px; card padding 10×12.

**Icons** are `I.*` from `components/Icon.tsx` only (glyphs live in `iconsNav`,
`iconsActions`, `iconsCode`, `iconsViewer`): stroked, no emoji, no inline SVG — add a
glyph to its family file. **Sizes follow the control heights** (`ICON_SIZE` in
`components/iconScale.ts`): **12** in `xs` controls and in-row pills, **14** in `.btn`
and `sm` controls, **16** in the rail, nav and empty states. The stroke is compensated
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
| Task list | `ListChecks` | `Check` |
| Import ↓ / Export ↑ | `Download` / `Upload` | |
| Integrations, connect | `Plug` | |
| Sign in with GitHub / with a token | `GitHub` / `Key` | `Plug` |
| One / side by side / swipe (Gallery) | `Square` / `Compare` / `MoveHorizontal` | words |
| AI, the assistant | `Sparkles` | |

## 5. States and affordances

- **The reveal recipe** for secondary row actions: `opacity: 0`, shown on row
  `:hover`, row `:focus-within`, and while in a state ("Copied"); always shown under
  `@media (hover: none)`. A close × keeps its slot but is transparent until hover or
  focus, so labels never shift.
- **The hover bar is a shortcut layer; ⋯ and right-click are the full list.** A row
  shows 2–4 frequent icon actions on hover; its ⋯ menu and its right-click menu list
  everything, built from the same items (`agentMenu.ts`, `editorItems`).
- Anything hover-revealed also has a visible or keyboard path (an always-visible
  Start, a row's open arrow as well as double-click).
- Empty: a dashed box with one plain sentence that says what would fill it
  (`.ib-empty`, `.col-empty`, `.fl-empty`); full-page ones use `.empty-state`, whose
  action is a plain `.btn.empty-action` when the header has the primary.
- **Destructive actions confirm inline with `InlineConfirm`** (message, Cancel, the
  verb), never a dialog and never a hand-rolled Cancel / Confirm pair or a two-click
  button.
- Errors go to `toast.error` with the reason, not a bare red line.

## 6. Where code goes

- Shared primitives (`StatusLight`, `SidePanel`, `Modal`, `PopMenu`, `Icon`,
  `IconButton`, `InlineConfirm`, `Spinner`) live in `src/components/`;
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
- [ ] No new raw hex/oklch/px where a token exists; titles use the type tokens.
- [ ] Tab rows are `.detail-tabs`; filters are `.filter-chip`.
- [ ] Destructive actions use `InlineConfirm`; busy buttons say the verb in reserved width.
- [ ] Hover-only actions reveal on `:focus-within` and under `hover: none`, and have another path.
- [ ] Navigation is in the rail, context in the right-edge `SidePanel`, one side panel at most.
- [ ] Empty and error states say something useful.
- [ ] A workspace tab that comes and goes follows `.claude/rules/tabs.md` (`panes/coming.ts`): × hides, never deletes.
- [ ] `npx tsc --noEmit` and `npx @biomejs/biome check src` pass.

Legacy to migrate when you touch it (don't copy): raw `font-size` px values,
inline `oklch(... / alpha)` literals, `.thinking`/`.waiting`, and `--c-prog`/`--c-warn`
for agent state. Raw radii left on purpose: 1–3px drop lines and bars, miniature
previews, and avatars (their corners scale with their size).
