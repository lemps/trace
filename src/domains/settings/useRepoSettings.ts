import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/app/toast";
import type { RepoDetails } from "@/domains/repos/types";
import { repoDetails } from "@/ipc/repoSetup";
import {
  addRepo,
  listRepoMappings,
  listRepos,
  type RepoMapping,
  removeRepo,
  setRepoMappings,
} from "@/ipc/repos";

/** A mapping row in the editor; the id keeps rows stable while their text changes. */
export type MappingRow = RepoMapping & { id: string };

const withId = (m: RepoMapping): MappingRow => ({ ...m, id: crypto.randomUUID() });

export interface RepoSettingsState {
  repos: string[];
  /** False until the list is read, so the empty state doesn't flash. */
  loaded: boolean;
  /** Remote, branch, setup, account per repo: slower (git per repo), so they fill in. */
  details: Record<string, RepoDetails>;
  mappings: MappingRow[];
  /** Read the list and every repo's details again (after a clone or an import). */
  reload: () => void;
  addFolder: () => Promise<void>;
  /** Remove from trace, with its ticket mappings; the folder stays. */
  remove: (path: string) => Promise<void>;
  /** Patch one repo's loaded details after a save. */
  patchDetails: (path: string, patch: Partial<RepoDetails>) => void;
  /** Replace the mapping rows and save them. Blank rows stay in the editor only. */
  saveMappings: (next: MappingRow[]) => void;
  addMapping: () => void;
}

// Settings → Repositories' data: the configured folders, what git says about each,
// and the ticket→repo mappings.
export function useRepoSettings(): RepoSettingsState {
  const [repos, setRepos] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [details, setDetails] = useState<Record<string, RepoDetails>>({});
  const [mappings, setMappings] = useState<MappingRow[]>([]);

  const loadDetails = useCallback(() => {
    repoDetails()
      .then((list) => setDetails(Object.fromEntries(list.map((d) => [d.path, d]))))
      .catch((err) => toast.error(`Couldn't read your repositories: ${String(err)}`));
  }, []);

  const reload = useCallback(() => {
    listRepos()
      .then(setRepos)
      .catch((err) => toast.error(`Couldn't load your repositories: ${String(err)}`))
      .finally(() => setLoaded(true));
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    reload();
    listRepoMappings()
      .then((list) => setMappings(list.map(withId)))
      .catch((err) => toast.error(`Couldn't load your repo mappings: ${String(err)}`));
  }, [reload]);

  const saveMappings = (next: MappingRow[]) => {
    setMappings(next);
    void setRepoMappings(next.map(({ pattern, repo }) => ({ pattern, repo }))).catch((err) =>
      toast.error(`Couldn't save your repo mappings: ${String(err)}`)
    );
  };

  const addFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose a git repository",
    });
    if (typeof picked !== "string") return;
    try {
      setRepos(await addRepo(picked));
      loadDetails();
    } catch (err) {
      toast.error(`Couldn't add that repository: ${String(err)}`);
    }
  };

  const remove = async (path: string) => {
    try {
      setRepos(await removeRepo(path));
      if (mappings.some((m) => m.repo === path)) {
        saveMappings(mappings.filter((m) => m.repo !== path));
      }
    } catch (err) {
      toast.error(`Couldn't remove that repository: ${String(err)}`);
    }
  };

  const patchDetails = (path: string, patch: Partial<RepoDetails>) =>
    setDetails((all) => {
      const d = all[path];
      return d ? { ...all, [path]: { ...d, ...patch } } : all;
    });

  return {
    repos,
    loaded,
    details,
    mappings,
    reload,
    addFolder,
    remove,
    patchDetails,
    saveMappings,
    addMapping: () => saveMappings([...mappings, withId({ pattern: "", repo: repos[0] ?? "" })]),
  };
}
