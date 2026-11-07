import type Anthropic from "@anthropic-ai/sdk";
import { activity } from "@/domains/activity/store";
import { isEmptySetup } from "@/domains/repos/types";
import { githubClone, githubStatus } from "@/ipc/github";
import { cloneRoot, setRepoSetup } from "@/ipc/repoSetup";
import { addRepo, checkRepoPath, listRepos } from "@/ipc/repos";
import { currentOs } from "@/platform/os";
import { basename, joinNative } from "@/platform/paths";
import { need } from "./args";
import { creatorFromCaller } from "./callerOrigin";
import { ConfirmQueue } from "./confirmQueue";
import { isFullName, outcomeText } from "./repoRules";

// Adding a repository to trace, at an agent's request. A registered repo's
// worktrees are trusted for Claude without asking (`claude::folder_trust`), so
// an agent never does this alone: each request is a confirm card the user
// answers in trace (`RepoConfirm`), and the call waits for it. Cloning uses
// trace's own GitHub sign-in (`github_clone`: the token stays in Rust, only in
// git's environment).

/**
 * How long a call waits for the user. Claude Code gives up on an MCP call after 60 s
 * (seen live), so this answers first; Codex is given 200 s (`agent_tools::codex`).
 */
const WAIT_MS = 45_000;

/** The asks the confirm card shows. */
export const repoAsks = new ConfirmQueue();

export const REPO_TOOLS: Anthropic.Tool[] = [
  {
    name: "add_repo",
    description:
      "Ask the user to add an existing local git repository to trace's repositories, so sessions and ticket agents can run in it. The path must be absolute and the repository's top folder. trace shows the user a confirm card and this call waits for their answer (up to about 45 seconds): it returns once they approve (the repo is added) or decline. If they haven't answered yet it says so; call it again with the same path later to get the answer. Never assume it was added until this returns that it was.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path of the repository's top folder." },
      },
      required: ["path"],
    },
  },
  {
    name: "clone_repo",
    description:
      "Ask the user to clone a GitHub repository (owner/name) with trace's GitHub sign-in into trace's clone folder, add it to trace's repositories and save its suggested worktree setup (the install commands each new worktree runs). The user confirms it in trace first and this call waits for their answer (up to about 45 seconds); if they haven't answered yet, call it again with the same name later. Needs trace to be signed in to GitHub (Integrations).",
    input_schema: {
      type: "object",
      properties: { repo: { type: "string", description: "The GitHub repository as owner/name." } },
      required: ["repo"],
    },
  },
];

const NAMES = new Set(REPO_TOOLS.map((t) => t.name));

export function isRepoTool(name: string): boolean {
  return NAMES.has(name);
}

async function callerLabel(caller: string): Promise<string> {
  const by = await creatorFromCaller(caller);
  return by && "label" in by ? by.label : caller || "an agent";
}

const known = async (path: string) =>
  (await listRepos()).some((r) => r.toLowerCase() === path.toLowerCase());

async function add(input: unknown, caller: string): Promise<string> {
  const path = await checkRepoPath(need(input, "path"));
  if (await known(path)) return `${path} is already one of trace's repositories.`;
  const run = async () => {
    await addRepo(path);
    activity.log({
      kind: "repo-added",
      actor: "agent",
      subject: basename(path),
      title: `added repository ${path}`,
      data: { by: caller },
    });
    return `Added ${path} to trace's repositories (start_session repo: "${basename(path)}").`;
  };
  const ask = {
    kind: "add" as const,
    target: path,
    detail: "",
    caller,
    callerLabel: await callerLabel(caller),
  };
  return outcomeText(await repoAsks.request(ask, run, WAIT_MS), `adding ${path}`);
}

async function clone(input: unknown, caller: string): Promise<string> {
  const name = need(input, "repo").replace(/\.git$/, "");
  if (!isFullName(name)) throw new Error(`"${name}" isn't a GitHub repository name (owner/name).`);
  const status = await githubStatus();
  if (!status.login) {
    throw new Error(
      "trace isn't signed in to GitHub. The user can sign in under Integrations → GitHub."
    );
  }
  const root = await cloneRoot();
  const run = async () => {
    const cloned = await githubClone(name);
    const setup = cloned.suggestedSetup;
    if (!isEmptySetup(setup)) await setRepoSetup(cloned.path, setup);
    activity.log({
      kind: "repo-added",
      actor: "agent",
      subject: name,
      title: `cloned ${name} to ${cloned.path}`,
      data: { by: caller },
    });
    const steps = setup.commands.length
      ? ` Each new worktree runs: ${setup.commands.join("; ")}.`
      : "";
    const how = cloned.alreadyPresent ? "was already checked out at" : "is cloned to";
    return `${name} ${how} ${cloned.path} and added to trace's repositories (start_session repo: "${cloned.remote.name}").${steps}`;
  };
  const ask = {
    kind: "clone" as const,
    target: name,
    detail: joinNative(root, name.split("/")[1], currentOs),
    caller,
    callerLabel: await callerLabel(caller),
  };
  return outcomeText(await repoAsks.request(ask, run, WAIT_MS), `cloning ${name}`);
}

/** Run add_repo / clone_repo for the agent `caller`. */
export function runRepoTool(name: string, input: unknown, caller: string): Promise<string> {
  return name === "clone_repo" ? clone(input, caller) : add(input, caller);
}
