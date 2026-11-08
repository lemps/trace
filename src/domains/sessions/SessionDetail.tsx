import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { BackButton } from "@/components/BackButton";
import { I } from "@/components/Icon";
import { MoreTrigger, PopMenu } from "@/components/PopMenu";
import { StatusLight } from "@/components/StatusLight";
import { editorItems } from "@/domains/agent/editorItems";
import { useHasExited } from "@/domains/agent/exitedStore";
import { useWorkspaceInfo } from "@/domains/agent/hooks/useWorkspaceInfo";
import { agentLabel } from "@/domains/agent/providerLabel";
import { usePrTab, useTestsTab } from "@/domains/agent/reviewTabs";
import { disposeTerminal } from "@/domains/agent/terminalRegistry";
import { useDetailKeys } from "@/domains/agent/useDetailKeys";
import { useViewerTabs } from "@/domains/agent/viewerTabs";
import { useWorkspaceTabs } from "@/domains/agent/workspaceTabs";
import { useAgentMenuItems } from "@/domains/agentChat/agentMenu";
import { useBoardStore } from "@/domains/board/store";
import { shownAsk } from "@/domains/live/light";
import { useLiveStore } from "@/domains/live/store";
import { focusedGroup } from "@/domains/panes/model";
import { PaneArea } from "@/domains/panes/PaneArea";
import { layoutItems } from "@/domains/panes/paneMenu";
import { isTabOn, useOnTabs, useTabSettings } from "@/domains/panes/tabSettings";
import { type Panes, usePanes } from "@/domains/panes/usePanes";
import { usePlanTab } from "@/domains/plans/store";
import { usePrWatch } from "@/domains/prs/hooks/usePrWatch";
import { useQuickOpen } from "@/domains/quickOpen/useQuickOpen";
import { type AgentCli, type AgentProvider, detachAgent } from "@/ipc/agent";
import { basename } from "@/platform/paths";
import { agentRoster, agentWorkspaceIds, companionsOf, MAX_COMPANIONS } from "./agentRoster";
import { CreatorChip } from "./CreatorChip";
import { creatorOf } from "./createdBy";
import { useSessionAgentRun } from "./hooks/useSessionAgentRun";
import { LinkTicketModal } from "./LinkTicketModal";
import { SessionPanel } from "./SessionPanel";
import { SessionRunButton } from "./SessionRunButton";
import { agentOfTab, agentTab, sessionPanels } from "./sessionPanels";
import { useSessionsStore } from "./store";
import { TitleEditor } from "./TitleEditor";
import type { ScratchSession } from "./types";

// Full-screen detail for one exploratory session. Reuses the agent detail shell
// (`.detail`), the live terminal, and the Files/Diff pane — all keyed by workspace
// id, the same contract board agents use.
//
// A session can host several agents in ONE worktree (see `agentRoster`): the agent
// it was created with, plus companions added here. Each gets its own tab, PTY and
// conversation, so work claude started can be continued by codex on the same code.
// The tabs can be arranged side by side in panes (`domains/panes`); the header acts on
// the agent last in focus.
// What being on Vercel means here, for the header's chip.
const HOST_HINT =
  "Runs in a Vercel Sandbox. Leave running keeps Claude working there; Stop & save ends it and keeps the sandbox for Start to resume.";

export function SessionDetail({
  session,
  onBack,
  backLabel,
}: {
  session: ScratchSession;
  onBack: () => void;
  /** The page Back returns to ("Inbox", "Sessions", …). */
  backLabel: string;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [linking, setLinking] = useState(false);
  const rename = useSessionsStore((s) => s.rename);
  const linkToIssue = useSessionsStore((s) => s.linkToIssue);
  const addAgent = useSessionsStore((s) => s.addAgent);
  const removeAgent = useSessionsStore((s) => s.removeAgent);
  // Which agent tab is in view lives in the store: the notifier consults it to
  // decide whether a finished turn is something the user is already watching.
  const selectedAgent = useSessionsStore((s) => s.selectedAgentId);
  const selectAgent = useSessionsStore((s) => s.selectAgent);
  const agentActivity = useBoardStore((s) => s.agentActivity);
  const setAgentRunning = useBoardStore((s) => s.setAgentRunning);
  const clearOutput = useBoardStore((s) => s.clearOutput);
  const ackWaiting = useBoardStore((s) => s.ackWaiting);
  const live = useLiveStore((s) => s.info);
  const openIssue = useBoardStore((s) => s.openIssue);

  const roster = useMemo(() => agentRoster(session), [session]);
  // PRs any of this session's agents raised, shown in its Pull request tab.
  const turnIds = useMemo(() => roster.map((r) => r.workspaceId), [roster]);
  const prUrls = usePrWatch(session.id, turnIds);
  // Falls back to the session's own agent, which also self-heals the selection
  // when the companion whose tab was open is removed.
  const active = roster.find((r) => r.workspaceId === selectedAgent) ?? roster[0];

  const run = useSessionAgentRun(session, active);
  const disconnect = () =>
    void detachAgent(active.workspaceId).catch((e) =>
      toast.error(`Couldn't disconnect: ${String(e)}`)
    );
  const agentItems = useAgentMenuItems({
    workspaceId: active.workspaceId,
    cli: active.cli,
    running: run.running,
    restart: run.restart,
    start: run.start,
  });
  // Repo + live branch for the header (the tab bar already names the agent).
  const info = useWorkspaceInfo(session.id, turnIds, run.running);
  const waiting = agentActivity[active.workspaceId] === "waiting";
  const plan = usePlanTab(active.workspaceId);
  const viewers = useViewerTabs(active.workspaceId);
  // A plain folder has no git, and a remote host (Vercel) no local folder: nothing for Files.
  const hasFiles = !session.folder && !session.host;
  const filesOn = useTabSettings((s) => isTabOn(s.off, "files"));
  const workspace = useWorkspaceTabs(session.id, hasFiles && filesOn);
  const tests = useTestsTab(session.id);
  const pr = usePrTab(session.id, prUrls);

  // Viewing a waiting agent acknowledges it — see AgentDetail.
  useEffect(() => {
    if (waiting) ackWaiting(active.workspaceId);
  }, [waiting, active.workspaceId, ackWaiting]);

  const panels = useOnTabs(
    sessionPanels({
      session,
      roster,
      active,
      live,
      plan,
      viewers,
      workspace,
      tests,
      pr,
      prUrls,
      onAddAgent: (cli, provider) => onAddAgent(cli, provider),
      addDisabled: companionsOf(session).length >= MAX_COMPANIONS,
    })
  );
  const owners = useMemo(
    () => Object.fromEntries(turnIds.map((id) => [id, agentTab(id)])),
    [turnIds]
  );
  const panes = usePanes(`session:${session.id}`, panels, owners);
  useFollowAgent(panes, roster, selectedAgent, selectAgent);
  // Arming "remove" is for the agent in view; another taking the header disarms it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the agent changes
  useEffect(() => setConfirmRemove(false), [active.workspaceId]);

  const showAgent = (workspaceId: string) => {
    selectAgent(workspaceId);
    panes.select(agentTab(workspaceId));
  };
  // ⌘1… = each tab in its natural order, wherever it is; Esc goes back.
  const exited = useHasExited(active.workspaceId);
  const quickOpen = useQuickOpen(session.id, hasFiles, () => panes.reveal("files"));
  useDetailKeys(
    onBack,
    panels.filter((p) => !p.hidden).map((p) => p.id),
    panes.select
  );

  const onAddAgent = (cli: AgentCli, provider?: AgentProvider) => {
    void addAgent(session.id, cli, provider)
      .then((updated) => {
        // The backend appends, so the new companion is the last one.
        const companions = companionsOf(updated);
        const added = companions[companions.length - 1];
        if (added) showAgent(added.id);
        toast.success(`Added a ${agentLabel(cli, provider)} agent to this session`);
      })
      .catch((err) => toast.error(String(err)));
  };

  const onRemoveAgent = () => {
    // Reached from the header's confirm button (the ⋯ menu only arms it):
    // removing an agent kills its PTY and forgets its conversation.
    setConfirmRemove(false);
    const removed = active.workspaceId;
    selectAgent(session.id);
    void removeAgent(session.id, removed)
      .then(() => toast.success("Agent removed"))
      .catch((err) => toast.error(String(err)));
  };

  const onPickIssue = (issueKey: string) => {
    setLinking(false);
    linkToIssue(session.id, issueKey)
      .then(() => {
        // The PTYs were killed backend-side; drop the renderer's terminals and
        // buffers so the issue card rebuilds cleanly under its own key.
        for (const id of [...agentWorkspaceIds(session), `term:${session.id}`]) {
          setAgentRunning(id, false);
          clearOutput(id);
          disposeTerminal(id);
        }
        toast.success(`Session linked to ${issueKey}`);
        onBack();
        openIssue(issueKey);
      })
      .catch((err) => toast.error(String(err)));
  };

  return (
    <div className="detail">
      <div className="detail-top">
        <BackButton label={backLabel} onBack={onBack} />
        <span className="session-avatar">
          <I.Sparkles size={18} />
        </span>
        <div>
          <span className="id" title={info?.cwd}>
            {info ? [basename(info.repo), info.branch].filter(Boolean).join(" · ") : "\u00a0"}
          </span>
          <CreatorChip createdBy={creatorOf(session)} variant="detail" />
          {session.host && (
            <span className="session-cli" title={HOST_HINT}>
              Vercel
            </span>
          )}
          {renaming ? (
            <TitleEditor
              initial={session.title}
              onSave={(title) => void rename(session.id, title)}
              onClose={() => setRenaming(false)}
            />
          ) : (
            <div className="ttl">
              {session.title}
              <button
                type="button"
                className="ttl-edit"
                onClick={() => setRenaming(true)}
                aria-label="Rename session"
                title="Rename"
              >
                <I.Pencil size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="right">
          {/* The viewed agent's real state — "working" only mid-turn, not whenever its PTY lives. */}
          {run.running && (
            <StatusLight
              light={live[active.workspaceId]?.light ?? "stopped"}
              label={shownAsk(live[active.workspaceId])?.label}
              variant="pill"
              size="lg"
            />
          )}
          {confirmRemove && (
            <>
              <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={onRemoveAgent}
                title="Stops this agent and forgets its conversation; the worktree stays"
              >
                <I.X size={13} /> Confirm remove {active.label}
              </button>
            </>
          )}
          <SessionRunButton
            agentName={active.label}
            running={run.running}
            exited={exited}
            remote={Boolean(session.host)}
            onStart={() => void run.start()}
            onStop={() => run.stop()}
            onDisconnect={disconnect}
          />
          <PopMenu
            trigger={({ toggle }) => <MoreTrigger toggle={toggle} label="More actions" />}
            sections={[
              // A remote host's files aren't on this computer to open.
              ...(session.host
                ? []
                : [
                    {
                      title: session.folder ? "Folder" : "Worktree",
                      items: editorItems(session.id),
                    },
                  ]),
              { title: active.label, items: agentItems },
              {
                title: "Session",
                items: [
                  ...(session.worktree
                    ? [{ label: "Link to ticket…", onSelect: () => setLinking(true) }]
                    : []),
                  ...(active.companion
                    ? [
                        {
                          label: `Remove ${active.label} agent…`,
                          danger: true,
                          onSelect: () => setConfirmRemove(true),
                        },
                      ]
                    : []),
                ],
              },
              { title: "Layout", items: layoutItems(panes) },
            ]}
          />
        </div>
      </div>

      {run.error && (
        <div style={{ padding: "8px 20px", color: "var(--c-danger)", fontSize: 12.5 }}>
          {run.error}
        </div>
      )}

      <div className="detail-body">
        <div className="detail-left">
          <PaneArea panes={panes} />
          {linking && <LinkTicketModal onClose={() => setLinking(false)} onPick={onPickIssue} />}
        </div>
      </div>
      <SessionPanel
        sessionId={session.id}
        activeWorkspaceId={active.workspaceId}
        turnIds={turnIds}
        hasPr={prUrls.length > 0}
        running={run.running}
      />
      {quickOpen}
    </div>
  );
}

/**
 * Keep the header's agent and the panes in step. Selecting an agent from outside
 * (opening the session, a notification for a companion) shows its tab; focusing an
 * agent's tab — clicking it, or its pane — makes it the one the header acts on, and
 * the one whose turns count as watched. Focusing Files or Terminal changes neither.
 */
function useFollowAgent(
  panes: Panes,
  roster: { workspaceId: string }[],
  selected: string | null,
  select: (workspaceId: string) => void
): void {
  const seen = useRef<string | null>(null);
  const focusedTab = focusedGroup(panes.layout).active;
  const show = panes.select;
  // An agent picked before its tab exists (a companion just added) waits for it.
  const rosterKey = roster.map((r) => r.workspaceId).join(" ");
  useEffect(() => {
    const has = (id: string) => rosterKey.split(" ").includes(id);
    if (selected !== seen.current) {
      if (selected && !has(selected)) return;
      seen.current = selected;
      if (selected) show(agentTab(selected));
      return;
    }
    const agent = agentOfTab(focusedTab);
    if (agent && agent !== selected && has(agent)) {
      seen.current = agent;
      select(agent);
    }
  }, [selected, focusedTab, rosterKey, show, select]);
}
