import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import {
  type CleanupReport,
  type CleanupSettings,
  getCleanupSettings,
  previewCleanup,
  runCleanupNow,
  setCleanupSettings,
} from "@/ipc/cleanup";

export interface CleanupState {
  /** The saved rules; null until read (or when reading failed). */
  settings: CleanupSettings | null;
  /** Reading the rules failed: say so instead of drawing switches that do nothing. */
  failed: boolean;
  /** What the next pass would do; null while off or before the first preview. */
  report: CleanupReport | null;
  /** A new preview is being worked out: `report` is the previous one meanwhile. */
  stale: boolean;
  /** "Clean up now" is running. */
  running: boolean;
  /** Save a change; the preview follows what was stored. */
  update: (patch: Partial<CleanupSettings>) => void;
  /** Run a pass now; `onDone` rescans the worktree list. */
  runNow: (onDone: () => void) => Promise<void>;
  /** Work the preview out again (worktrees were removed by hand). */
  repreview: () => void;
}

/** "3 worktrees", "1 worktree". */
export const worktreeCount = (n: number) => `${n} worktree${n === 1 ? "" : "s"}`;

// Auto-cleanup's saved rules and their live preview. The preview runs git in every
// worktree and may ask the tracker about each ticket, so it's debounced, and the
// last one stays on screen (dimmed) while the next is worked out.
export function useCleanup(): CleanupState {
  const [settings, setSettings] = useState<CleanupSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [stale, setStale] = useState(false);
  const [running, setRunning] = useState(false);
  // Bumped to preview again without a settings change (after "Clean up now").
  const [round, setRound] = useState(0);

  useEffect(() => {
    getCleanupSettings()
      .then(setSettings)
      .catch((err) => {
        setFailed(true);
        toast.error(`Couldn't read the auto-cleanup rules: ${String(err)}`);
      });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` asks for a fresh preview
  useEffect(() => {
    if (!settings?.enabled) {
      setReport(null);
      setStale(false);
      return;
    }
    let cancelled = false;
    setStale(true);
    const timer = setTimeout(() => {
      previewCleanup()
        .then((r) => !cancelled && setReport(r))
        .catch((err) => !cancelled && toast.error(`Couldn't preview the cleanup: ${String(err)}`))
        .finally(() => !cancelled && setStale(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [settings, round]);

  const update = (patch: Partial<CleanupSettings>) => {
    if (!settings) return;
    setCleanupSettings({ ...settings, ...patch })
      .then(setSettings)
      .catch((err) => toast.error(`Couldn't save the auto-cleanup rules: ${String(err)}`));
  };

  const runNow = async (onDone: () => void) => {
    setRunning(true);
    try {
      const done = await runCleanupNow();
      const removed = done.items.filter((it) => !it.held).length;
      toast.success(`Deleted ${worktreeCount(removed)}.`);
    } catch (err) {
      toast.error(`The cleanup stopped: ${String(err)}`);
    } finally {
      setRunning(false);
      onDone();
      setRound((n) => n + 1);
    }
  };

  return {
    settings,
    failed,
    report,
    stale,
    running,
    update,
    runNow,
    repreview: () => setRound((n) => n + 1),
  };
}
