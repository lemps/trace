import { I } from "@/components/Icon";
import { type Coming, comingFields, useComing } from "@/domains/panes/coming";
import type { PanelDescriptor } from "@/domains/panes/types";
import { PrPane } from "@/domains/prs/PrPane";
import { TestsPane } from "./TestsPane";
import { useTestsStore } from "./testsStore";

/**
 * A workspace's Tests tab under the tabs rule (.claude/rules/tabs.md): content is a
 * run going, or one's result or error. Each new run brings a hidden tab back.
 */
export function useTestsTab(workspaceId: string): Coming {
  const signature = useTestsStore((s) => {
    if (s.running.has(workspaceId)) return "running";
    const run = s.results[workspaceId];
    if (run) return `done:${run.durationMs}:${run.exitCode}`;
    const error = s.errors[workspaceId];
    return error ? `error:${error}` : "";
  });
  return useComing("tests", workspaceId, signature !== "", signature);
}

/** The Pull request tab under the tabs rule: content is a PR; a new one brings it back. */
export function usePrTab(workspaceId: string, prUrls: string[]): Coming {
  return useComing("pr", workspaceId, prUrls.length > 0, prUrls.join(" "));
}

/**
 * The Tests tab of a ticket or session: its worktree's tests, run on demand. Picked
 * from the pane menu while empty, it starts a run.
 */
export function testsTab(workspaceId: string, tests: Coming, section?: string): PanelDescriptor {
  return {
    id: "tests",
    label: "Tests",
    icon: I.Beaker,
    title: "Run the worktree's tests",
    section,
    ...comingFields(tests, true),
    onReveal: () => {
      if (!tests.content) void useTestsStore.getState().run(workspaceId);
      tests.reveal();
    },
    render: () => <TestsPane workspaceId={workspaceId} />,
  };
}

/**
 * The Pull request tab: the workspace's PRs, with checks and threads. It can't open
 * empty (Raise PR is the header's).
 */
export function prTab(prUrls: string[], pr: Coming, section?: string): PanelDescriptor {
  return {
    id: "pr",
    label: "Pull request",
    icon: I.GitPR,
    title: "Pull requests, with checks and review threads",
    badge: prUrls.length > 1 ? <span className="count">{prUrls.length}</span> : undefined,
    section,
    ...comingFields(pr, false),
    render: () => (
      <div className="tab-pane">
        <PrPane urls={prUrls} />
      </div>
    ),
  };
}
