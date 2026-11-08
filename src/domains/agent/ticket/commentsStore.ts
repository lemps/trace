import { create } from "zustand";
import { type IssueComment, trackerForIssueKey } from "@/domains/issues/types";
import { listIssueComments } from "@/ipc/issues";

// Each ticket's discussion as its tracker has it, for the Ticket tab. The tracker is
// the source of truth: the tab reloads it each time it opens, showing what it had
// meanwhile, so going back to a ticket doesn't flash empty.

export interface TicketComments {
  comments: IssueComment[] | null;
  loading: boolean;
  error: string | null;
}

const NONE: TicketComments = { comments: null, loading: false, error: null };
/** The latest load per ticket: an older answer landing later is dropped. */
const latest: Record<string, number> = {};

interface CommentsStore {
  byIssue: Record<string, TicketComments>;
  load: (issueKey: string, issueId: string) => Promise<void>;
}

export const useCommentsStore = create<CommentsStore>((set) => ({
  byIssue: {},
  async load(issueKey, issueId) {
    const ticket = (latest[issueKey] ?? 0) + 1;
    latest[issueKey] = ticket;
    const patch = (next: Partial<TicketComments>) =>
      set((s) => ({
        byIssue: { ...s.byIssue, [issueKey]: { ...(s.byIssue[issueKey] ?? NONE), ...next } },
      }));
    patch({ loading: true, error: null });
    try {
      const comments = await listIssueComments(trackerForIssueKey(issueKey), issueId);
      if (latest[issueKey] === ticket) patch({ comments, loading: false });
    } catch (e) {
      if (latest[issueKey] === ticket) patch({ loading: false, error: String(e) });
    }
  },
}));

export function useTicketComments(issueKey: string): TicketComments {
  return useCommentsStore((s) => s.byIssue[issueKey] ?? NONE);
}

import.meta.hot?.accept(() => location.reload());
