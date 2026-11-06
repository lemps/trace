import type { ProviderKind, ProviderSession } from "@/domains/issues/types";

export type NavId =
  | "inbox"
  | "board"
  | "pylon"
  | "fleet"
  | "sessions"
  | "scheduled"
  | "pr"
  | "activity"
  | "integrations"
  | "settings";

export const NAV_LABELS: Record<NavId, string> = {
  inbox: "inbox",
  board: "board",
  pylon: "pylon",
  fleet: "fleet",
  sessions: "sessions",
  scheduled: "scheduled",
  pr: "pull requests",
  activity: "activity",
  integrations: "integrations",
  settings: "settings",
};

type TrackerSessions = Partial<Record<ProviderKind, ProviderSession>>;

/** Pages that show a tracker's data, and so only exist while it's connected. Only Jira
 * reports linked pull requests. */
const NAV_TRACKER: Partial<Record<NavId, ProviderKind>> = {
  board: "jira",
  pylon: "pylon",
  pr: "jira",
};

/** The tracker a page's data comes from, if any. */
export function navTracker(nav: NavId): ProviderKind | undefined {
  return NAV_TRACKER[nav];
}

export function isNavAvailable(nav: NavId, trackers: TrackerSessions): boolean {
  const tracker = NAV_TRACKER[nav];
  return !tracker || Boolean(trackers[tracker]);
}

/** Where to go when the wanted page isn't available: a board if there is one. */
export function landingNav(trackers: TrackerSessions): NavId {
  if (trackers.jira) return "board";
  if (trackers.pylon) return "pylon";
  return "sessions";
}

/** The page to show: the wanted one, unless its tracker isn't connected. */
export function resolveNav(nav: NavId, trackers: TrackerSessions): NavId {
  return isNavAvailable(nav, trackers) ? nav : landingNav(trackers);
}
