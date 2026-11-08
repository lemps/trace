import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { I } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { epicColor } from "@/domains/board/epicColor";
import type { Issue, Priority } from "@/domains/issues/types";

const PRIORITY: Record<Priority, string> = {
  p0: "Highest",
  p1: "High",
  p2: "Medium",
  p3: "Low",
};

function Prop({ k, wide, children }: { k: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "tk-prop wide" : "tk-prop"}>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The ticket's fields, at a glance above its description. */
export function TicketProps({ issue, epicUrl }: { issue: Issue; epicUrl?: string }) {
  const epicStyle = { color: epicColor(issue.epicKey, issue.epicColor) };
  return (
    <dl className="tk-props">
      <Prop k="Status">
        <StatusPill name={issue.statusName} category={issue.statusCategory} />
      </Prop>
      <Prop k="Assignee">
        <AgentAvatar assignee={issue.assignee} />
        <span className={issue.assignee ? "tk-ellipsis" : "tk-ellipsis tk-none"}>
          {issue.assignee?.displayName ?? "Unassigned"}
        </span>
      </Prop>
      <Prop k="Priority">
        <span className={`tk-priority ${issue.priority}`} aria-hidden />
        {PRIORITY[issue.priority]}
      </Prop>
      <Prop k="Reporter">
        <span className={issue.reporter ? "tk-ellipsis" : "tk-ellipsis tk-none"}>
          {issue.reporter ?? "Nobody"}
        </span>
      </Prop>
      <Prop k="Type">{issue.issueType}</Prop>
      {issue.epic && (
        <Prop k="Epic">
          {epicUrl ? (
            <button
              type="button"
              className="epic-chip"
              style={epicStyle}
              onClick={() => void openUrl(epicUrl)}
              title={`${issue.epicKey ?? ""} · ${issue.epic}: opens in Jira`}
            >
              <I.Layers size={10} />
              <span className="epic-name">{issue.epic}</span>
            </button>
          ) : (
            <span className="epic-chip" style={epicStyle} title={issue.epic}>
              <I.Layers size={10} />
              <span className="epic-name">{issue.epic}</span>
            </span>
          )}
        </Prop>
      )}
      {issue.labels.length > 0 && (
        <Prop k="Labels" wide>
          <span className="tk-labels">
            {issue.labels.map((l) => (
              <span key={l} className="tk-chip">
                {l}
              </span>
            ))}
          </span>
        </Prop>
      )}
    </dl>
  );
}
