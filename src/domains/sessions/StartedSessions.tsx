import { useEffect, useMemo } from "react";
import { StatusLight } from "@/components/StatusLight";
import { useLiveStore } from "@/domains/live/store";
import { sessionLight } from "./agentRoster";
import { sessionsStartedBy } from "./createdBy";
import { useSessionsStore } from "./store";
import { relTime } from "./time";

/** The active sessions the agent in `workspaceId` started (a session id or issue key). */
export function useStartedSessions(workspaceId: string) {
  const sessions = useSessionsStore((s) => s.sessions);
  const loaded = useSessionsStore((s) => s.loaded);
  const load = useSessionsStore((s) => s.load);
  // A ticket's detail can open before the Sessions page ever has.
  useEffect(() => {
    if (!loaded) void load().catch(() => {});
  }, [loaded, load]);
  return useMemo(() => sessionsStartedBy(sessions, workspaceId), [sessions, workspaceId]);
}

// A parent's side panel: the sessions its agent started over trace's
// `start_session` tool, each with its state and age, opening on click.
export function StartedSessionsSection({ workspaceId }: { workspaceId: string }) {
  const started = useStartedSessions(workspaceId);
  const live = useLiveStore((s) => s.info);
  const select = useSessionsStore((s) => s.select);
  if (started.length === 0) return null;
  return (
    <div className="ctx-section">
      <div className="label">Sessions it started</div>
      <div className="started-list">
        {started.map((s) => {
          const { light, detail } = sessionLight(s, live);
          return (
            <button
              key={s.id}
              type="button"
              className="started-item"
              onClick={() => select(s.id)}
              title={`Open “${s.title}”`}
            >
              <StatusLight light={light} title={detail} />
              <span className="title">{s.title}</span>
              <span className="age">{relTime(s.createdAt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
