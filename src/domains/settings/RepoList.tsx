import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Fragment, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { ConfirmPrompt } from "@/components/InlineConfirm";
import { copyText } from "@/domains/agent/copyText";
import { EMPTY_SETUP, type RepoDetails, remoteUrl, type SetupConfig } from "@/domains/repos/types";
import { setRepoGitHubAccount } from "@/ipc/repoSetup";
import { basename } from "@/platform/paths";
import { RepoRow } from "./RepoRow";
import { RepoSetupEditor, suggestSetup } from "./RepoSetupEditor";
import { repoRowMenu } from "./repoRowMenu";

interface RepoListProps {
  repos: string[];
  details: Record<string, RepoDetails>;
  /** The signed-in GitHub logins; a "Pushes as" choice shows with two or more. */
  logins: string[];
  /** Repos with ticket mappings, which go with them on removal. */
  mapped: Set<string>;
  onRemove: (path: string) => void;
  onPatch: (path: string, patch: Partial<RepoDetails>) => void;
}

/** What's open under a row: its setup editor, or its remove confirm. One at a time. */
type Open = { kind: "edit"; path: string; setup: SetupConfig } | { kind: "remove"; path: string };

// The configured repos as one joined list. A row's setup editor and its remove
// confirm open inside the list, under it, and only one row has either open.
export function RepoList({ repos, details, logins, mapped, onRemove, onPatch }: RepoListProps) {
  const [open, setOpen] = useState<Open | null>(null);

  const setAccount = (path: string, login: string | null) =>
    setRepoGitHubAccount(path, login)
      .then(() => onPatch(path, { githubAccount: login }))
      .catch((err) =>
        toast.error(`Couldn't set ${basename(path)}'s GitHub account: ${String(err)}`)
      );
  const suggest = (path: string) =>
    suggestSetup(path)
      .then((setup) => setup && setOpen({ kind: "edit", path, setup }))
      .catch((err) =>
        toast.error(`Couldn't suggest a setup for ${basename(path)}: ${String(err)}`)
      );

  const actionsFor = (path: string) => {
    const d = details[path];
    return repoRowMenu({
      exists: d?.exists !== false,
      remote: d?.remote ?? null,
      account: d ? d.githubAccount : undefined,
      logins,
      icons: I,
      onEdit: () => setOpen({ kind: "edit", path, setup: d?.setup ?? EMPTY_SETUP }),
      onSuggest: () => void suggest(path),
      onAccount: (login) => void setAccount(path, login),
      onOpenRemote: () => {
        if (d?.remote) void openUrl(remoteUrl(d.remote));
      },
      onReveal: () =>
        void revealItemInDir(path).catch(() =>
          toast.error(`${basename(path)} isn't there any more.`)
        ),
      onCopyPath: () => copyText(path, "path"),
      onRemove: () => setOpen({ kind: "remove", path }),
    });
  };

  return (
    <div className="rs-list">
      {repos.map((path) => {
        const here = open?.path === path ? open : null;
        const name = basename(path);
        return (
          <Fragment key={path}>
            <RepoRow
              path={path}
              details={details[path] ?? null}
              actions={actionsFor(path)}
              isOpen={here !== null}
            />
            {here?.kind === "edit" && (
              <RepoSetupEditor
                path={path}
                setup={here.setup}
                onChange={(setup) => setOpen({ ...here, setup })}
                onSaved={(setup) => {
                  onPatch(path, { setup });
                  setOpen(null);
                }}
                onCancel={() => setOpen(null)}
              />
            )}
            {here?.kind === "remove" && (
              <div className="rs-band rs-confirm">
                <ConfirmPrompt
                  size="sm"
                  message={`Remove ${name} from trace? The folder stays${mapped.has(path) ? ", its ticket mappings go" : ""}.`}
                  confirmLabel="Remove"
                  onCancel={() => setOpen(null)}
                  onConfirm={() => {
                    setOpen(null);
                    onRemove(path);
                  }}
                />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
