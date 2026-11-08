// The pure half of composer drafts (`drafts.ts` holds the store): their shape, how
// one is changed, what's kept, and the debounce the store saves through. Tested in
// `draftModel.test.ts`.

/** A half-written message: the text and the files going with it. */
export interface Draft {
  text: string;
  /** Absolute paths, in the order added. */
  attachments: string[];
  /** Last edit, ms since the epoch: the oldest drafts go first past `MAX_DRAFTS`. */
  at: number;
}

export type Drafts = Record<string, Draft>;

/** Drafts kept; workspaces come and go, so old ones mustn't pile up forever. */
export const MAX_DRAFTS = 100;

const isEmpty = (d: Pick<Draft, "text" | "attachments">) =>
  d.text.trim() === "" && d.attachments.length === 0;

function isDraft(v: unknown): v is Draft {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.text === "string" &&
    Array.isArray(d.attachments) &&
    d.attachments.every((p) => typeof p === "string") &&
    typeof d.at === "number"
  );
}

/** Drafts read back from storage: anything malformed or empty is dropped. */
export function parseDrafts(raw: unknown): Drafts {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Drafts = {};
  for (const [id, d] of Object.entries(raw)) {
    if (isDraft(d) && !isEmpty(d)) out[id] = d;
  }
  return out;
}

/** The newest `max` drafts. */
export function pruneDrafts(drafts: Drafts, max = MAX_DRAFTS): Drafts {
  const entries = Object.entries(drafts);
  if (entries.length <= max) return drafts;
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, max));
}

/** `drafts` with one workspace's draft changed; an emptied draft is removed. */
export function withDraft(
  drafts: Drafts,
  workspaceId: string,
  patch: Partial<Pick<Draft, "text" | "attachments">>,
  now: number
): Drafts {
  const was = drafts[workspaceId] ?? { text: "", attachments: [], at: now };
  const next = { ...was, ...patch, at: now };
  if (isEmpty(next)) {
    if (!(workspaceId in drafts)) return drafts;
    const { [workspaceId]: _, ...rest } = drafts;
    return rest;
  }
  return pruneDrafts({ ...drafts, [workspaceId]: next });
}

export interface Debounced {
  /** Run `fn` once `ms` after the last call. */
  schedule: () => void;
  /** Run it now if one is waiting (the window is closing). */
  flush: () => void;
}

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** `fn`, run at most once per quiet `ms`. `timers` is for tests. */
export function debounce(fn: () => void, ms: number, timers: Timers = realTimers): Debounced {
  let handle: unknown = null;
  const run = () => {
    handle = null;
    fn();
  };
  return {
    schedule() {
      if (handle !== null) timers.clear(handle);
      handle = timers.set(run, ms);
    },
    flush() {
      if (handle === null) return;
      timers.clear(handle);
      run();
    },
  };
}
