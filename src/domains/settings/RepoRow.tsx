import { I } from "@/components/Icon";
import { RowBar, RowMenuPopover } from "@/components/RowMenu";
import { barActions, type RowActionSection, useRowMenu } from "@/components/useRowMenu";
import { MiddlePath } from "@/domains/repos/MiddlePath";
import { fullName, type RepoDetails, setupSteps } from "@/domains/repos/types";
import { basename } from "@/platform/paths";

interface RepoRowProps {
  path: string;
  /** Null until loaded (it runs git per repo): its columns hold "—" till then. */
  details: RepoDetails | null;
  /** Its full action list (`repoRowMenu`). */
  actions: RowActionSection[];
  /** Its setup editor or remove confirm is open under it. */
  isOpen: boolean;
}

// One configured repo as a two-line row of fixed columns, so every row lines up:
// name · remote · default branch · setup, then its folder underneath. Values git
// reports arrive later and fill their own columns without moving anything. A
// folder that's gone says so in place of what git would have told.
export function RepoRow({ path, details, actions, isOpen }: RepoRowProps) {
  const menu = useRowMenu();
  const missing = details?.exists === false;
  const account = details?.githubAccount;
  const remote = details ? (details.remote ? fullName(details.remote) : "No remote") : "—";

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: right-click opens the same menu as its ⋯ */}
      <div
        className={`rs-row${missing ? " missing" : ""}${isOpen ? " open" : ""}${menu.at ? " menu-open" : ""}`}
        onContextMenu={menu.onContextMenu}
      >
        <span className="rs-glyph">{missing ? <I.Alert size={14} /> : <I.Folder size={14} />}</span>
        <span className="rs-name">{basename(path)}</span>
        {missing ? (
          <span className="rs-missing">Folder missing</span>
        ) : (
          <>
            <span className={`rs-remote${details?.remote ? "" : " quiet"}`}>{remote}</span>
            <span className={`rs-branch${details?.defaultBranch ? "" : " quiet"}`}>
              {details?.defaultBranch || "—"}
            </span>
            <span className="rs-steps">{details ? setupSteps(details.setup) : "—"}</span>
          </>
        )}
        <RowBar
          className="rs-actions"
          actions={barActions(actions)}
          menu={menu}
          moreLabel="Repository actions"
        />
        <MiddlePath
          className="rs-path"
          path={path}
          suffix={account ? ` · pushes as ${account}` : undefined}
        />
      </div>
      <RowMenuPopover menu={menu} sections={actions} />
    </>
  );
}
