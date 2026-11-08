import { create } from "zustand";
import { toast } from "@/app/toast";
import { preflightChecks } from "@/ipc/preflight";
import {
  noticeText,
  type PreflightCheck,
  problemKey,
  type SetupStep,
  shouldNotify,
} from "./checks";
import { alreadySetUp, loadSetup, type SetupPrefs, saveSetup } from "./prefs";
import { usageFacts } from "./usage";

// The first run and the preflight checks. Loaded once, written by its actions
// (no effect pairs): `launch` decides, once per app start, between showing the
// first run and quietly checking. Someone who used trace before the first run
// existed (`alreadySetUp`) is marked done without seeing it.

/** What's on screen: the three-step first run, the checks alone, or nothing. */
export type SetupView = "setup" | "checks" | null;

interface SetupStore {
  prefs: SetupPrefs;
  view: SetupView;
  step: SetupStep;
  /** The latest preflight results; null until the first check returns. */
  checks: PreflightCheck[] | null;
  checking: boolean;
  /** The check itself failed (not a failing check): the reason. */
  error: string | null;
  /**
   * At app start: the first run for someone new, else a quiet check that raises
   * the notice when a required check fails.
   */
  launch: () => void;
  /** Open the first run at its first step (Settings' "Run setup again"). */
  start: () => void;
  /** Open just the checks (the launch notice's Details). */
  showChecks: () => void;
  goTo: (step: SetupStep) => void;
  close: () => void;
  /** Run the checks again; resolves with the results (or null if it failed). */
  check: () => Promise<PreflightCheck[] | null>;
}

let launched = false;

export const useSetupStore = create<SetupStore>((set, get) => {
  const savePrefs = (patch: Partial<SetupPrefs>) => {
    const prefs = { ...get().prefs, ...patch };
    saveSetup(prefs);
    set({ prefs });
  };

  return {
    prefs: loadSetup(),
    view: null,
    step: "agent",
    checks: null,
    checking: false,
    error: null,

    launch() {
      if (launched) return;
      launched = true;
      const quietCheck = async () => {
        const checks = await get().check();
        if (!checks || !shouldNotify(checks, get().prefs.dismissed)) return;
        const key = problemKey(checks);
        toast.notice(noticeText(checks), {
          action: { label: "Details", run: () => get().showChecks() },
          onDismiss: () => savePrefs({ dismissed: key }),
        });
      };
      if (get().prefs.done) {
        void quietCheck();
        return;
      }
      void usageFacts().then((facts) => {
        if (!alreadySetUp(facts)) {
          get().start();
          return;
        }
        savePrefs({ done: true });
        void quietCheck();
      });
    },

    start() {
      // Shown once: the flag is saved as it opens, so quitting midway doesn't
      // bring it back. Settings → "Run setup again" is the way back in.
      savePrefs({ done: true });
      set({ view: "setup", step: "agent" });
      void get().check();
    },

    showChecks() {
      set({ view: "checks" });
      if (!get().checks) void get().check();
    },

    goTo(step) {
      set({ step });
    },

    close() {
      set({ view: null });
    },

    async check() {
      set({ checking: true, error: null });
      try {
        const checks = await preflightChecks();
        set({ checks, checking: false });
        // All fixed: forget the dismissal, so a problem that comes back is told.
        if (problemKey(checks) === "" && get().prefs.dismissed) savePrefs({ dismissed: "" });
        return checks;
      } catch (e) {
        set({ checking: false, error: String(e) });
        return null;
      }
    },
  };
});

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
