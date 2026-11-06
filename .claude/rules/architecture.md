# Architecture rules

## File-size discipline (the point of this project)

- Soft target **≤ 250 lines**; hard cap **~400 lines**. At the cap, split before adding.
- Heuristics for *what* to split out:
  - A JSX block that renders an independent piece of UI → its own component file.
  - Repeated stateful logic → a hook (`src/domains/<d>/hooks/useX.ts` or `src/hooks/`).
  - A pure transform → a function in a small domain module (e.g. `columns.ts`), unit-testable in isolation.
  - A Rust concern that can be named in one phrase → its own module file.
- `App.tsx` (< ~150 lines) and `lib.rs` are shells. If you're adding logic there, you're adding it in the wrong
  place.

## Frontend: domain folders

- `src/domains/<domain>/` owns a feature. Typical contents: `types.ts`, `store.ts` (Zustand slice), component
  files, optional `hooks/`. Typed backend calls live in `src/ipc/<area>.ts`, **not** inside the domain.
- **Cross-domain imports** use the absolute alias `@/domains/<other>`. **Within a domain**, use relative paths.
- **No barrel files** (`index.ts` that only re-exports). Import from the source module directly.
- Shared, domain-agnostic primitives live in `src/components/` (e.g. `Icon`, `AgentAvatar`, `StatusPill`,
  `Modal`).

## IPC boundary

- All Tauri `invoke` calls go through typed wrappers in `src/ipc/`. Each wrapper names the command, types its
  args, and types its return. Components/hooks import these wrappers — they never pass stringly-typed command
  names around.
- Backend events (`pty-output`, `pty-exit`, etc.) are subscribed via a small typed listener helper, not raw
  `listen` scattered through components.

## State management

- **Client/session state:** Zustand stores, one slice per domain (`src/domains/<d>/store.ts`). No prop-drilling
  marathons, no 30-`useState` god component.
- **Server (issue-tracker) data:** fetch through the typed wrappers in `src/ipc/issues.ts`; cache in a store.
  Do **not** keep fetched issue data in ad-hoc `useState`.
- **A module holding state ends with `import.meta.hot?.accept(() => location.reload())`** (stores, and singletons
  like `terminalRegistry`). Without it, a hot update creates a second copy of the state while subscribers stay on
  the first, which looks like a real bug (an agent stuck on Working after Stop).
- **No localStorage effect-pairs.** If something must persist, wrap it once in a hook — don't sprinkle
  `useEffect(() => localStorage.setItem(...))` (a documented anti-pattern from the old project).

## Backend: modules + thin commands

- `commands/*.rs` contain only `#[tauri::command]` functions that validate inputs, call into a domain module,
  and map errors to `Result<T, String>`. No business logic.
- Domain logic lives in `claude/`, `issues/` (+ the `jira/` and `pylon/` provider modules), `git.rs`; shared
  mutable state in `state.rs` (`AppState`).
- Register every command in the single `invoke_handler!` list in `lib.rs`.
- New persistence goes through `helpers::persist` (atomic `0600` writes, safe reads, locked `update`s): no bare
  `fs::write` of state, and no load-then-save outside `update`.
- Rust concurrency (carried over from the old project's hard-won lessons):
  - Use `std::thread::spawn` for Claude/PTY pump threads, not `tokio::spawn` (avoids runtime conflicts).
  - Never hold two `RwLock`/`Mutex` guards at once — clone what you need, drop the guard, then take the next.

## Adding things

- **New command:** add `#[tauri::command]` in the right `commands/*.rs`, register in `lib.rs`, add a typed
  wrapper in `src/ipc/`, call the wrapper from the frontend.
- **New domain:** create `src/domains/<name>/` with `types.ts`/`store.ts`/components as needed; its backend
  calls go in a new `src/ipc/<name>.ts`.
- **New shared type (TS):** co-locate with its domain and `export` it; only truly global types go in a shared
  module.
