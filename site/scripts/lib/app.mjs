// Find, or launch, the trace build the clips are recorded from, and say how to
// drive it: on Windows over WebView2's DevTools port (cdp.mjs), on macOS over the
// recording build's own bridge (bridge.mjs).
//
// trace must run on demo data, never yours. The runner only launches a build
// when told where the demo config lives (TRACE_DEV_CONFIG_DIR), and it checks the
// build actually uses it: it removes the demo config's scheduler.lock, which
// trace recreates at start-up, and stops the build if the file doesn't come back.
// Only a `recording` build reads TRACE_DEV_CONFIG_DIR; see site/README.md.
//
// Env:
//   TRACE_EXE              the trace build to launch (on Windows, only when none is running)
//   TRACE_DEV_CONFIG_DIR   the demo config dir (trace's files go in <it>/trace)
//   TRACE_SITE_WORK        a work folder outside the repo (WebView2 profile, frames)
//   TRACE_CDP_PORT         the debug port (default 9600; Windows)

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startBridge } from "./bridge.mjs";
import { connect, PORT, sleep } from "./cdp.mjs";

const up = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
};

/** Remove the canary, which a build using the demo config recreates at start-up. */
function resetCanary(config) {
  const canary = join(config, "trace", "scheduler.lock");
  mkdirSync(join(config, "trace"), { recursive: true });
  rmSync(canary, { force: true });
  return canary;
}

async function waitForCanary(canary, stop) {
  for (let i = 0; i < 30 && !existsSync(canary); i++) await sleep(500);
  if (!existsSync(canary)) {
    await stop();
    throw new Error("the build didn't use TRACE_DEV_CONFIG_DIR (no scheduler.lock appeared there); stopped it");
  }
}

/**
 * Make sure a demo trace is running and reachable. Returns { launched, stop,
 * connect, quitAfter }: connect() gives a driver; quitAfter says the runner must
 * stop it at the end (a macOS bridge can't be rejoined by a later run).
 */
export async function ensureApp() {
  if (process.platform === "darwin") return launchMac();
  if (await up()) return { launched: false, stop: async () => {}, connect: () => connect() };
  const exe = process.env.TRACE_EXE;
  const config = process.env.TRACE_DEV_CONFIG_DIR;
  const work = process.env.TRACE_SITE_WORK;
  if (!exe || !config || !work) {
    throw new Error(`nothing on port ${PORT}; set TRACE_EXE, TRACE_DEV_CONFIG_DIR and TRACE_SITE_WORK to launch one`);
  }
  const canary = resetCanary(config);
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
  await waitForCanary(canary, stop);
  await sleep(3000);
  return { launched: true, stop, connect: () => connect() };
}

/**
 * macOS: start the bridge's server, then launch the recording build with its
 * port and token (trace takes them out of its environment at start-up). Always a
 * fresh launch: the token is per run, so a trace left running can't be rejoined.
 */
async function launchMac() {
  const exe = process.env.TRACE_EXE;
  const config = process.env.TRACE_DEV_CONFIG_DIR;
  if (!exe || !config || !process.env.TRACE_SITE_WORK) {
    throw new Error("set TRACE_EXE (a recording build), TRACE_DEV_CONFIG_DIR and TRACE_SITE_WORK");
  }
  // Any other build would ignore the demo config and open yours: don't start one.
  if (!readFileSync(exe).includes("TRACE_RECORDING_TOKEN")) {
    throw new Error(`${exe} isn't a recording build of trace (site/README.md)`);
  }
  const bridge = await startBridge();
  const canary = resetCanary(config);
  const child = spawn(exe, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      TRACE_DEV_CONFIG_DIR: config,
      TRACE_RECORDING_PORT: String(bridge.port),
      TRACE_RECORDING_TOKEN: bridge.token,
    },
  });
  const exited = new Promise((r) => child.once("exit", r));
  const stop = async () => {
    bridge.close();
    if (child.exitCode === null) child.kill();
    await Promise.race([exited, sleep(5000)]);
  };
  await waitForCanary(canary, stop);
  try {
    await bridge.connect(60000);
  } catch (e) {
    await stop();
    throw e;
  }
  await sleep(2000);
  return { launched: true, stop, connect: () => bridge.connect(), quitAfter: true };
}
