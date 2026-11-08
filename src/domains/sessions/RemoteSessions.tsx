import { I } from "@/components/Icon";
import type { RemoteSessionsState } from "./hooks/useRemoteSessions";
import { relTime } from "./time";

// "On Vercel": trace sessions running in Vercel sandboxes that this trace doesn't
// have yet, started here before or from another computer. Join adopts one as a
// local session (same id) and opens it. The status is Vercel's word for the
// sandbox, not agent state, so it's plain text rather than a StatusLight.
export function RemoteSessions({ remote }: { remote: RemoteSessionsState }) {
  const { joinable, loading, joining, refresh, join } = remote;
  return (
    <section className="vs-group">
      <div className="sec-head">
        <span className="sec-name">On Vercel</span>
        <span className="count">{joinable.length}</span>
        <button
          type="button"
          className="btn ghost icon vs-refresh"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh sessions on Vercel"
          title="Refresh"
        >
          <span className={`vs-ic${loading ? " spinning" : ""}`}>
            <I.Refresh size={13} />
          </span>
        </button>
      </div>
      {joinable.length === 0 ? (
        <div className="vs-empty">
          {loading
            ? "Looking for sessions on Vercel…"
            : "Sessions started on Vercel from another computer show here, ready to join."}
        </div>
      ) : (
        <div className="session-list">
          {joinable.map((r) => (
            <div key={r.workspaceId} className="vs-row">
              <span className="vs-title">{r.title}</span>
              <span className="vs-where" title={r.sandbox}>
                {r.repo ?? r.sandbox}
              </span>
              <span className="vs-status">{r.status}</span>
              <span className="sr-time">{relTime(r.createdAt / 1000)}</span>
              <button
                type="button"
                className="btn"
                disabled={joining !== null}
                onClick={() => join(r.workspaceId)}
              >
                {joining === r.workspaceId ? "Joining…" : "Join"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
