// What we know about an agent's ticket when its board isn't the one loaded: which board
// it's on and its title. An agent outlives the board on screen, and a Jira account can
// have many, so this is how we name it and find it again without scanning them all.

const STORAGE_KEY = "trace.issueBoards";
const MAX_REMEMBERED = 200;

interface RememberedIssue {
  board: string;
  summary: string;
}

let remembered: Record<string, RememberedIssue> | null = null;

function read(): Record<string, RememberedIssue> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, RememberedIssue>) : {};
  } catch {
    return {};
  }
}

function load(): Record<string, RememberedIssue> {
  remembered ??= read();
  return remembered;
}

/** Remember these issues' board and titles, dropping the longest-unused past the limit. */
export function rememberIssues(boardKey: string, issues: { key: string; summary: string }[]): void {
  if (issues.length === 0) return;
  const saved = load();
  for (const { key, summary } of issues) {
    // Deleted first so it moves to the end, the most recently used.
    delete saved[key];
    saved[key] = { board: boardKey, summary };
  }
  remembered = Object.fromEntries(Object.entries(saved).slice(-MAX_REMEMBERED));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
}

export function rememberedIssueBoard(issueKey: string): string | null {
  return load()[issueKey]?.board ?? null;
}

export function rememberedIssueTitle(issueKey: string): string | null {
  return load()[issueKey]?.summary ?? null;
}
