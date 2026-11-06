# Windows and Linux builds

Plan for shipping trace on Windows and Linux. Based on an audit of the code on 2026-11-06. The audit
read the code but didn't compile it for either platform, and the Mac only has the
`aarch64-apple-darwin` Rust target. Phase 0 confirms the findings below.

## Goal

A release publishes installers for macOS, Windows and Linux, and all the core features work on each:
agents, worktrees, turn tracking, tools, notifications and in-app updates.

**Out of scope:** moving sessions to the Vercel cloud, mobile apps, WSL-hosted agents and ARM builds
for Windows and Linux.

## Where it stands

**Already portable:**

- PTY transport (`portable-pty`, which supports ConPTY on Windows)
- Config location (`dirs::config_dir()`: `%APPDATA%\trace` on Windows, `~/.config/trace` on Linux)
- Loopback bridge and MCP endpoint (TCP on `127.0.0.1`, not Unix sockets)
- HTML5 drag and drop (`dragDropEnabled: false`)

**Needs work:**

| Area | Where | Linux | Windows | Fix |
| --- | --- | --- | --- | --- |
| Scheduler lock | `schedule/runner.rs:16,79` | OK | **Won't compile** | `File::try_lock` from std |
| Process check | `interrupted.rs:151-155` | OK | **Won't compile** | Per-platform `process_alive` |
| Hook relay | `claude/hooks.rs:30` | OK | Breaks turn tracking | See decision 2 |
| `trace-render` | `claude/render_bridge.rs:26` | OK | Breaks HTML tab | See decision 2 |
| Shell env probe | `claude/env.rs:38` | OK | No `$SHELL` or `printenv` | Inherit the process env |
| `PATH` merge | `claude/env.rs:83` | Add Linux dirs | `:` separator, Mac dirs | `std::env::join_paths` |
| CLI discovery | `claude/discovery.rs` | Mac dirs | `HOME`, no `.exe`/`.cmd` | Use `home_dir`, try `PATHEXT` |
| Launching `.cmd` CLIs | `claude/pty.rs:123` | n/a | npm installs are `.cmd` | Verify, wrap in `cmd /c` |
| Console windows | 30+ `Command::new` calls | n/a | Window flashes per call | One helper, `CREATE_NO_WINDOW` |
| Path strings | `format!("{repo}/...")`, `rsplit('/')` | OK | Mixed `\` and `/` | Use `Path`, normalize git output |
| Absolute path check | `git.rs:40` | OK | `C:/...` seen as relative | `Path::is_absolute` |
| Worktree guard | `commands/worktrees.rs:225` | OK | Refuses valid removals | Compare normalized paths |
| Conversation lookup | `claude/conversations.rs:92` | OK | Slug differs, so no resume | Match Claude's Windows slug |
| File permissions | `helpers.rs:31` | OK | **Silent no-op** | See decision 4 |
| Test runner | `commands/tests.rs` | OK | `npm`, `./gradlew` fail | Resolve tools, use `.bat` |
| Open in editor | `commands/editor.rs` | Partial | Partial | Use each editor's CLI |
| Sound | `commands/sound.rs:15,84` | No `afplay`, Mac dirs | Same | Play in-app, own sound list |
| Dock badge | `src/ipc/notify.ts:47` | Limited | Unsupported | Taskbar overlay, or skip |
| Path display | 14 copies of `basename` | OK | Shows the full path | One shared helper |
| Shortcuts | `metaKey` handlers, `⌘` hints | Broken | Broken | See decision 3 |
| Mac wording | `ProviderLogin.tsx:93,134` | Wrong | Wrong | Neutral copy |
| Packaging | `tauri.conf.json` `"targets": ["app"]` | None | None | See decisions 5 and 6 |
| Release and updater | `release.yml` is Mac only | None | None | Matrix, merged `latest.json` |

## Architecture: ports and adapters

OS differences sit behind ports, the same way `issues::IssueProvider` hides Jira and Pylon. Domain
code asks for what it needs and never knows which OS it's on.

```
src-tauri/src/platform/
├── mod.rs          # picks the adapter for this build
├── ports/          # one trait per concern, with no OS code
├── unix/           # shared by macOS and Linux
├── macos.rs        # only what differs from unix
├── linux.rs        # only what differs from unix
└── windows/
```

| Port | What it covers | Used by |
| --- | --- | --- |
| `ProcessHost` | Spawn hidden processes, check a pid is alive, stop a process tree | `git.rs`, `github/`, `commands/*`, `interrupted.rs` |
| `ToolLocator` | Find `claude`, `git`, `gh`, `npm`, including `PATHEXT` | `claude/discovery.rs`, `commands/tests.rs` |
| `AgentEnvironment` | Build the agent's env and `PATH`, default shell | `claude/env.rs`, `claude/pty.rs` |
| `AgentBridge` | Install the hook relay and `trace-render`, build the hook command | `claude/hooks.rs`, `claude/render_bridge.rs` |
| `InstanceLock` | The single-leader lock | `schedule/runner.rs`, `cleanup/runner.rs` |
| `PrivateFiles` | User-only file access | `helpers.rs`, every persisted file |
| `SoundPlayer` | List and play notification sounds | `commands/sound.rs` |
| `EditorLauncher` | Open a folder in an editor | `commands/editor.rs` |
| `AttentionBadge` | Dock badge, taskbar overlay, or nothing | `src/ipc/notify.ts` through a command |

**Rules:**

- **Ports only where behaviour differs:** path normalization and conversation slugs are pure
  functions with per-OS test cases, not ports.
- **Build-time selection:** only one adapter is compiled per build, with no `dyn` or runtime OS
  checks. Tests can pass a fake adapter to domain code.
- **Share Unix code:** macOS and Linux use one `unix` adapter, and override only what really differs.
- **Enforced, not just documented:** `#[cfg(...)]` for an OS, `std::os::*` and `libc` are only allowed
  in `platform/`, checked in CI. Clippy's `disallowed-methods` blocks direct `Command::new` elsewhere.

**Frontend:** `src/platform/` holds the same idea at a smaller scale: `paths.ts` for `basename`, and
`shortcuts.ts` for the modifier key and hints. Components never check the OS themselves.

## Decisions needed

1. **How to test:** a Mac can't test the other two platforms, and CI can compile and run unit tests
   but can't exercise the app. Who has a Windows PC and a Linux desktop, or should we set up VMs?
2. **Hook relay on Windows:** try the existing bash scripts under Git Bash first, as that's the least
   work. If they prove unreliable, replace both scripts with a small Rust helper binary.
   *Recommended: try Git Bash first.*
3. **Shortcuts:** `Ctrl+J`, `Ctrl+K` and `Ctrl+C` all mean something in a terminal, so `⌘` can't
   simply become `Ctrl`. *Recommended: `Ctrl+Shift+` for app shortcuts and terminal copy and paste.*
4. **Credentials on Windows:** tokens are stored in files, and `restrict_perms` does nothing there.
   *Recommended: keep the files, set a user-only ACL on write, and test it on a real machine.*
5. **Windows signing:** unsigned builds trigger SmartScreen warnings.
   *Recommended: ship unsigned internally, and sign before going public.*
6. **Linux packages:** the updater only works with AppImage.
   *Recommended: AppImage and `.deb`, built on Ubuntu 22.04 so they run on older glibc versions.*
7. **CI:** the port needs Windows and Linux builds, but PR CI is off until the release-readiness
   work is done. *Recommended: a separate workflow, run by hand and on pushes to `main` that touch
   `src-tauri/`. The repo is public, so standard GitHub runners should be free; check billing.*

## Phases

### Phase 0: See real errors

- [ ] Add the cross-platform workflow, building and testing on `ubuntu-22.04` and `windows-latest`.
- [ ] Replace the macOS-only rules in `CLAUDE.md` and `.claude/rules/agents.md` with the
      architecture rules above.
- [ ] Record any errors this audit missed in the table above.

**Done when:** the workflow reports the real list of failures on both platforms.

### Phase 1: Ports and the macOS adapter

This moves today's behaviour behind the ports, so it can all be built and tested on the Mac with no
change there. Windows and Linux adapters start as stubs that return a clear "not supported yet" error.

- [ ] Add `src-tauri/src/platform/` with the ports, and the `unix` and `macos` adapters.
- [ ] Move domain code onto the ports, one at a time, replacing every `Command::new` call and path
      string, then make `libc` a Unix-only dependency.
- [ ] Add the pure path and slug helpers, tested with Windows and Unix inputs.
- [ ] Add `src/platform/` for `basename` and shortcuts, replacing the 14 `basename` copies.
- [ ] Turn on the CI checks for the architecture rules.

**Done when:** the workflow compiles on all three platforms, the checks pass, and macOS still passes
the smoke test.

### Phase 2: Linux

- [ ] Add the `linux` adapter: install locations, sounds and the attention badge.
- [ ] Build AppImage and `.deb` packages.
- [ ] Remove the AppImage's own variables (`LD_LIBRARY_PATH`, `APPDIR`) from agent environments.
- [ ] Check WebKitGTK rendering, including xterm and Wayland.
- [ ] Pass the smoke test on Ubuntu, plus one other distribution.

**Done when:** a Linux user can install trace from a release and pass the smoke test.

### Phase 3: Windows

- [ ] Resolve decision 2, then build the `AgentBridge` adapter so hooks and `trace-render` work.
- [ ] Build the remaining `windows` adapters, including finding and launching `.cmd` installs of
      `claude`, `codex`, `git` and `gh`, credential file ACLs, and stopping an agent's process tree.
- [ ] Add Claude's Windows conversation slug, so resume and interrupted agents work.
- [ ] Handle long paths (`core.longpaths`) and locked files when removing worktrees.
- [ ] Build the NSIS installer, and pass the smoke test on Windows 11.

**Done when:** a Windows user can install trace from a release and pass the smoke test.

Linux and Windows can run in parallel once Phase 1 is done. Linux should still finish first, as it's
the smaller port and will flush out problems in the platform layer.

### Phase 4: Release

- [ ] Turn `release.yml` into a matrix, keeping the Mac assets as they are.
- [ ] Merge each platform's entry into one `latest.json`, so a single platform's failure can't
      publish a partial or broken update.
- [ ] Test an update from one release to the next on each platform. This waits until a release is
      wanted, because publishing one is on hold.
- [ ] Add install steps to the README, and update its requirements, badge and security section.

**Done when:** publishing a tag ships all three platforms, and in-app updates work on each.

## Smoke test

Run on each platform, with `claude` and `codex` installed the usual way for that platform.

- [ ] Connect a tracker and load a board.
- [ ] Start an agent from a card: it gets a worktree, and typing and resizing work.
- [ ] Turn tracking works: lights change, and a question reaches the Inbox.
- [ ] Agent tools work, and `trace-render` shows a card in the HTML tab.
- [ ] Quit mid-task: the agent is offered back and resumes its conversation.
- [ ] Diffs, tests, open in editor and the PR view work.
- [ ] A scheduled prompt fires, with two trace processes running.
- [ ] Notifications and sounds play.
- [ ] Shortcuts work and don't take keys from the terminal.
- [ ] Removing a worktree works, including right after its agent stops.
- [ ] Credential files can't be read by another user account.

## Still to verify

These came from reading the code and general platform knowledge, not from testing:

- Whether `/dev/tcp` works in Git Bash, and whether Claude Code runs hooks through it
- Claude's exact conversation slug on Windows
- Whether `git diff --no-index /dev/null` works on Windows (`commands/diff.rs:240`)
- Whether the Tauri notification plugin needs an installed app on Windows, as dev builds may not show
  notifications correctly
- How Codex behaves in ConPTY
