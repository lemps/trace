import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { PopMenu } from "@/components/PopMenu";
import { AGENT_OPTIONS } from "@/domains/agent/agentOptions";
import type { AgentCli, AgentProvider } from "@/ipc/agent";

interface AddAgentMenuProps {
  onAdd: (cli: AgentCli, provider?: AgentProvider) => void;
  /** Why it can't add one (the companion cap, a sandbox session): the trigger
   *  stays visible but inert, and says this in its tooltip. */
  blocked?: string | null;
}

// "+" in the session's tab bar: picks which CLI joins the session's worktree.
// A popover rather than a modal — adding an agent is a one-click decision.
export function AddAgentMenu({ onAdd, blocked }: AddAgentMenuProps) {
  return (
    <div className="add-agent">
      <PopMenu
        align="left"
        trigger={({ open, toggle }) => (
          <IconButton
            size="sm"
            className="ghost add-agent-btn"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
            disabled={Boolean(blocked)}
            title={blocked || "Add another agent in this session's worktree"}
            label="Add an agent to this session"
          >
            <I.Plus size={14} />
          </IconButton>
        )}
        sections={[
          {
            title: "Add agent · same worktree",
            items: AGENT_OPTIONS.map((o) => ({
              id: `${o.cli}:${o.provider}`,
              label: o.label,
              // The backend treats "no provider" as Anthropic.
              onSelect: () => onAdd(o.cli, o.provider === "anthropic" ? undefined : o.provider),
            })),
          },
        ]}
      />
    </div>
  );
}
