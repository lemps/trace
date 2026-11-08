// What the live-agent lists remember across launches: when each running agent
// was opened (so opened order survives a restart that re-adopts its PTY), the
// user's dragged order, and which sessions have news since the user last opened
// them. Best-effort — blocked storage just forgets.

const OPENED_KEY = "trace.agentOpenedAt";
const ORDER_KEY = "trace.agentOrder";
const UNREAD_KEY = "trace.unreadSessions";

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
}

export function loadOpenedAt(): Record<string, number> {
  const v = read(OPENED_KEY);
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(v)) if (typeof t === "number") out[k] = t;
  return out;
}

export function saveOpenedAt(map: Record<string, number>) {
  write(OPENED_KEY, map);
}

/** `null` = never dragged: plain opened order. */
export function loadManualOrder(): string[] | null {
  const v = read(ORDER_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
}

export function saveManualOrder(order: string[] | null) {
  write(ORDER_KEY, order);
}

/** Session ids with a finished turn the user hasn't opened since (`unreadSync.ts`). */
export function loadUnread(): string[] {
  const v = read(UNREAD_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function saveUnread(ids: readonly string[]) {
  write(UNREAD_KEY, ids.length === 0 ? null : ids);
}
