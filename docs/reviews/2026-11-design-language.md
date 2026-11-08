# Design-language review, November 2026

This review is about how trace *looks and behaves*: its philosophy, buttons, icons, and where a symbol should replace a word.

Follows [`2026-11-ui-review.md`](2026-11-ui-review.md). Status: **proposed**. Batches J–N haven't started.

**Sources:** three research sessions.
- **R1** audited all 341 controls in trace's code.
- **R2** read Orca's source and style guide, and Conductor's site, docs and roughly 200 changelog entries.
- **R3** read the public guidelines and help docs for IntelliJ, Slack and Discord.

Every claim about another app is cited in the source reports. Inferences are marked there.

---

## 1. The verdict

**trace's philosophy is right. Its execution has drifted.**

All five apps share the stance trace already wrote down: *content first, quiet chrome, colour only where it means something.*
- Orca calls its identity "monochrome and quiet… its own UI should recede and frame".
- Conductor keeps removing noise: tooltips that repeat visible text, hover transitions.
- IntelliJ, Slack and Discord keep actions hidden until wanted.
- Orca and trace both use a **monochrome primary button**, not a brand colour.

**The gaps are consistency, not direction:**
- **Glyphs with several meanings.** `X` means close, remove, *delete permanently* and *stop a run*. `Check` means copied, passed, done and **Merge**. Start is drawn as both Bolt and Play.
- **Too many primary buttons.** A stopped session can show **four** of them, three of which are the same Start.
- **No shared building blocks.** There are **eight** tab-bar implementations and **nine** bespoke small icon buttons at five sizes. 11 icon buttons are unnamed on hover or to a screen reader.
- **Words where peers use symbols:** Send, Latest, Open on GitHub, Edit, Refresh, Dismiss, "3 more ⌄".
- **No right-click full list, and hover actions keyboard users can't reach.**
- **Icon sizes are ad hoc** (10–18px), and the stroke changes weight with size (0.8px at 12, 1.07px at 16).

---

## 2. trace's design principles (proposed for the `trace-ui` skill)

Rules 1–3 are new. Rules 4–10 sharpen what exists, or write down what trace already does but never stated.

1. **Content first, chrome recedes.** Secondary controls are quiet until wanted.
   - **The reveal recipe:** `opacity: 0`, shown on row `:hover`, **row `:focus-within`**, and while in a state ("Copied"). Always shown under `@media (hover: none)`.
   - **A close × keeps its slot** but is transparent until hover or focus, so labels never shift (Orca).
2. **One meaning per glyph, one glyph per meaning.** This is now enforced by a glyph table in the skill (§4 below).
3. **Symbols for universal actions, words for consequences.**
   - **Icon-only:** close, more, copy, edit, refresh, open externally, send, attach, expand/collapse, split, filter, sort, jump to latest.
   - **Words:** primary CTAs (Start, Merge #12, Raise PR, Answer), destructive confirms, anything with a count or a subtle pair (*Leave running* vs *Stop & save*).
   - **Under pressure, labels collapse to icons and are never truncated.** This is already trace's `useTabFit` rule; extend it to header buttons with a container query (Conductor does this).
4. **Every icon-only control names itself, and tooltips only name.**
   - Use an `IconButton` primitive that always sets `title`, `aria-label` and `aria-keyshortcuts`.
   - The tooltip is *name + shortcut* (IntelliJ's action tooltip: "Close Terminal (⌘W)").
   - **No tooltip that repeats visible text** (Orca and Conductor). Keep a tooltip only for a *why*: a disabled reason, a consequence, a last-updated time.
5. **One primary per screen, and the primary follows state.**
   - In the composer, Send and Stop share one slot (Orca; Conductor 0.91.0).
   - When the header has Start, empty states and the stopped band use plain buttons.
6. **The hover bar is a shortcut layer. ⋯ and right-click are the full list.** (Slack, Discord, IntelliJ.)
   - A row shows 2–4 frequent icon actions on hover.
   - Its ⋯ and right-click menus list *everything*, and are the same list.
   - A focused item takes single keys, as a later step.
7. **Busy buttons say the verb, in reserved width.** "Merging…", "Raising…", "Saving…".
   - Pre-size the button so it doesn't jump.
   - Feedback by duration (Orca):

     | Duration | Feedback |
     |---|---|
     | under 100ms | none |
     | under 1s | disabled |
     | 1–3s | the verb, or a spinner |
     | 3s and longer | stage labels |
8. **"…" on a label means it opens something more** (a dialog or a picker). Already practised; now written down.
9. **The icon scale follows the control heights.**
   - Sizes: **12** in `xs` controls, **14** in `.btn` and `sm`, **16** in the rail, nav and empty states.
   - Stroke is compensated, so it renders about 1.1px at every size.
   - **Three tiers of icon button:** `.btn.icon` 30, `.btn.icon.sm` 26, `.btn.icon.xs` 20, all `--radius-sm`.
10. **Status is shape + word, never colour alone.**
    - `StatusLight` already meets IntelliJ's rule; keep its four words.
    - Use **weight** for "new since you looked" (Slack's bold unread) and **colour + count** only for "needs you".
    - A tertiary **link-button** tier (`.link-btn`) exists for in-text toggles. Add it to the skill's control list.

---

## 3. Replace these words with symbols

| Today (text) | Where | Becomes | Glyph |
|---|---|---|---|
| **Send / Queue** | `agentChat/Composer.tsx:210` | Square primary icon button. **The same slot becomes Stop** while busy with an empty draft. Tooltip "Send (↵)" / "Queue (↵)" | `I.Send` · new `ListPlus` · `I.Stop` |
| **Latest** ×2 | `LatestButton.tsx`, `TranscriptView.tsx:127` | A round "jump to present" pill | `I.ArrowDown` |
| **Open on GitHub** | `prs/PrPane.tsx:40` | Icon-only, "Open on GitHub" | `I.External` |
| **Files on GitHub** | `prs/PrPane.tsx:43` | Icon-only, or under ⋯ | new `FileDiff` |
| **Open in your browser** ×2 | `BrowserNotice.tsx:34`, `NativePage.tsx:21` | Icon-only | `I.External` |
| **Open in ▾** | `files/ViewerHeader.tsx:47` | Icon + caret (today it's the `Code` glyph) | `I.External` |
| **Dismiss** ×2 | `BrowserNotice.tsx:24,38` | Icon-only | `I.X` |
| **Edit** | `ScheduleDetail.tsx:79`, `SavedPromptRow.tsx:46` | Icon-only, as the session rows already do | `I.Pencil` |
| **Refresh** | `WorktreeSettings.tsx:69` | Icon-only, as the Board topbar does | `I.Refresh` |
| **Play** (sound preview) | `NotificationSettings.tsx:138` | Icon-only | `I.Play` |
| **Restore** | `ArchiveBin.tsx:53` | Icon-only (its sibling Delete already is) | new `ArchiveRestore`, **not** `Back` |
| **One / Side by side / Swipe** | `gallery/ViewerBar.tsx:34` | Icon segmented control | new `Square` · `I.Compare` (unused today) · new `MoveHorizontal` |
| **Reset order / Reset to opened order** | `InboxView.tsx:114`, `FleetView.tsx:85` | One ghost icon button, one name | new `RotateCcw` |
| **"3 more ⌄"** (tab overflow) | `panes/PaneTabStrip.tsx:161` | Chevron + mono `+3`, aria "3 more tabs" | `I.Chevron` (not `More`, which means pane actions) |
| **Stop agent** (header) | `DetailHeader.tsx:149`, `SessionRunButton.tsx:71` | **Stop** at normal width; icon-only when the header is narrow | `I.Stop` |
| **Raise PR** (header) | `DetailHeader.tsx` | Words at normal width; icon-only when narrow | `I.GitPR` |
| `✓ passed` / `✗ exit`, `Saved ✓` | `TestsPane.tsx:51`, `AssistantSettings.tsx:119` | Real glyphs instead of text characters | `I.Check` / `I.X` |

**Keep as words:** Start, Merge #12, Raise PR (at normal width), Answer, Save, Create, Cancel, every destructive confirm, *Leave running* / *Stop & save*, "Show 12 earlier" and "Show all N lines".

---

## 4. The glyph table: one meaning each

| Meaning | Glyph | Fixes |
|---|---|---|
| Close or dismiss (reversible) | `X` | Stop using it for delete and stop |
| **Delete permanently** | new **`Trash`** | `ArchiveBin`, `SavedPromptRow`, `SectionGroup`, `ScheduleDetail` |
| Stop a run or agent | `Stop` | `RunViewer.tsx:79`, `ScheduleDetail.tsx:92` (today `X`) |
| **Start or run** an agent, tests, a preview | `Play` | Retire `Bolt` for Start (the header, `StartPrompt`, `AgentPane`). Batch D already moved chat to Play. |
| **Merge** | new **`GitMerge`** | `DetailHeader.tsx:66`, `PrsView` (today `Check`) |
| Done, passed, copied | `Check` | No longer Merge, Remove merged or Tasks |
| Reload, re-check | `Refresh` | Not restart (use `Play`/`Stop`) or reset |
| **Reset to default, undo order** | new **`RotateCcw`** | `ShortcutRow.tsx:80`, Fleet and Inbox reset |
| **Restore from archive** | new **`ArchiveRestore`** | `ArchiveBin` (today `Back`) |
| Back navigation | `Back` | |
| Open outside trace | `External` | Every "Open in…/on GitHub/in browser" |
| Files tab, code | `Code` | Not "Open in" or PR files |
| PR diff on GitHub | new **`FileDiff`** | |
| Pull request | `GitPR` | Delete the duplicate `PR` (rail) |
| Epic | new **`Layers`** (or similar) | `board/Card.tsx:106` (today `Branch`) |
| Import ↓ / Export ↑ | `Download` / `Upload` | `ConductorImport.tsx:46` uses `Upload` for import. Flip it. |
| Integrations, connect | `Plug` | Sign in with GitHub gets `I.GitHub` (or a key) |
| **Prune:** `Dot3` (= `More`, 0 uses), `Forward` (= `Chevron`), `SidebarLeft` (0 uses). Wire or drop `Compare`. | | |

---

## 5. Interaction model

1. **The message hover bar** (`agentChat/MessageRow.tsx`, `chat.css`).
   - Today it has Copy only, and it's revealed only by the button's own focus.
   - **Becomes:** Copy on every message, plus **Edit into composer** (`I.Pencil`, via `composerFill`) on your own messages. Show the timestamp at `--fg-3`.
   - **Reveal:** on `.ac-msg:focus-within`, and always under `hover: none`.
   - **Right-click** offers the same list, plus *Copy as plain text*.
   - *Later:* Rewind and Fork, when the backend supports them (Orca has both).
2. **Right-click is the full list on rows:** session rows, board cards and chat tabs. Build each from the same items as its ⋯ menu (`agentMenu.ts`, `editorItems`).
3. **Tab tooltips name their shortcut:** "Terminal (⌘3)", in `PaneTabStrip.tsx:106` and `ChatTabs`, with `aria-keyshortcuts`. Do the same for the rail buttons.
4. **Pane chrome on hover:** the pane strip's × and ⋯ show on strip hover/focus and always on the focused pane (IntelliJ New UI). Right-click on a tab stays the other path.
5. **Compact density changes the chat's layout, not just its scale:** tighter message gaps, the Thought row inline, the user bubble full width (Slack and Discord compact).
6. **"New since you looked"** shows as a **bold** session title once its agent finished a turn you haven't opened. The amber count stays for Needs you only.

---

## 6. Structure and consistency

- **One primary per screen:**
  - A stopped session keeps the header **Start**. The pane's empty-state Start and the chat's stopped band become plain buttons, or the band goes.
  - The same applies to the ticket's `StartPrompt`, and to the empty Sessions and Scheduled pages.
- **Header order** is status → primary → secondary. **Raise PR** moves after Start/Stop (`DetailHeader.tsx:145`).
- **Tab bars:**
  - Fold page tabs (`.tab-bar`, `.ib-tabs`, `.orch-tabs`) onto `.detail-tabs`.
  - Inbox's state filter becomes `.filter-chip`, as Fleet's is.
- **Destructive confirms all use `InlineConfirm`.** Eight files hand-roll it today, and `ScheduleDetail` has a third pattern.
- **Legacy cleanup:**
  - The inline red `run.error` line becomes a toast or banner (`SessionDetail`).
  - The five `style={{marginTop: 6}}` empty-state buttons become a class.
  - 77 raw `border-radius` values become tokens.

---

## 7. What not to take

| From | Skip | Why |
|---|---|---|
| Orca | its 11-state agent dot | trace's four words are a strength. **Maybe** add one shape, "No recent update" (a dashed ring), for a live agent whose hooks went quiet. It's more honest than a stale Working. |
| Discord | its look, presence icons and 3-step density naming | Its brand rules forbid imitating them, and trace's `StatusLight` is its own |
| Conductor | the playful brand layer (city names, train sounds), and hold-⌘ for numbers | Conductor itself removed hold-⌘ (0.89.0) |
| Orca | ⌘J as a jump palette | trace's ⌘J is the orchestrator |

---

## 8. Proposed implementation batches

| Batch | Scope | Size |
|---|---|---|
| **J: Glyph system** | §4 table: add `Trash`, `RotateCcw`, `ArchiveRestore`, `GitMerge`, `FileDiff`, `ListPlus`, `Layers`, `Square`, `MoveHorizontal`; prune the duplicates; fix every multi-meaning use. Icon size scale and stroke compensation (`iconBase.tsx`). `.btn.icon.sm` / `.xs`, migrating the 9 bespoke small buttons. An `IconButton` primitive that fixes the 11 naming gaps. | medium-large |
| **K: Symbols over words** | §3 table. The composer's Send↔Stop slot. The Latest pill. The overflow chevron. The header collapsing to icons when narrow. | medium |
| **L: Interaction model** | §5: the message hover bar and its right-click, right-click full lists on rows, shortcut tab tooltips, pane chrome on hover, the close × keeping its slot | medium |
| **M: Consistency and rules** | §6, plus writing §2's ten principles and §4's glyph table into `.claude/skills/trace-ui/SKILL.md` | medium |
| **N: Density and unread** *(optional)* | Compact chat layout, the bold "new since you looked" title, the "No recent update" shape | small-medium |

**Order and conflicts:** J goes first, because K and L use its glyphs and `IconButton`. K and L can then run in parallel, by file. M can run beside J if it stays out of `Icon.tsx`.
