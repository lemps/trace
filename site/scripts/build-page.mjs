// Build site/index.html from site/features.json and page.template.html, so the
// page's text works without JavaScript and nothing renders at runtime.
//
//   node site/scripts/build-page.mjs           write site/index.html
//   node site/scripts/build-page.mjs --check   fail if index.html is out of date
//
// A feature whose media isn't recorded yet is left off the page (see below).
//
// Env: SITE_URL  the published site's URL, for social cards (default: GitHub Pages)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const url = process.env.SITE_URL || "https://noble1911.github.io/trace/";
const { hero, features: listed } = JSON.parse(readFileSync(join(site, "features.json"), "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (i) => String(i + 1).padStart(2, "0");

// A section waits for its clip: one listed in features.json before it's recorded
// (`record.mjs <id>`) is left off the page, so the published page never shows a
// frame with nothing in it. Recording it and building again brings it in.
const mediaOf = (f) => (f.kind === "still" ? [`${f.id}.jpg`] : [`${f.id}.mp4`, `${f.id}.webm`, `${f.id}.jpg`]);
const features = listed.filter((f) => {
  const missing = mediaOf(f).filter((file) => !existsSync(join(site, "media", file)));
  if (missing.length > 0) console.warn(`${f.id}: left off the page until it's recorded (no media/${missing.join(", media/")}): run record.mjs ${f.id}`);
  return missing.length === 0;
});

const index = features
  .map((f, i) => `            <li><a href="#${f.id}"><span class="n">${num(i)}</span>${esc(f.label)}</a></li>`)
  .join("\n");

const media = (f) =>
  f.kind === "still"
    ? `<div class="frame"><img src="media/${f.id}.jpg" width="1280" height="800" loading="lazy" decoding="async" alt="${esc(f.alt)}" /></div>
            <figcaption>${esc(f.caption ?? "")}</figcaption>`
    : `<div class="frame">
              <video data-clip muted loop playsinline preload="none" width="1280" height="800" poster="media/${f.id}.jpg" aria-label="${esc(f.label)}" aria-describedby="${f.id}-desc">
                <source data-src="media/${f.id}.mp4" type="video/mp4" />
                <source data-src="media/${f.id}.webm" type="video/webm" />
              </video>
            </div>
            <figcaption id="${f.id}-desc"><span class="visually-hidden">What the clip shows: </span>${esc(f.alt)}</figcaption>`;

const sections = features
  .map(
    (f, i) => `      <section class="feature" id="${f.id}" aria-labelledby="${f.id}-title">
        <div class="wrap">
          <div class="copy">
            <p class="label"><b>${num(i)}</b> ${esc(f.label)}</p>
            <h2 id="${f.id}-title">${esc(f.title)}</h2>
            <p>${esc(f.text)}</p>
            <ul class="points">
${f.points.map((p) => `              <li>${esc(p)}</li>`).join("\n")}
            </ul>
          </div>
          <figure>
            ${media(f)}
          </figure>
        </div>
      </section>`,
  )
  .join("\n\n");

const html = readFileSync(join(here, "page.template.html"), "utf8")
  .replaceAll("{{SITE_URL}}", url)
  .replace("{{HERO_TITLE}}", esc(hero.title))
  .replace("{{HERO_LEDE}}", esc(hero.lede))
  .replace("{{HERO_MEDIA}}", hero.media)
  .replace("{{HERO_ALT}}", esc(hero.alt))
  .replace("{{INDEX}}", index)
  .replace("{{FEATURES}}", sections);

const out = join(site, "index.html");
if (process.argv.includes("--check")) {
  if (!existsSync(out) || readFileSync(out, "utf8") !== html) {
    console.error("site/index.html is out of date: run node site/scripts/build-page.mjs");
    process.exit(1);
  }
  console.log("site/index.html is up to date");
} else {
  writeFileSync(out, html);
  console.log(`wrote ${out} (${features.length} features)`);
}
