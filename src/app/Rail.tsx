import { AppLogo } from "@/components/AppLogo";
import { I } from "@/components/Icon";
import { Buddy } from "@/domains/buddy/Buddy";
import { useBuddyStore } from "@/domains/buddy/store";
import { useIssuesStore } from "@/domains/issues/store";
import { useScheduledNeedsYou } from "@/domains/schedules/hooks/useScheduledNeedsYou";
import { RailRecents } from "@/domains/sessions/RailRecents";
import type { NavId } from "./nav";

interface RailProps {
  nav: NavId;
  onNav: (nav: NavId) => void;
  /** Agents that need you — the inbox's badge. */
  waitingCount: number;
}

export function Rail({ nav, onNav, waitingCount }: RailProps) {
  // Prefer the Jira identity for the rail avatar; fall back to any provider, or none.
  const user = useIssuesStore((s) => s.users.jira ?? s.users.pylon ?? null);
  // A tracker's pages are only here while it's connected (`nav.ts`).
  const trackers = useIssuesStore((s) => s.sessions);
  const scheduledNeedsYou = useScheduledNeedsYou();
  const buddyOn = useBuddyStore((s) => s.enabled);

  return (
    <aside className="rail">
      <div className="logo">
        <AppLogo size={32} />
      </div>
      <nav className="nav">
        <button
          type="button"
          className={`nav-btn${nav === "inbox" ? " active" : ""}`}
          onClick={() => onNav("inbox")}
          title={waitingCount > 0 ? `Inbox — ${waitingCount} need you` : "Inbox"}
          aria-label={waitingCount > 0 ? `Inbox, ${waitingCount} need you` : "Inbox"}
        >
          <I.Inbox size={16} />
          {waitingCount > 0 && <span className="badge count">{waitingCount}</span>}
        </button>
        {trackers.jira && (
          <button
            type="button"
            className={`nav-btn${nav === "board" ? " active" : ""}`}
            onClick={() => onNav("board")}
            title="Board"
            aria-label="Board"
          >
            <I.Board size={16} />
          </button>
        )}
        {trackers.pylon && (
          <button
            type="button"
            className={`nav-btn${nav === "pylon" ? " active" : ""}`}
            onClick={() => onNav("pylon")}
            title="Pylon"
            aria-label="Pylon"
          >
            <I.Support size={16} />
          </button>
        )}
        <button
          type="button"
          className={`nav-btn${nav === "fleet" ? " active" : ""}`}
          onClick={() => onNav("fleet")}
          title="Fleet — every running agent"
          aria-label="Fleet"
        >
          <I.Fleet size={16} />
        </button>
        {/* While Sessions is selected, resting on it slides out its recent
            sessions (RailRecents). */}
        <div className="rail-group">
          <button
            type="button"
            className={`nav-btn${nav === "sessions" ? " active" : ""}`}
            onClick={() => onNav("sessions")}
            title="Sessions"
            aria-label="Sessions"
          >
            <I.Agents size={16} />
          </button>
          {nav === "sessions" && <RailRecents />}
        </div>
        <button
          type="button"
          className={`nav-btn${nav === "scheduled" ? " active" : ""}`}
          onClick={() => onNav("scheduled")}
          title="Scheduled prompts"
          aria-label="Scheduled prompts"
        >
          <I.Clock size={16} />
          {scheduledNeedsYou && <span className="badge" />}
        </button>
        {trackers.jira && (
          <button
            type="button"
            className={`nav-btn${nav === "pr" ? " active" : ""}`}
            onClick={() => onNav("pr")}
            title="Pull requests"
            aria-label="Pull requests"
          >
            <I.PR size={16} />
          </button>
        )}
        <button
          type="button"
          className={`nav-btn${nav === "activity" ? " active" : ""}`}
          onClick={() => onNav("activity")}
          title="Activity"
          aria-label="Activity"
        >
          <I.Activity size={16} />
        </button>
        <button
          type="button"
          className={`nav-btn${nav === "integrations" ? " active" : ""}`}
          onClick={() => onNav("integrations")}
          title="Integrations"
          aria-label="Integrations"
        >
          <I.Plug size={16} />
        </button>
      </nav>
      {buddyOn && <Buddy />}
      <button
        type="button"
        className={`nav-btn${nav === "settings" ? " active" : ""}`}
        title="Settings"
        aria-label="Settings"
        style={{ marginTop: "auto" }}
        onClick={() => onNav("settings")}
      >
        <I.Settings size={16} />
      </button>
      {/* The connected tracker account; opens Integrations (where the connection lives). */}
      <button
        type="button"
        className="me"
        title={user ? user.displayName : "No tracker connected"}
        aria-label={
          user
            ? `${user.displayName}, open Integrations`
            : "No tracker connected, open Integrations"
        }
        onClick={() => onNav("integrations")}
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.displayName} />
        ) : (
          (user?.displayName?.trim()[0]?.toUpperCase() ?? "?")
        )}
      </button>
    </aside>
  );
}
