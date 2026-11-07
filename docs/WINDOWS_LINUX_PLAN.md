# Windows and Linux builds

Plan for shipping trace on Windows and Linux. The code work is done and passes CI on all three
operating systems. **What's left needs real machines and a release**, which are the unticked items
below.

## Goal

A release publishes installers for macOS, Windows and Linux, and all the core features work on each:
agents, worktrees, turn tracking, tools, notifications and in-app updates.

**Out of scope:** moving sessions to the Vercel cloud, mobile apps, WSL-hosted agents and ARM builds
for Windows and Linux.

## Where it stands

**Proven on real Windows and Linux machines in CI** (`.github/workflows/cross-platform.yml`):

- The backend compiles and its tests pass, and the frontend builds
- Installers build: NSIS on Windows, AppImage and `.deb` on Linux, kept as run artifacts
- The built app starts and stays running on both, and shows its first screen on Windows
- `trace-hook` reaches trace from Git Bash
- JSON arguments reach a CLI installed by npm, from a folder with a space in its name
- A pseudo console only ends its reader once closed, which `watch_for_exit` relies on
- Other users are shut out of the Windows config folder, even if its parent lets them in
- git handles paths past 260 characters, and `git diff --no-index /dev/null` works

**Open problem: the Linux window never appears in CI.** The process keeps running, but its window
stays 10×10 and unmapped under Xvfb, with or without a window manager, `WEBKIT_DISABLE_DMABUF_RENDERER`
or `WEBKIT_DISABLE_COMPOSITING_MODE`. It could be specific to CI or a real bug, and nothing at startup
looks like it blocks. A real Linux desktop settles it, so check that first.

**Proven by hand on Windows 11** (a dev build, 2026-11-06), with no tracker connected:

- A real `claude` agent runs in a session: typing, Stop, resume, and resume after a crash
- Claude Code runs trace's hooks through Git Bash, so turns are tracked
- The agent tools reach trace over loopback MCP
- `codex` starts from its npm `.cmd` and runs in the pseudo console
- A worktree, its folder and its branch are removed right after its agent stops
- Diffs (including new files), the Terminal tab, Open in VS Code and sounds work

**Not proven until someone runs it:** the rest of the smoke test below, in particular everything that
needs a tracker, and this branch hasn't been run as an app on macOS.

## Architecture: ports and adapters

OS differences sit behind ports, the same way `issues::IssueProvider` hides Jira and Pylon. Domain
code asks for what it needs and never knows which OS it's on.

```
src-tauri/src/platform/
├── mod.rs          # picks the adapter for this build
├── ports.rs        # one trait per concern, with no OS code
├── process.rs      # the one place a process gets created
├── paths.rs        # pure path logic, testing Windows' rules on every OS
├── acl.rs          # pure SDDL reading, so the config folder check is tested on every OS
├── unix.rs         # shared by macOS and Linux
├── macos.rs        # only what differs from unix
├── linux.rs        # only what differs from unix
├── windows.rs
└── windows_acl.rs  # the config folder's ACL, part of the windows adapter
```

| Port | What it covers | Used by |
| --- | --- | --- |
| `ProcessHost` | Spawn setup, check a pid is alive, stop a process tree, PTY exit | `platform::process`, `claude/pty.rs`, `interrupted.rs` |
| `ToolLocator` | Find `claude`, `git`, `gh`, `npm`, and how to run one in a PTY | `claude/discovery.rs`, `claude/pty.rs`, `commands/tests.rs` |
| `AgentEnvironment` | The agent's starting env, extra `PATH` dirs, default shell | `claude/env.rs`, `claude/pty.rs` |
| `AgentBridge` | Install `trace-hook` and `trace-render`, paths the hook shell reads | `claude/hooks.rs`, `claude/render_bridge.rs` |
| `PrivateFiles` | User-only files and folders | `helpers.rs`, `helpers/persist.rs` |
| `SoundPlayer` | List and play notification sounds | `commands/sound.rs` |
| `EditorLauncher` | Open a folder in an editor | `commands/editor.rs` |

**Rules:**

- **Ports only where behaviour differs:** path normalization and conversation slugs are pure
  functions with per-OS test cases. The scheduler lock needed no port, as std's `File::try_lock` works
  everywhere, and a badge the OS can't show just fails quietly.
- **Build-time selection:** only one adapter is compiled per build, with no `dyn` or runtime OS
  checks. Tests can pass a fake adapter to domain code (`claude/discovery.rs` does).
- **Share Unix code:** macOS and Linux use `unix.rs`, and override only what really differs.
- **Enforced, not just documented:** `scripts/check-platform-boundary.sh` keeps OS checks, `std::os::*`
  and `libc` in `platform/`, and Clippy's `disallowed-methods` blocks direct `Command::new` elsewhere.

**Frontend:** `src/platform/` holds the same idea at a smaller scale: `paths.ts`, `sounds.ts`, and
`shortcuts.ts` for keys and hints. Components never check the OS themselves.

## Decisions

**Still open:**

1. **Who tests Linux:** Ron is testing Windows on a second machine. Linux still needs a desktop or a VM.

**Made:**

2. **Hook relay on Windows:** the existing bash scripts, under Git Bash. CI shows they run there; a
   real agent still has to confirm Claude Code runs its hooks through it.
3. **Shortcuts:** off macOS, `Ctrl` belongs to the terminal, so app shortcuts and terminal copy and
   paste use `Ctrl+Shift+`. Tab numbers stay `Ctrl+1–9`.
4. **Credentials on Windows:** the same files, in a folder only the user, `SYSTEM` and Administrators
   can read. That matches `0600` on Unix, which doesn't stop root either.
5. **Windows signing:** ship unsigned internally, and sign before going public.
6. **Linux packages:** AppImage and `.deb`, built on Ubuntu 22.04 to run on older glibc versions. Only
   the AppImage updates itself; a `.deb` is updated by reinstalling it.
7. **CI:** a separate workflow from PR CI, run by hand, on `port/**`, and on pushes to `main` that
   touch platform code.
8. **Sounds:** each OS's own player rather than playing in-app, which adds no dependencies. Windows
   plays `.wav` only.

## Phases

### Phase 0: See real errors

- [x] Add the cross-platform workflow, building and testing on all three operating systems.
- [x] Replace the macOS-only rules in `CLAUDE.md` and `.claude/rules/agents.md` with the
      architecture rules above.
- [x] Record what the audit missed. It was two bugs on Windows: a pseudo console doesn't report
      exit, and `cmd.exe` cuts JSON arguments at `&`. Both are fixed and tested.

### Phase 1: Ports and adapters

- [x] Add `src-tauri/src/platform/` with the ports and adapters, built together rather than via stubs.
- [x] Move domain code onto the ports, replacing every direct `Command::new`, and make `libc`
      Unix-only.
- [x] Add the pure path and slug helpers, tested with Windows and Unix inputs.
- [x] Add `src/platform/` for `basename` and shortcuts, replacing the duplicate `basename` helpers.
- [x] Turn on the CI checks for the architecture rules.
- [ ] Pass the smoke test on macOS. Everything moved behind a port, so this needs a run before merging.

### Phase 2: Linux

- [x] Add the `linux` adapter: install locations, sounds and editors.
- [x] Build AppImage and `.deb` packages.
- [x] Remove the AppImage's own variables (`LD_LIBRARY_PATH`, `APPDIR`) from what trace spawns.
- [ ] Confirm the window appears on a real desktop (see the open problem above), then check WebKitGTK
      rendering, including xterm and Wayland.
- [ ] Pass the smoke test on Ubuntu, plus one other distribution.

### Phase 3: Windows

- [x] Hooks and `trace-render` under Git Bash.
- [x] The `windows` adapter, including finding and launching `.cmd` installs of `claude`, `codex`,
      `git` and `gh`, config folder ACLs, and stopping an agent's process tree.
- [x] Claude's Windows conversation slug, written from the known format.
- [x] Long paths (`core.longpaths`) for git commands trace runs.
- [x] Pass over a git built on MSYS2 or Cygwin (devkitPro puts one first on `PATH`): it wrote
      worktree `.git` files as `/home/...` paths that Git for Windows, editors and `gh` can't follow.
- [x] Build the NSIS installer.
- [x] Check removing a worktree right after its agent stops, as Windows locks files in use. It
      worked first time, so no retry was needed.
- [x] Lock down the config folder only once: an already restricted folder is left alone, rather
      than every ACL under it, scratch sessions included, being rewritten at each launch.
- [ ] Pass the smoke test on Windows 11.

### Phase 4: Release

- [x] Split `release.yml` per OS, keeping the Mac assets as they are.
- [x] Merge each OS's part into one `latest.json`, so one OS's failure can't publish a partial update.
- [ ] Run `release.yml` for real. It can't be tried without a tag, so it's unproven until the first
      release, which is on hold.
- [ ] Test an update from one release to the next on each OS, which also needs a release.
- [x] Add install steps to the README, and update its requirements, badge and security section, once
      there's a release to install.

**Done when:** publishing a tag ships all three platforms, and in-app updates work on each.

## Smoke test

Get installers from the latest run of the Cross-platform workflow. Run on each platform, with `claude`
and `codex` installed the usual way for that platform.

- [ ] Connect a tracker and load a board.
- [ ] Start an agent from a card: it gets a worktree, and typing and resizing work.
- [ ] Stop the agent, and let another exit on its own: both show as stopped.
- [ ] Turn tracking works: lights change, and a question reaches the Inbox.
- [ ] Agent tools work, and `trace-render` shows a card in the HTML tab.
- [ ] Quit mid-task: the agent is offered back and resumes its conversation.
- [ ] Diffs, tests, open in editor and the PR view work.
- [ ] A scheduled prompt fires, with two trace processes running.
- [ ] Notifications and sounds play.
- [ ] Shortcuts work, copy and paste work in the terminal, and neither takes keys from it.
- [ ] Removing a worktree works, including right after its agent stops.
- [ ] Credential files can't be read by another user account.

## Still to verify

These can't be settled in CI, so check them during the smoke test:

- ~~Whether Claude Code runs hooks through Git Bash, and finds `trace-render` on its `PATH`~~ Yes, both
- ~~Claude's exact conversation slug on Windows~~ Right: resume finds the conversation
- ~~How Codex behaves in a pseudo console~~ Fine: it draws and takes input like Claude
- Whether notifications need an installed app on Windows, so dev builds may not show them
- Whether WebView2's own shortcuts (`Ctrl+R` reloads, `Ctrl+F` finds) get in the way
- A non-npm `.cmd` tool still runs through `cmd.exe`, which can split arguments at `&`

## Developing on Windows

- **Clone outside the config folder** (`%APPDATA%	race`). trace locks that folder down on its first
  launch, and the permission changes look like file changes to `tauri dev`'s watcher, so a clone in
  there rebuilds over and over.
- **A dev build joins an installed trace's WebView2.** Both use `com.obsidianos.trace`, so a
  `tauri dev` window started while the installed app runs shares its browser process, profile and
  storage, and ignores `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. Give the dev build its own folder:
  `WEBVIEW2_USER_DATA_FOLDER=%TEMP%	race-dev-webview npm run tauri dev`.
- **Driving the UI from a script:** add `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`
  (with the folder above) and connect over the Chrome DevTools Protocol at `http://127.0.0.1:9333/json`.
- **Stopping `tauri dev` by killing its process** (rather than Ctrl+C in its terminal) leaves vite
  running on port 1420, and the next start fails. Stop the leftover `node` process first.
