// Set up the demo data the clips are recorded on, under TRACE_SITE_WORK:
//
//   <work>/demo/tinyroute, pixelsort, weatherline   the demo repos (lib/demo-repos.mjs)
//   <work>/demo/remotes/<name>.git                  a bare `origin` for each
//   <work>/config/trace/repos.json                  the demo config, listing them
//   <work>/config/trace/saved-prompts.json          the composer scene's saved prompts
//   <work>/conductor/                               with --conductor: a fake Conductor
//                                                   install (lib/demo-conductor.mjs)
//
//   TRACE_SITE_WORK=<dir> node site/scripts/demo-setup.mjs [--reset] [--conductor]
//
// Safe to run again: a repo that's already there is left as it is (with any
// worktrees the scenes made), and repos.json and saved-prompts.json are rewritten.
// --reset deletes <work>/demo and starts the repos over. --conductor (re)builds the
// Conductor install, for TRACE_DEV_CONDUCTOR_DIR=<work>/conductor; run it again
// before each take of the conductor scene, which imports it. It runs one short
// `claude -p` turn in the live workspace, so the import can resume it. It uses no credentials and copies
// nothing from your own config: commits are by a demo identity, and git runs
// without your global config. Then record with
//   TRACE_DEV_CONFIG_DIR=<work>/config
// Keep <work> outside your home folder: the runner stops if your home folder's
// path is ever on screen, and the demo repos' paths are.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildConductor, forgetImport } from "./lib/demo-conductor.mjs";
import { DEMO_REPOS } from "./lib/demo-repos.mjs";

const work = process.env.TRACE_SITE_WORK;
if (!work) {
  console.error("usage: TRACE_SITE_WORK=<dir> node site/scripts/demo-setup.mjs [--reset]");
  process.exit(2);
}
const root = resolve(work);
const demo = join(root, "demo");
const config = join(root, "config");
if (root.toLowerCase().startsWith(homedir().toLowerCase())) {
  console.warn(`warning: ${root} is inside your home folder, whose path the runner won't record`);
}

// The demo identity, a fixed clock, and none of your own git config (no signing,
// hooks, credential helpers or identity).
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "trace demo",
  GIT_AUTHOR_EMAIL: "demo@example.com",
  GIT_COMMITTER_NAME: "trace demo",
  GIT_COMMITTER_EMAIL: "demo@example.com",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, stdio: ["ignore", "pipe", "inherit"] });

/** Create `name` with its commits, pushed to a bare origin. */
function createRepo({ name, commits }) {
  const dir = join(demo, name);
  const bare = join(demo, "remotes", `${name}.git`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(bare, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(bare, { recursive: true });
  git(bare, "init", "--quiet", "--bare", "--initial-branch=main");
  git(dir, "init", "--quiet", "--initial-branch=main");
  // Kept in the repo, so agents' commits in it use the demo identity too.
  git(dir, "config", "user.name", "trace demo");
  git(dir, "config", "user.email", "demo@example.com");
  git(dir, "config", "commit.gpgsign", "false");
  if (process.platform === "win32") git(dir, "config", "core.autocrlf", "input");
  commits.forEach(({ message, files }, i) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    // A day apart, ending a week before 2026-06-01, so every take looks the same.
    const when = new Date(Date.UTC(2026, 4, 25 - (commits.length - 1 - i), 10, 0, 0)).toISOString();
    git(dir, "add", "-A");
    execFileSync("git", ["commit", "--quiet", "-m", message], {
      cwd: dir,
      env: { ...env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
      stdio: ["ignore", "pipe", "inherit"],
    });
  });
  git(dir, "remote", "add", "origin", bare);
  git(dir, "push", "--quiet", "-u", "origin", "main");
}

/** Whether `name` is already set up (its repo and its origin). */
function exists({ name }) {
  return existsSync(join(demo, name, ".git")) && existsSync(join(demo, "remotes", `${name}.git`, "HEAD"));
}

if (process.argv.includes("--reset")) rmSync(demo, { recursive: true, force: true });
for (const repo of DEMO_REPOS) {
  if (exists(repo)) {
    console.log(`  ${repo.name}: already there`);
    continue;
  }
  createRepo(repo);
  console.log(`  ${repo.name}: created (${repo.commits.length} commits)`);
}

// trace keeps every file user-only; the demo config matches.
mkdirSync(join(config, "trace"), { recursive: true, mode: 0o700 });
const repos = { repos: DEMO_REPOS.map(({ name }) => join(demo, name)) };
writeFileSync(join(config, "trace", "repos.json"), `${JSON.stringify(repos, null, 2)}\n`, { mode: 0o600 });

// New clones go in <work>/clones: the default, ~/src, would put your home folder
// on Settings → Repositories. Kept in repo-catalog.json, whose records stay as they are.
const catalogFile = join(config, "trace", "repo-catalog.json");
const catalog = existsSync(catalogFile) ? JSON.parse(readFileSync(catalogFile, "utf8")) : {};
catalog.cloneRoot = join(root, "clones");
writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 });

// The composer scene types `/rep` for this one; review-diff is one of trace's built-ins.
const at = Date.UTC(2026, 4, 25);
const prompt = (id, name, title, body) => ({ id, name, title, body, createdAt: at, updatedAt: at });
const saved = {
  prompts: [
    prompt(
      "demo-repro",
      "repro",
      "Reproduce and plan a fix",
      "The attached screenshot shows a bug. Reproduce it with a failing test, find the cause, and plan the fix.",
    ),
    prompt(
      "builtin-review-diff",
      "review-diff",
      "Review my changes",
      "Review my uncommitted changes for bugs and risks. For each finding, give the file and line, how serious it is and a suggested fix.",
    ),
  ],
};
writeFileSync(join(config, "trace", "saved-prompts.json"), `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });

console.log(`\ndemo config: ${config}\n  TRACE_DEV_CONFIG_DIR=${config}`);

if (process.argv.includes("--conductor")) {
  const dir = join(root, "conductor");
  forgetImport(join(config, "trace"), dir);
  buildConductor({ dir, source: join(demo, "remotes", "tinyroute.git"), git });
  console.log(`conductor install: ${dir}\n  TRACE_DEV_CONDUCTOR_DIR=${dir}`);
}
