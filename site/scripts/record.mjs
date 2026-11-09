// Record trace's feature clips from the real app.
//
//   node site/scripts/record.mjs <feature-id> [...]   record just those features
//   node site/scripts/record.mjs --all                record every scene
//   options:
//     --encode-only   re-encode from the frames already recorded (no app needed)
//     --quit          stop the app afterwards, if this run launched it
//
// Each feature is one self-contained scene: scenes/<feature-id>.mjs exports
//   clip     { kind: "video" | "still", viewport: [w, h], theme, segments, poster }
//   setup(d) builds the demo data the scene needs and gets the screen ready (not recorded)
//   run(d, mark) the recorded actions; mark(label) notes a time that `segments` can cut at
// Output: site/media/<feature-id>.mp4, .webm and .jpg (a still makes only the .jpg),
// so re-recording one feature replaces only its files.
//
// Env: see lib/app.mjs (TRACE_EXE, TRACE_DEV_CONFIG_DIR, TRACE_SITE_WORK, TRACE_CDP_PORT)
// and TRACE_FFMPEG (an ffmpeg binary; default "ffmpeg" on PATH).
// Drivers: Windows over WebView2's DevTools protocol (lib/cdp.mjs); macOS over a
// recording build's bridge (lib/bridge.mjs), launched afresh and stopped each run.

import { readdirSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureApp } from "./lib/app.mjs";
import { sleep } from "./lib/cdp.mjs";
import { encodeClip, encodeStill } from "./lib/encode.mjs";
import { setTheme } from "./lib/ui.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const media = resolve(here, "..", "media");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const all = readdirSync(join(here, "scenes"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => f.slice(0, -4));
const ids = flag("--all") ? all : args.filter((a) => !a.startsWith("--"));
const work = process.env.TRACE_SITE_WORK;
if (!ids.length || !work) {
  console.error(`usage: TRACE_SITE_WORK=<dir> node record.mjs <feature-id>... | --all\nscenes: ${all.join(", ")}`);
  process.exit(2);
}
for (const id of ids) if (!all.includes(id)) throw new Error(`no scene "${id}" (have: ${all.join(", ")})`);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const report = (r) => {
  for (const [f, n] of Object.entries(r.sizes)) console.log(`  ${f.slice(media.length + 1)}  ${kb(n)}`);
  for (const f of r.tooBig) console.warn(`  WARNING: ${f} is over 1.5 MB; shorten the clip or speed up a segment`);
};

// Text that must never be on screen: your home folder, and your user name as a
// word (a short name like "ron" is inside everyday words such as "front").
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const private_ = [
  [homedir(), new RegExp(escape(homedir()), "i")],
  [userInfo().username, new RegExp(`(?<![\\p{L}\\p{N}])${escape(userInfo().username)}(?![\\p{L}\\p{N}])`, "iu")],
].filter(([s]) => s && s.length > 2);
const leaks = async (d) => {
  const text = await d.eval(() => document.body.innerText).catch(() => "");
  return private_.filter(([, re]) => re.test(text)).map(([s]) => s);
};

const app = flag("--encode-only") ? null : await ensureApp();
try {
  for (const id of ids) {
    const scene = await import(`./scenes/${id}.mjs`);
    const clip = { kind: "video", viewport: [1280, 800], theme: "Dark", ...scene.clip };
    const frames = join(work, "frames", id);
    console.log(`\n${id}`);
    if (!app) {
      if (clip.kind === "video") report(encodeClip(frames, join(media, id), clip));
      continue;
    }
    const d = await app.connect();
    try {
      // A hidden page (screen locked, window minimised or on another Space) stops
      // its animations: a detail would stay at its first, invisible keyframe.
      const visible = () => d.eval(() => document.visibilityState !== "hidden");
      for (let i = 0; i < 20 && !(await visible()); i++) await sleep(500);
      if (!(await visible())) {
        throw new Error("trace's window isn't visible (is the screen locked?); keep it on screen while recording");
      }
      await d.viewport(...clip.viewport);
      // Hide the signed-in account's own usage meter: it isn't demo data. Hide
      // passing toasts ("Deleted …", "Scheduled …") too, but never an error: a clip
      // that would show one has gone wrong, and should be seen to.
      const hide = `(() => { const st = document.createElement("style"); st.id = "site-rec";
        st.textContent = ".ac-head-limits .ac-limit,.toaster .toast:not(.error){visibility:hidden!important}";
        (document.head || document.documentElement).append(st); })()`;
      await d.send("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener("DOMContentLoaded", () => ${hide})` });
      if (!(await d.eval(() => !!document.getElementById("site-rec")))) await d.eval(hide);
      // Agents start in Ask mode whatever the recording machine's Claude Code
      // defaults to (its settings.json may say plan mode): the clips show approvals.
      await d.eval(() => {
        if (!localStorage.getItem("trace.agentArgs")) localStorage.setItem("trace.agentArgs", "--permission-mode default");
      });
      if (clip.theme) await setTheme(d, clip.theme);
      await scene.setup?.(d);
      if (clip.kind === "still") {
        await sleep(500);
        const leaked = await leaks(d);
        if (leaked.length) throw new Error(`the screen shows private text (${leaked.join(", ")}); not saving ${id}`);
        const png = join(work, `${id}.png`);
        await d.screenshot(png);
        report(encodeStill(png, join(media, id)));
        continue;
      }
      const marks = [];
      const stop = await d.record(frames);
      const t0 = Date.now();
      const found = new Set();
      const check = async () => {
        for (const p of await leaks(d)) found.add(p);
      };
      const mark = (label) => {
        const t = (Date.now() - t0) / 1000;
        marks.push({ label, t });
        console.log(`  [mark] ${t.toFixed(1)}s ${label}`);
        check();
      };
      const watch = setInterval(check, 1000);
      try {
        await scene.run(d, mark);
      } finally {
        clearInterval(watch);
        await check();
        console.log(`  frames: ${await stop()}`);
        writeFileSync(join(frames, "marks.json"), JSON.stringify(marks));
      }
      if (found.size) {
        console.error(`  STOP: the screen showed private text (${[...found].join(", ")}); not encoding ${id}`);
        process.exitCode = 1;
        continue;
      }
      const r = encodeClip(frames, join(media, id), clip);
      console.log(`  length ${r.length.toFixed(1)}s`);
      report(r);
    } finally {
      d.close();
    }
  }
} finally {
  if (app && (flag("--quit") || app.quitAfter)) await app.stop();
}
