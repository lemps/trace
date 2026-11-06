# trace

A desktop app for running many Claude Code sessions at once. Each agent runs in a real terminal, so
you can watch, answer and take over any of them, and trace shows you which ones need you.

- **Sessions:** start an agent in an isolated git worktree of a repo, in any folder, or in an empty
  scratch folder.
- **Boards (optional):** connect Jira or Pylon from Integrations to see your tickets as a Kanban
  board and start an agent on any card. Each one you connect adds its own page.
- **Scheduled prompts:** run a prompt on a schedule while trace is open.
- **Inbox and Fleet:** see every running agent and answer its questions in one place.

trace currently supports macOS only.

## Requirements

- [Claude Code](https://code.claude.com/) (`claude`) installed and signed in; `codex` also works
- `git`, and a repo with an `origin` remote for worktree sessions and board agents
- [GitHub CLI](https://cli.github.com/) (`gh`), signed in, for pull request features
- To build from source: Node.js and a Rust toolchain

## Develop

```bash
npm install
npm run tauri dev       # run the app with hot reload
npm run tauri build     # package it

npx tsc --noEmit                                  # typecheck
npx @biomejs/biome check src                      # lint and format check
cargo test --manifest-path src-tauri/Cargo.toml   # backend tests
```

Conventions and architecture are in [CLAUDE.md](CLAUDE.md) and `.claude/rules/`.

## Data and privacy

trace has no telemetry. Its settings and credentials stay in private files in the app's config
folder. It talks to the services you connect (Jira, Pylon, Anthropic or another model provider you
choose) and checks GitHub for app updates.

## License

Apache 2.0. See [LICENSE](LICENSE).
