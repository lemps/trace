import { useCallback } from "react";
import { getTerminal } from "../terminalRegistry";
import { FindBar } from "./FindBar";
import { useTerminalUi } from "./store";
import { TerminalMenu } from "./TerminalMenu";

// What trace draws over a terminal: its find bar and its link / right-click menu.
// Lives inside the terminal pane (agent and shell alike), so it never touches the
// chat or transcript surfaces around it; the menu itself is portalled to the body
// (`ContextMenu`) and placed at the pointer, kept inside the window.
export function TerminalOverlay({ termKey }: { termKey: string }) {
  const findRequest = useTerminalUi((s) => s.find[termKey]);
  const menu = useTerminalUi((s) => s.menus[termKey]);
  const closeFind = useCallback(() => useTerminalUi.getState().closeFind(termKey), [termKey]);
  const closeMenu = useCallback(() => useTerminalUi.getState().closeMenu(termKey), [termKey]);
  const openFind = useCallback(() => useTerminalUi.getState().openFind(termKey), [termKey]);
  if (findRequest === undefined && !menu) return null;
  const { term } = getTerminal(termKey);

  return (
    <div className="term-overlay">
      {findRequest !== undefined && (
        <FindBar term={term} request={findRequest} onClose={closeFind} />
      )}
      {menu && (
        <TerminalMenu
          termKey={termKey}
          term={term}
          menu={menu}
          onFind={openFind}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
