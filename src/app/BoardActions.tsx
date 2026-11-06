import { I } from "@/components/Icon";
import { useBoardStore } from "@/domains/board/store";
import { useIssuesStore } from "@/domains/issues/store";

// The Board page's topbar controls: the board switcher and refresh.
export function BoardActions() {
  const boards = useIssuesStore((s) => s.boards);
  const selectedBoardKey = useIssuesStore((s) => s.selectedBoardKey);
  const selectBoard = useIssuesStore((s) => s.selectBoard);
  const refresh = useBoardStore((s) => s.refresh);

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
      <button
        type="button"
        className="btn icon"
        title="Refresh board"
        aria-label="Refresh board"
        onClick={() => void refresh()}
      >
        <I.Refresh size={14} />
      </button>
    </>
  );
}
