import type { I } from "@/components/Icon";
import type { RowAction, RowActionSection } from "@/components/useRowMenu";
import type { RemoteRepo } from "@/domains/repos/types";

/** Why a repo's account can be picked: the first "Pushes as" item's detail. */
export const PUSHES_AS_DETAIL =
  "Which account a Vercel sandbox clones and pushes as. Automatic uses the repo's SSH alias, its owner, or whichever account can push.";

interface RepoRowMenuArgs {
  /** The folder is on disk; a missing one only offers Copy path and Remove. */
  exists: boolean;
  /** Where it's hosted, once known. */
  remote: RemoteRepo | null;
  /** The account set for it (null = automatic); undefined until its details load. */
  account: string | null | undefined;
  /** The signed-in GitHub logins; "Pushes as" shows with two or more. */
  logins: string[];
  /** The glyphs (`I`), passed in so this stays a plain module. */
  icons: Pick<typeof I, "Pencil" | "External">;
  onEdit: () => void;
  onSuggest: () => void;
  onAccount: (login: string | null) => void;
  onOpenRemote: () => void;
  onReveal: () => void;
  onCopyPath: () => void;
  onRemove: () => void;
}

/** "Open on GitHub", or the host it's on. */
function openLabel(remote: RemoteRepo): string {
  return remote.host === "github.com" ? "Open on GitHub" : `Open on ${remote.host}`;
}

/**
 * Pick-one items for the repo's GitHub account: Automatic, then each signed-in
 * login. A saved account since signed out stays listed (and checked) as what's set.
 */
function accountItems(args: RepoRowMenuArgs): RowAction[] {
  const { account, logins, onAccount } = args;
  const listed = account && !logins.includes(account) ? [...logins, account] : logins;
  return [
    {
      id: "account:auto",
      label: "Automatic",
      detail: PUSHES_AS_DETAIL,
      checked: account === null,
      onSelect: () => onAccount(null),
    },
    ...listed.map((login) => ({
      id: `account:${login}`,
      label: logins.includes(login) ? login : `${login} (signed out)`,
      checked: account === login,
      onSelect: () => onAccount(login),
    })),
  ];
}

/**
 * Everything a repository row offers, as one list (trace-ui §5): Edit setup in
 * its hover bar, all of it behind its ⋯ and its right-click. The GitHub account
 * is a "Pushes as" section (menus have no submenus), shown only when there's a
 * choice: two or more signed-in accounts, and the repo's details loaded.
 */
export function repoRowMenu(args: RepoRowMenuArgs): RowActionSection[] {
  const { exists, remote, icons } = args;
  const copy: RowAction = { id: "copy", label: "Copy path", onSelect: args.onCopyPath };
  const remove: RowAction = {
    id: "remove",
    label: "Remove from trace",
    danger: true,
    onSelect: args.onRemove,
  };
  if (!exists) return [{ items: [copy] }, { items: [remove] }];
  // Until its details load, the saved setup isn't known: editing would start blank.
  const loaded = args.account !== undefined;
  const waiting = loaded ? {} : { disabled: true, detail: "Still reading the repository." };
  const choosesAccount = loaded && args.logins.length > 1;
  return [
    {
      items: [
        {
          id: "edit",
          label: "Edit setup",
          glyph: icons.Pencil,
          inBar: true,
          onSelect: args.onEdit,
          ...waiting,
        },
        {
          id: "suggest",
          label: "Suggest setup from lockfiles",
          onSelect: args.onSuggest,
          ...waiting,
        },
      ],
    },
    { title: "Pushes as", items: choosesAccount ? accountItems(args) : [] },
    {
      items: [
        ...(remote
          ? [
              {
                id: "remote",
                label: openLabel(remote),
                glyph: icons.External,
                onSelect: args.onOpenRemote,
              },
            ]
          : []),
        { id: "reveal", label: "Show in folder", onSelect: args.onReveal },
        copy,
      ],
    },
    { items: [remove] },
  ];
}
