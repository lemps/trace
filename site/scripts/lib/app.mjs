// Find, or launch, the trace build the clips are recorded from.
//
// trace must run on demo data, never yours. The runner only launches a build
// when told where the demo config lives (TRACE_DEV_CONFIG_DIR), and it checks the
// build actually uses it: it removes the demo config's scheduler.lock, which
// trace recreates at start-up, and stops the build if the file doesn't come back.
// main's trace has no config-dir override; see site/README.md for the one-line
// local change that adds it.
//
// Env:
//   TRACE_EXE              the trace build to launch (only when none is running)
//   TRACE_DEV_CONFIG_DIR   the demo config dir (trace's files go in <it>/trace)
//   TRACE_SITE_WORK        a work folder outside the repo (WebView2 profile, frames)
//   TRACE_CDP_PORT         the debug port (default 9600)

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PORT, sleep } from "./cdp.mjs";

const up = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
};

/** Make sure a demo trace is listening on the debug port. Returns stop(). */
export async function ensureApp() {
  if (await up()) return { launched: false, stop: async () => {} };
  const exe = process.env.TRACE_EXE;
  const config = process.env.TRACE_DEV_CONFIG_DIR;
  const work = process.env.TRACE_SITE_WORK;
  if (!exe || !config || !work) {
    throw new Error(`nothing on port ${PORT}; set TRACE_EXE, TRACE_DEV_CONFIG_DIR and TRACE_SITE_WORK to launch one`);
  }
  const canary = join(config, "trace", "scheduler.lock");
  mkdirSync(join(config, "trace"), { recursive: true });
  rmSync(canary, { force: true });
  const webview = join(work, "webview");
  mkdirSync(webview, { recursive: true });
  const child = spawn(exe, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      TRACE_DEV_CONFIG_DIR: config,
      WEBVIEW2_USER_DATA_FOLDER: webview,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
  });
  child.unref();
  const stop = async () => {
    try {
      process.kill(child.pid);
    } catch {}
  };
  for (let i = 0; i < 60 && !(await up()); i++) await sleep(500);
  for (let i = 0; i < 30 && !existsSync(canary); i++) await sleep(500);
  if (!existsSync(canary)) {
    await stop();
    throw new Error("the build didn't use TRACE_DEV_CONFIG_DIR (no scheduler.lock appeared there); stopped it");
  }
  await sleep(3000);
  return { launched: true, stop };
}
