import { openUrl } from "@tauri-apps/plugin-opener";
import { create } from "zustand";
import { copyPlain } from "@/ipc/clipboard";
import {
  isFixableTool,
  preflightCancelSignIn,
  preflightInstall,
  preflightSignIn,
} from "@/ipc/preflight";
import { type FixAction, nextFix, type PreflightCheck } from "./checks";
import { useSetupStore } from "./store";

// The setup list's Install and Sign in buttons, and "Set it all up", which runs
// them in turn. An install ends when the backend returns; a sign-in ends when
// the browser finishes it, so we re-check every few seconds until its check
// passes. Closing the dialog or Cancel stops whatever is waiting.

/** How often a waiting sign-in re-checks, and for how long at most. */
const POLL_MS = 3000;
const SIGN_IN_LIMIT_MS = 10 * 60 * 1000;

/** A sign-in waiting on the browser. For gh: the code to enter, already copied. */
export interface SignInPrompt {
  id: string;
  code: string | null;
  url: string | null;
}

interface FixStore {
  /** What's running: one fix at a time. */
  running: { id: string; action: FixAction } | null;
  prompt: SignInPrompt | null;
  /** The last failure, by check id, until it's tried again. */
  errors: Record<string, string>;
  /** Run one row's fix; resolves true once its check passes. */
  fix: (id: string, action: FixAction) => Promise<boolean>;
  /** Install, then sign in, everything trace can, one after another. */
  fixAll: () => Promise<void>;
  cancel: () => void;
}

// Bumped by cancel: a fix that sees a newer one stops.
let generation = 0;

const sleep = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

function passes(checks: PreflightCheck[] | null, id: string): boolean {
  return checks?.some((c) => c.id === id && c.ok) ?? false;
}

export const useFixStore = create<FixStore>((set, get) => {
  const fail = (id: string, e: unknown) =>
    set((s) => ({ errors: { ...s.errors, [id]: String(e) } }));

  /** Re-check until `id` passes, the time runs out, or it's cancelled. */
  const waitFor = async (id: string, gen: number): Promise<boolean> => {
    const until = Date.now() + SIGN_IN_LIMIT_MS;
    while (Date.now() < until) {
      await sleep(POLL_MS);
      if (gen !== generation) return false;
      if (passes(await useSetupStore.getState().check(), id)) return true;
    }
    fail(id, "Signing in took too long. Try again.");
    return false;
  };

  const signIn = async (id: "claude" | "gh", gen: number): Promise<boolean> => {
    const start = await preflightSignIn(id);
    if (gen !== generation) return false;
    set({ prompt: { id, ...start } });
    // Copy first: opening the browser takes the focus away from us.
    if (start.code) await copyPlain(start.code).catch(() => undefined);
    if (start.url) await openUrl(start.url).catch(() => undefined);
    return waitFor(id, gen);
  };

  return {
    running: null,
    prompt: null,
    errors: {},

    async fix(id, action) {
      if (get().running || !isFixableTool(id)) return false;
      const gen = generation;
      set((s) => ({ running: { id, action }, errors: { ...s.errors, [id]: "" } }));
      try {
        if (action === "signIn") return await signIn(id, gen);
        await preflightInstall(id);
        return passes(await useSetupStore.getState().check(), id);
      } catch (e) {
        fail(id, e);
        return false;
      } finally {
        if (gen === generation) set({ running: null, prompt: null });
      }
    },

    async fixAll() {
      const gen = generation;
      const tried = new Set<string>();
      let checks = useSetupStore.getState().checks ?? (await useSetupStore.getState().check());
      while (checks && gen === generation) {
        const next = nextFix(checks, tried);
        if (!next) return;
        tried.add(`${next.id}:${next.action}`);
        // An install leaves the tool signed out: the fresh checks say so.
        if (!(await get().fix(next.id, next.action)) && get().errors[next.id]) return;
        checks = useSetupStore.getState().checks;
      }
    },

    cancel() {
      generation += 1;
      const prompt = get().prompt;
      if (prompt && isFixableTool(prompt.id)) void preflightCancelSignIn(prompt.id);
      set({ running: null, prompt: null });
    },
  };
});

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
