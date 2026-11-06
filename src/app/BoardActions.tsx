import { I } from "@/components/Icon";
import { useBoardStore } from "@/domains/board/store";
import { useIssuesStore } from "@/domains/issues/store";

// A board page's topbar controls: refresh, and a switcher between this tracker's boards.
export function BoardActions() {
  const allBoards = useIssuesStore((s) => s.boards);
  const selectedBoardKey = useIssuesStore((s) => s.selectedBoardKey);
  const selectBoard = useIssuesStore((s) => s.selectBoard);
  const refresh = useBoardStore((s) => s.refresh);
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
