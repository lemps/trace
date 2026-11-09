// Prove the homepage recorder's automation bridge (src/recording/bridge.ts) is
// only in recording builds. Run: `npm run check:recording`.
//
// Builds the frontend twice into temp folders: as a release does (`vite build`),
// which must contain none of the bridge's strings, and as the recorder does
// (`--mode recording`), which must contain them, or the check proves nothing.
//
//   --exe <path>   also check a built trace binary has none of the Rust side's
//                  strings (a release binary, or `npx tauri build` without
//                  `--features recording`)

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";

/** Strings only the bridge and its commands put in the bundle. */
const FRONTEND = ["trace-recording-bridge", "recording_bridge", "recording_capture_start"];
/** Strings only the `recording` Cargo feature puts in the binary. */
const BINARY = ["TRACE_RECORDING_TOKEN", "TRACE_DEV_CONFIG_DIR", "recording_capture_start"];

const root = join(import.meta.dirname, "..");

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Which of `markers` appear anywhere in the built files. */
async function buildAndScan(mode) {
  const out = mkdtempSync(join(tmpdir(), "trace-bundle-"));
  // A release build never has the flag; don't let the caller's shell add it.
  delete process.env.VITE_TRACE_RECORDING;
  try {
    await build({ root, mode, logLevel: "error", build: { outDir: out, emptyOutDir: true } });
    const text = files(out)
      .map((f) => readFileSync(f, "latin1"))
      .join("\n");
    return FRONTEND.filter((m) => text.includes(m));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

let failed = false;
const release = await buildAndScan("production");
if (release.length) {
  console.error(`FAIL: the release bundle contains the recording bridge (${release.join(", ")})`);
  failed = true;
} else console.log("ok: the release bundle has no recording bridge");

const recording = await buildAndScan("recording");
if (recording.length !== FRONTEND.length) {
  const missing = FRONTEND.filter((m) => !recording.includes(m));
  console.error(`FAIL: the recording bundle lacks ${missing.join(", ")}, so this check can't see the bridge`);
  failed = true;
} else console.log("ok: the recording bundle has the bridge (the check can see it)");

const exe = process.argv.includes("--exe") ? process.argv[process.argv.indexOf("--exe") + 1] : null;
if (exe) {
  const bytes = readFileSync(exe);
  const found = BINARY.filter((m) => bytes.includes(m));
  if (found.length) {
    console.error(`FAIL: ${exe} was built with the recording feature (${found.join(", ")})`);
    failed = true;
  } else console.log(`ok: ${exe} has no recording hooks`);
}
process.exit(failed ? 1 : 0);
