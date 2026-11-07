<p align="center">
  <img src="src/assets/icon.png" alt="trace logo" width="96" />
</p>

<h1 align="center">trace</h1>

<p align="center">
  <strong>A Kanban board for running Claude Code agents in parallel.</strong><br />
  Start an agent from any issue and follow it from first prompt to pull request.
</p>

<p align="center">
  <a href="https://github.com/noble1911/trace/releases/latest"><img src="https://img.shields.io/github/v/release/noble1911/trace" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform: macOS, Windows and Linux" />
  <a href="LICENSE"><img src="https://img.shields.io/github/license/noble1911/trace" alt="License: Apache 2.0" /></a>
</p>

---

Every card on the board is an issue from your tracker. Start work on one and trace opens an
interactive `claude` or `codex` session in its own git worktree, so agents can work side by side
without touching each other's code. The inbox and fleet views show which agents need you, and which
are still working.

## Features

### Board

- **Your board, as your tracker shows it:** columns, filters and cards come from Jira or Pylon, and
  there's no separate ticket list to maintain.
- **Optional, and one page per tracker:** connect Jira, Pylon or both from Integrations. Each adds
  its own board to the sidebar, and everything else works without one.
- **Moves sync back:** dragging a card updates the issue, and moving it to in progress starts an
  agent.

### Agents

- **Isolated worktrees:** each issue gets its own branch and checkout.
- **The real CLI:** agents are interactive Claude Code or Codex sessions in a full terminal.
- **Workspace tabs:** chat, rendered HTML, ticket, files and diffs, a shell, tests and pull requests
  for every agent.
- **Other model providers:** run Claude Code against Kimi (Moonshot or Wafer) or DeepSeek.
- **Interrupted agents come back:** agents cut off by quitting, an update or a crash are offered
  again on the next launch, and resume their conversation.

### Staying on top of them

- **Inbox:** every agent waiting on you in one place, with its question and a way to reply.
- **Fleet:** every live agent at a glance, filtered by needs you, working or ready, with any progress
  note it has posted.
- **Notifications:** an alert when an agent needs you, with an optional sound.
- **Activity feed:** a persistent log of what happened across all your agents.
- **Search palette:** find issues, sessions, pull requests and chat output.
- **Pull requests:** the PRs your agents raised, with their checks, reviews and comments.

### Beyond tickets

- **Sessions:** named agent sessions that aren't tied to an issue. They run in a worktree of a repo,
  in any folder, or in an empty scratch folder, so they don't need git.
- **Scheduled prompts:** run a prompt on an interval, daily, weekly, monthly or by cron expression,
  with run history. Schedules fire while trace is open.
- **Orchestrator chat:** ask about your board and get answers with charts.
- **Agent tools:** agents can read the board, move issues, start other agents and manage sessions
  and scheduled prompts through trace's built-in MCP server.
- **Remote Control:** drive a session from claude.ai/code or the Claude app.
- **Automatic cleanup:** optionally remove idle worktrees to free disk space. It's off by default.
- **Pixel buddy:** a small companion in the sidebar that reacts to how your board is doing.

## Getting started

### Requirements

- macOS 11 or later on Apple silicon, Windows 10 or 11 (x64), or Linux (x86_64, glibc 2.35 or
  later, as on Ubuntu 22.04)
- [Claude Code](https://code.claude.com/docs) (`claude`), signed in, or
  [Codex](https://github.com/openai/codex) (`codex`), or both
- `git`, plus the [GitHub CLI](https://cli.github.com) (`gh`) for pull request features
- On Windows, [Git for Windows](https://git-scm.com/download/win): Claude Code and trace's hooks run
  through its Git Bash
- Optional: a [Jira Cloud](https://www.atlassian.com/software/jira) or
  [Pylon](https://usepylon.com) account for the boards

### Install

Download the file for your OS from the
[latest release](https://github.com/noble1911/trace/releases/latest). Then, to use the boards,
connect Jira or Pylon from **Integrations** in the sidebar.

**macOS** (`trace-<version>-macos.dmg`, or the `-macos-app.zip`)

1. Open the `.dmg` and drag `trace.app` into Applications.
2. Open trace. Releases aren't notarized yet, so macOS may block the first launch. If it does,
   allow the app in **System Settings → Privacy & Security**.

**Windows** (`trace-<version>-windows-x86_64-setup.exe`)

1. Run the installer. It installs for your user only, without admin rights.
2. The installer isn't signed yet, so SmartScreen may warn that it's from an unknown publisher.
   Choose **More info → Run anyway**.

**Linux**

- AppImage (`trace-<version>-linux-x86_64.AppImage`): make it executable with
  `chmod +x trace-*.AppImage`, then run it. Some distributions need `libfuse2` installed first.
- Debian or Ubuntu (`trace-<version>-linux-amd64.deb`): `sudo apt install ./trace-*.deb`.

### Updates

On macOS, Windows and the AppImage, check for and install updates from **Settings → Updates**.
trace restarts into the new version and offers back any agents the restart stopped. The `.deb` can't
update itself: download the new one and install it the same way.

### Where trace keeps its data

Settings, sessions, schedules, the activity log and saved credentials live in one folder:

| OS      | Folder                                          |
| ------- | ----------------------------------------------- |
| macOS   | `~/Library/Application Support/trace`           |
| Windows | `%APPDATA%\trace`                               |
| Linux   | `~/.config/trace` (or `$XDG_CONFIG_HOME/trace`) |

Worktrees are created inside each repository, under `.worktrees/`, and Claude Code keeps its
conversations in its own folder, as usual.

## Security

- **No telemetry:** trace talks only to the services you connect and to GitHub to check for updates.
- **Credentials:** tracker tokens and provider API keys stay in the Rust backend, in user-only files
  in trace's data folder (above). They aren't sent to the UI. On macOS and Linux the files are
  `0600`; on Windows the folder's access list lets in only you, `SYSTEM` and Administrators.
- **Agent tools:** agents can use trace's tools without a confirmation prompt, including moving
  issues and starting other agents. Only run agents on repositories you trust.

## Development

trace is a [Tauri 2](https://tauri.app) app with a Rust backend and a React and TypeScript frontend.
To build it, you need [Node.js](https://nodejs.org) and [Rust](https://rustup.rs). Debian and Ubuntu
also need the system libraries that `scripts/install-linux-build-deps.sh` installs.

```bash
npm install                                      # install frontend dependencies
npm run tauri dev                                # run the app with hot reload
npm run tauri build                              # build the app
```

Check your changes before committing:

```bash
npx tsc --noEmit                                 # typecheck
npx @biomejs/biome check src                     # lint and format
cargo test --manifest-path src-tauri/Cargo.toml  # backend tests
```

[`CLAUDE.md`](CLAUDE.md) covers the architecture and conventions, with detailed rules in
[`.claude/rules/`](.claude/rules/).

## Roadmap

Windows and Linux builds are new in v0.10.0, and still being tested on real machines. Cloud VMs and iPhone and
Android apps are planned. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full list.

## License

[Apache 2.0](LICENSE)
