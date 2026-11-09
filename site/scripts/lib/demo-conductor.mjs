// A fake Conductor install for the `conductor` scene (demo-setup.mjs --conductor).
// The recording build reads it through TRACE_DEV_CONDUCTOR_DIR, which stands in
// for Conductor's data and home folders:
//
//   <dir>/com.conductor.app/conductor.db   the database the importer reads
//   <dir>/repos/storefront, docs-site      two repos Conductor knew (new to trace)
//   <dir>/repos/storefront/.conductor/lisbon   a live workspace: a real worktree
//
// The database has only the tables and columns the importer reads
// (src-tauri/src/conductor_import/db.rs). No secrets: the `settings` rows that
// hold them in a real install (`claude_env_vars`, `conductor_api_token`) are left
// out, not filled with fakes. Each run starts the install over, so a take that
// imported it (moving the worktree, adding repos) can be taken again.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const REVIEW =
  "Review this branch against main. List bugs and missing tests first, then style, each with its file and line.";
const PR = "Commit the work, push the branch and open a PR whose description says what changed and how it was tested.";

const REPOS = [
  {
    id: "repo-storefront",
    name: "storefront",
    setup: 'npm install\ncp "$CONDUCTOR_ROOT_PATH/.env" .',
    run: "npm run dev",
    prompts: { custom_prompt_code_review: REVIEW, custom_prompt_create_pr: PR },
  },
  {
    id: "repo-docs",
    name: "docs-site",
    setup: "npm install",
    run: "npm run preview",
    prompts: { custom_prompt_code_review: REVIEW },
  },
];

/**
 * Build the fake install in `dir`. `source` is a demo repo's bare origin to clone
 * the repos from; `git(cwd, ...args)` runs git as the demo identity. With
 * `transcript`, the live workspace gets a real Claude conversation (one short
 * `claude -p` turn), so the preview marks it Resumable.
 */
export function buildConductor({ dir, source, git, transcript = true }) {
  rmSync(dir, { recursive: true, force: true });
  const repos = join(dir, "repos");
  mkdirSync(repos, { recursive: true });
  for (const r of REPOS) {
    git(repos, "clone", "--quiet", source, r.name);
    const root = join(repos, r.name);
    git(root, "config", "user.name", "trace demo");
    git(root, "config", "user.email", "demo@example.com");
    // What the setup script copies in: a local, untracked .env (no secrets).
    writeFileSync(join(root, ".env"), "PORT=3000\nLOG_LEVEL=debug\n");
    appendFileSync(join(root, ".git", "info", "exclude"), ".env\n.conductor/\n");
  }
  // Storage version 2 keeps workspaces inside the repo, at .conductor/<city>.
  const store = join(repos, "storefront");
  git(store, "worktree", "add", "--quiet", "-b", "demo/lisbon", join(store, ".conductor", "lisbon"));

  let claudeId = randomUUID();
  if (transcript) {
    execFileSync("claude", ["-p", "--session-id", claudeId, "Say hello in five words. Don't use any tools."], {
      cwd: join(store, ".conductor", "lisbon"),
      stdio: ["ignore", "ignore", "inherit"],
    });
  } else {
    claudeId = "no-transcript";
  }

  mkdirSync(join(dir, "com.conductor.app"), { recursive: true });
  const db = new DatabaseSync(join(dir, "com.conductor.app", "conductor.db"));
  db.exec(`
    CREATE TABLE repos (id TEXT, name TEXT, root_path TEXT, remote_url TEXT, default_branch TEXT,
      storage_version INTEGER, hidden INTEGER, setup_script TEXT, run_script TEXT,
      display_order INTEGER, custom_prompt_code_review TEXT, custom_prompt_create_pr TEXT);
    CREATE TABLE workspaces (id TEXT, repository_id TEXT, directory_name TEXT, branch TEXT,
      state TEXT, active_session_id TEXT, updated_at TEXT);
    CREATE TABLE sessions (id TEXT, workspace_id TEXT, claude_session_id TEXT, title TEXT,
      model TEXT, permission_mode TEXT, agent_type TEXT, is_hidden INTEGER, updated_at TEXT);
    CREATE TABLE settings (key TEXT, value TEXT);
  `);
  const repo = db.prepare("INSERT INTO repos VALUES (?, ?, ?, NULL, 'main', 2, 0, ?, ?, ?, ?, ?)");
  REPOS.forEach((r, i) => {
    const p = r.prompts;
    repo.run(r.id, r.name, join(repos, r.name), r.setup, r.run, i, p.custom_prompt_code_review ?? null, p.custom_prompt_create_pr ?? null);
  });
  const ws = db.prepare("INSERT INTO workspaces VALUES (?, ?, ?, ?, ?, ?, ?)");
  ws.run("ws-lisbon", "repo-storefront", "lisbon", "demo/lisbon", "ready", "s-lisbon", "2026-05-30");
  ws.run("ws-oslo", "repo-storefront", "oslo", "demo/oslo", "archived", null, "2026-05-20");
  ws.run("ws-quito", "repo-docs", "quito", "demo/quito", "archived", null, "2026-05-18");
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, 'opus', 'default', 'claude', 0, '2026-05-30')").run(
    "s-lisbon",
    "ws-lisbon",
    claudeId,
    "Cart: keep items after sign-in",
  );
  db.prepare("INSERT INTO settings VALUES ('default_open_in', 'vscode')").run();
  db.close();
}
