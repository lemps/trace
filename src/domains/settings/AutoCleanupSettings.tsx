import { Switch } from "@/components/Switch";
import type { CleanupScope } from "@/ipc/cleanup";
import { CleanupPreview } from "./CleanupPreview";
import { IdlePeriodField } from "./IdlePeriodField";
import { SettingRow } from "./SettingRow";
import { SettingSection } from "./SettingSection";
import type { CleanupState } from "./useCleanup";

const OFF = "Turn on auto-cleanup to set this.";
const SCOPES: { value: CleanupScope; label: string }[] = [
  { value: "both", label: "Sessions and tickets" },
  { value: "sessions", label: "Sessions only" },
  { value: "tickets", label: "Tickets only" },
];
const isScope = (v: string): v is CleanupScope => SCOPES.some((s) => s.value === v);

interface CleanupSectionProps {
  cleanup: CleanupState;
  /** Rescan the worktree list after "Clean up now". */
  onCleaned: () => void;
}

// Settings → Worktrees → Auto-cleanup: delete idle workspaces' checkouts. Off by
// default; the rules are saved backend-side, where the hourly pass reads them.
// Every row is always there: while it's off (or a rule doesn't apply to the chosen
// scope) a row is dimmed and says why, so turning it on moves nothing.
export function CleanupSection({ cleanup, onCleaned }: CleanupSectionProps) {
  const { settings, update } = cleanup;
  const on = settings?.enabled === true;
  const scope = settings?.scope ?? "both";

  return (
    <SettingSection
      title="Auto-cleanup"
      desc="Delete the checkouts of workspaces nobody has touched in a while. The session or ticket stays: starting it again makes a fresh checkout and resumes the conversation."
    >
      {cleanup.failed && <div className="rs-note">Couldn't read the auto-cleanup rules.</div>}
      {settings && (
        <>
          <SettingRow label="Delete idle workspaces" hint="Checked hourly while trace is open.">
            <Switch
              on={on}
              onChange={(enabled) => update({ enabled })}
              label="Delete idle workspaces automatically"
            />
          </SettingRow>
          <SettingRow
            label="After"
            hint="Idle since its last activity: the agent's last message, a commit, or archiving."
            inactive={!on}
            inactiveReason={OFF}
          >
            <IdlePeriodField
              hours={settings.afterHours}
              onSave={(afterHours) => update({ afterHours })}
            />
          </SettingRow>
          <SettingRow
            label="Applies to"
            hint="Exploratory sessions, ticket workspaces, or both."
            inactive={!on}
            inactiveReason={OFF}
          >
            <select
              aria-label="Applies to"
              value={scope}
              onChange={(e) => {
                if (isScope(e.target.value)) update({ scope: e.target.value });
              }}
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="Only archived sessions"
            hint="Leave active sessions alone; delete only ones in the recycle bin."
            inactive={!on || scope === "tickets"}
            inactiveReason={on ? "Applies when sessions are included." : OFF}
          >
            <Switch
              on={settings.sessionsOnlyArchived}
              onChange={(sessionsOnlyArchived) => update({ sessionsOnlyArchived })}
              label="Only delete archived sessions"
            />
          </SettingRow>
          <SettingRow
            label="Only tickets in Done"
            hint="Delete a ticket's workspace only once its issue is in a Done status."
            inactive={!on || scope === "sessions"}
            inactiveReason={on ? "Applies when tickets are included." : OFF}
          >
            <Switch
              on={settings.ticketsOnlyDone}
              onChange={(ticketsOnlyDone) => update({ ticketsOnlyDone })}
              label="Only delete tickets in Done"
            />
          </SettingRow>
          <CleanupPreview
            enabled={on}
            report={cleanup.report}
            stale={cleanup.stale}
            running={cleanup.running}
            onRun={() => void cleanup.runNow(onCleaned)}
          />
        </>
      )}
    </SettingSection>
  );
}
