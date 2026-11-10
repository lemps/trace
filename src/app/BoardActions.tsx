import { useEffect, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useBoardStore } from "@/domains/board/store";
import { useIssuesStore } from "@/domains/issues/store";

/** "10:42": when the board last finished loading, for the refresh button's tooltip. */
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

// A board page's topbar controls: refresh, and a switcher between this tracker's boards.
// The cards stay up while a board reloads, so the refresh button shows the work
// itself: it spins (and won't take another press) while loading, and its tooltip
// says when the board was last updated.
export function BoardActions() {
  const allBoards = useIssuesStore((s) => s.boards);
  const selectedBoardKey = useIssuesStore((s) => s.selectedBoardKey);
  const selectBoard = useIssuesStore((s) => s.selectBoard);
  const refresh = useBoardStore((s) => s.refresh);
  const loading = useBoardStore((s) => s.loading);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && !loading) setUpdatedAt(Date.now());
    wasLoading.current = loading;
  }, [loading]);
  // `IconButton`'s `title` is only for more than the name: the work, or its last-updated time.
  const title = loading
    ? "Refreshing the board…"
    : updatedAt
      ? `Refresh board · updated ${clock(updatedAt)}`
      : undefined;
  const provider = allBoards.find((b) => b.key === selectedBoardKey)?.provider;
  const boards = allBoards.filter((b) => b.provider === provider);

  return (
    <>
      {boards.length > 1 && (
        <select
          className="board-switcher"
          aria-label="Board"
          value={selectedBoardKey ?? ""}
          onChange={(e) => selectBoard(e.target.value)}
        >
          {boards.map((b) => (
            <option key={b.key} value={b.key}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <IconButton
        label="Refresh board"
        className={loading ? "board-refresh busy" : "board-refresh"}
        title={title}
        aria-busy={loading}
        disabled={loading}
        onClick={() => void refresh()}
      >
        <I.Refresh size={14} />
      </IconButton>
    </>
  );
}
