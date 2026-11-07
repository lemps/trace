import { type ReactNode, useMemo } from "react";
import { useLiveStore } from "@/domains/live/store";
import { sessionLight } from "../agentRoster";
import { listKey, useSessionOrderStore } from "../orderStore";
import { SessionList } from "../SessionList";
import { SessionRow } from "../SessionRow";
import { SortMenu } from "../SortMenu";
import type { SortMode } from "../sortSessions";
import { useSessionsStore } from "../store";
import type { ScratchSession } from "../types";
import { useLastActive } from "./useLastActive";
import { useSessionDiffs } from "./useSessionDiffs";
import { useSessionsOverview } from "./useSessionsOverview";

/** Where a list files the sessions dropped into it. */
export interface ListPlace {
  tab: string | null;
  section: string | null;
}

/**
 * Everything the Sessions page's lists share for one tab: each row's light, diff,
 * branch/PR and last activity (fetched for the tab in one go), and the actions.
 * Returns a renderer per list, and its sort menu.
 */
export function useSessionLists(
  inTab: ScratchSession[],
  placeOf: (s: ScratchSession) => ListPlace
) {
  const select = useSessionsStore((s) => s.select);
  const archive = useSessionsStore((s) => s.archive);
  const rename = useSessionsStore((s) => s.rename);
  const assign = useSessionsStore((s) => s.assign);
  const live = useLiveStore((s) => s.info);
  // Diffs only for worktree sessions — a legacy one shares the repo root.
  const diffs = useSessionDiffs(inTab.filter((s) => s.worktree).map((s) => s.id));
  const overview = useSessionsOverview(inTab.map((s) => s.id));
  const lastActive = useLastActive(inTab);
  // Across every agent on the session, not just the one it started with.
  const lights = useMemo(
    () => Object.fromEntries(inTab.map((s) => [s.id, sessionLight(s, live)])),
    [inTab, live]
  );

  /** File a session under `to`, and take it out of the old list's saved order. */
  const moveIn = (id: string, to: ListPlace) => {
    const session = useSessionsStore.getState().sessions.find((s) => s.id === id);
    if (session) {
      const from = placeOf(session);
      const fromKey = listKey(from.tab, from.section);
      const order = useSessionOrderStore.getState();
      const prefs = order.lists[fromKey];
      if (prefs?.order.includes(id) && fromKey !== listKey(to.tab, to.section)) {
        void order.save(fromKey, { ...prefs, order: prefs.order.filter((x) => x !== id) });
      }
    }
    void assign(id, to.tab, to.section);
  };

  const renderList = (items: ScratchSession[], place: ListPlace, empty?: ReactNode) => (
    <SessionList
      listKey={listKey(place.tab, place.section)}
      items={items}
      lights={Object.fromEntries(items.map((s) => [s.id, lights[s.id]?.light ?? "stopped"]))}
      lastActive={lastActive}
      onMoveIn={(id) => moveIn(id, place)}
      empty={empty}
      renderRow={(s, ordering) => (
        <SessionRow
          key={s.id}
          session={s}
          light={lights[s.id]?.light ?? "stopped"}
          lightDetail={lights[s.id]?.detail ?? ""}
          overview={overview[s.id]}
          diff={diffs[s.id]}
          ordering={ordering}
          onOpen={() => select(s.id)}
          onArchive={() => void archive(s.id)}
          onRename={(title) => void rename(s.id, title)}
        />
      )}
    />
  );

  return { renderList, moveIn };
}

/** A list's sort menu, saving the pick with the list's order. */
export function ListSortMenu({ place }: { place: ListPlace }) {
  const key = listKey(place.tab, place.section);
  const prefs = useSessionOrderStore((s) => s.lists[key]);
  const save = useSessionOrderStore((s) => s.save);
  const pick = (sort: SortMode) => void save(key, { sort, order: prefs?.order ?? [] });
  return <SortMenu mode={prefs?.sort ?? "manual"} onPick={pick} />;
}
