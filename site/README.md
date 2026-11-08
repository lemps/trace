# trace's homepage

A static page (plain HTML, CSS and a little JS) published to GitHub Pages by
`.github/workflows/site.yml` whenever `site/**` changes on `main`.

```
site/
├── index.html           built from features.json + scripts/page.template.html (don't edit by hand)
├── features.json        the manifest: hero text, and one entry per feature section, in page order
├── 404.html
├── css/                 tokens.css (fonts, dark and light themes), base.css, sections.css
├── site.js              theme toggle, OS-aware download button, videos that play only on screen
├── assets/              icons from src-tauri/icons, the social card
├── fonts/               Geist and Geist Mono (variable woff2), SIL Open Font License in OFL.txt
├── media/               <feature-id>.mp4 / .webm / .jpg (poster), recorded from the real app
└── scripts/             recording and page-building scripts (not published)
    ├── record.mjs       the runner: node record.mjs <feature-id>... | --all
    ├── build-page.mjs   writes index.html from features.json
    ├── page.template.html
    ├── lib/             cdp.mjs (DevTools client), app.mjs (launch), encode.mjs (ffmpeg), ui.mjs (trace's controls)
    └── scenes/          one self-contained scene per feature: <feature-id>.mjs
```

## Preview locally

The page uses relative paths, so any static server works:
`npx serve site` or `python -m http.server -d site`. Only `404.html` assumes the
Pages path (`/trace/`).

After changing `features.json` or `scripts/page.template.html`, rebuild the page:
`node site/scripts/build-page.mjs`. CI runs it with `--check` and fails if
`index.html` is out of date.

## Publishing (one-time setup)

1. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Run the **Site** workflow once from the Actions tab (or push a change under `site/`).
3. The page is then at `https://noble1911.github.io/trace/`. With a custom domain,
   set it in Settings → Pages, and change the `/trace/` paths in `404.html` and
   `SITE_URL` (used for the social card) when building the page.

## Recording clips

Clips come from the real app, driven over the WebView2 / Chrome DevTools Protocol,
with **demo data only**. You need:

- **A trace build that reads its config from `TRACE_DEV_CONFIG_DIR`.** `main` doesn't
  have this override. Add it locally (don't commit it): a `dev_config_dir()` in
  `src-tauri/src/helpers.rs` that returns `TRACE_DEV_CONFIG_DIR` when it's set and
  `dirs::config_dir()` otherwise, used by `trace_dir()` and by every other
  `dirs::config_dir()` call under `src-tauri/src`. Build with
  `npx tauri build --no-bundle`. The runner refuses to launch a build that doesn't
  honour the variable: it checks that trace's `scheduler.lock` appears in the demo
  config, and stops the build if it doesn't.
- **A demo config.** An empty folder, plus `<it>/trace/repos.json` listing the demo
  repos: `{"repos": ["<demo>/tinyroute", "<demo>/pixelsort", "<demo>/weatherline"]}`.
  No credentials or tokens; never copy your own config.
- **Demo repos.** Three small git repos the scenes use: `tinyroute` (a TypeScript HTTP
  router with `node --test` tests), `pixelsort` (a Rust CLI) and `weatherline` (a
  Python CLI). Give each a bare repo as `origin` (worktrees fetch from it), and on
  Windows set `core.autocrlf input` in each so `git status` stays clean.
- **ffmpeg** with libx264 and libvpx (any static build), as `TRACE_FFMPEG` or on PATH.
- **Claude Code**, signed in. The chat, subagent, inbox, fleet, sessions and
  orchestrator scenes run real, short prompts in the demo repos.

Environment:

| Variable | What |
| --- | --- |
| `TRACE_EXE` | the build to launch, if none is listening on the debug port |
| `TRACE_DEV_CONFIG_DIR` | the demo config folder |
| `TRACE_SITE_WORK` | a work folder outside the repo: WebView2 profile, frames |
| `TRACE_CDP_PORT` | the debug port (default 9600) |
| `TRACE_FFMPEG` | ffmpeg (default `ffmpeg`) |

The runner records at 1280×800, hides the signed-in account's usage meter, and
stops without encoding if your home folder or user name ever shows on screen.
Check each clip anyway before committing it. Clips should stay under 1.5 MB each
(the runner warns); the page's media is about 5 MB in total.

### Re-recording a feature

1. Start from the demo setup above (the scene builds any sessions it needs).
2. `node site/scripts/record.mjs <feature-id>` (several ids, or `--all`).
   It launches the build if none is running, records, and writes
   `site/media/<feature-id>.mp4`, `.webm` and `.jpg`, replacing only that feature's files.
   The `hero` scene is a still: `media/hero.jpg`, the image at the top of the page
   (`hero.media` in `features.json`).
3. Watch the clip. To change the cuts or speeds without recording again, edit the
   scene's `clip.segments` and run `record.mjs <feature-id> --encode-only`.
4. Commit the media.

### Adding a feature

1. Add `site/scripts/scenes/<feature-id>.mjs`, exporting:
   - `clip`: `{ segments, theme, viewport, poster }`, or `{ kind: "still" }` for a screenshot;
   - `setup(d)`: builds the demo data it needs (sessions, prompts) and opens the
     right screen; not recorded. Use the helpers in `lib/ui.mjs` (`ensureSession`,
     `newSession`, `rail`, `followTurn`, …) so the scene runs on its own;
   - `run(d, mark)`: the recorded actions. Make the action itself visible (typing,
     cards appearing, panes opening): the cursor isn't recorded. Call `mark("label")`
     at the moments `segments` cut at.
2. Add its entry to `site/features.json` (id, label, title, text, points, alt: a
   sentence describing what the clip shows; `"kind": "still"` and a `caption` for a
   screenshot). Its position in the list is its place on the page. Optional:
   - `more`: further clips stacked under the first, each `{ id, label, alt }` with
     its own scene (`scenes/<id>.mjs`), for a section that covers several things;
   - `placeholder`: `{ alt, caption }` to show `media/<id>.jpg` as a still until the
     clip is recorded (a section that was a still before it became a clip).
3. `node site/scripts/record.mjs <feature-id>`, then `node site/scripts/build-page.mjs`.
   Until its media is recorded, a clip listed in `features.json` is left off the page
   (the build says so), and a section with none of its clips recorded is left off too,
   so a section can be written ahead of its clip. `scripts/SCENES.md` plans each scene.
