import { AgentPane } from "./AgentPane";
import type { RosterEntry } from "./agentRoster";
import { startHint, useSessionAgentRun } from "./hooks/useSessionAgentRun";
import type { ScratchSession } from "./types";

/**
 * One agent's tab content. It drives its own agent rather than the header's, since
 * two agents can be shown side by side and each pane's Start must start its own.
 */
export function SessionAgentTab({
  session,
  entry,
}: {
  session: ScratchSession;
  entry: RosterEntry;
}) {
  const run = useSessionAgentRun(session, entry);
  return (
    <AgentPane
      workspaceId={entry.workspaceId}
      cli={entry.cli}
      run={run}
      hint={startHint(session, entry)}
    />
  );
}
