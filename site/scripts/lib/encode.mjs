// Turn a recorded screencast (frames + frames.json + marks.json) into a looping
// clip: site/media/<id>.mp4 (H.264), <id>.webm (VP9) and <id>.jpg (poster).
//
// A clip's `segments` keep parts of the recording, each at its own speed:
//   [["typing-0.3", "sent", 1.4], ["sent", "approval", 4], ["approval", "end", 1]]
// Each end is a number of seconds, "start", "end", or a mark the scene made
// ("approval" is its first time, "approval:last" its last), optionally ± seconds.
// Marks keep the cuts right when a re-take runs faster or slower.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ffmpeg = () => process.env.TRACE_FFMPEG || "ffmpeg";
const LIMIT = 1.5 * 1024 * 1024;

function resolver(marks, total) {
  return (spec) => {
    if (typeof spec === "number") return spec;
    const m = /^(.+?)(?:([+-])(\d+(?:\.\d+)?))?$/.exec(spec);
    const [, name, sign, off] = m;
    let t;
    if (name === "start") t = 0;
    else if (name === "end") t = total;
    else {
      const [label, which] = name.split(":");
      const hits = marks.filter((x) => x.label === label);
      if (!hits.length) throw new Error(`no mark "${label}" (have: ${marks.map((x) => x.label).join(", ")})`);
      t = (which === "last" ? hits.at(-1) : hits[0]).t;
    }
    const o = off ? Number(off) * (sign === "-" ? -1 : 1) : 0;
    return Math.min(Math.max(t + o, 0), total);
  };
}

export function encodeClip(dir, out, clip) {
  const { frames, end } = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8"));
  const marks = existsSync(join(dir, "marks.json")) ? JSON.parse(readFileSync(join(dir, "marks.json"), "utf8")) : [];
  const t0 = frames[0].t;
  const total = end - t0;
  const at = resolver(marks, total);
  const segs = (clip.segments ?? [["start", "end", 1]]).map(([a, b, speed = 1]) => ({ a: at(a), b: at(b), speed }));

  // A concat list that holds each frame for as long as it was on screen,
  // divided by its segment's speed.
  const lines = [];
  let last = null;
  let length = 0;
  for (const { a, b, speed } of segs) {
    for (let i = 0; i < frames.length; i++) {
      const start = Math.max(frames[i].t - t0, a);
      const stop = Math.min(i + 1 < frames.length ? frames[i + 1].t - t0 : total, b);
      if (stop <= start) continue;
      const dur = (stop - start) / speed;
      lines.push(`file '${frames[i].name}'`, `duration ${dur.toFixed(4)}`);
      length += dur;
      last = frames[i].name;
    }
  }
  lines.push(`file '${last}'`);
  const list = join(dir, "list.txt");
  writeFileSync(list, lines.join("\n"));

  const vf = "fps=20,scale='min(1280,iw)':-2:flags=lanczos,format=yuv420p";
  const run = (args) => execFileSync(ffmpeg(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  const input = ["-f", "concat", "-safe", "0", "-i", list];
  const mp4 = `${out}.mp4`;
  const webm = `${out}.webm`;
  const jpg = `${out}.jpg`;
  run([...input, "-vf", vf, "-c:v", "libx264", "-preset", "veryslow", "-crf", "28", "-tune", "animation",
    "-movflags", "+faststart", "-an", mp4]);
  run([...input, "-vf", vf, "-c:v", "libvpx-vp9", "-crf", "44", "-b:v", "0", "-row-mt", "1", "-deadline", "good",
    "-cpu-used", "2", "-an", webm]);
  const posterAt = clip.poster ?? length - 0.1;
  run(["-ss", String(Math.max(0, posterAt)), "-i", mp4, "-frames:v", "1", "-q:v", "5", jpg]);
  const sizes = Object.fromEntries([mp4, webm, jpg].map((f) => [f, statSync(f).size]));
  return { length, sizes, tooBig: [mp4, webm].filter((f) => sizes[f] > LIMIT) };
}

/** A still: one screenshot, saved as a JPEG of at most 1280px. */
export function encodeStill(png, out) {
  const jpg = `${out}.jpg`;
  execFileSync(ffmpeg(), ["-hide_banner", "-loglevel", "error", "-y", "-i", png,
    "-vf", "scale='min(1280,iw)':-2:flags=lanczos", "-q:v", "4", jpg], { stdio: "inherit" });
  return { sizes: { [jpg]: statSync(jpg).size }, tooBig: [] };
}
