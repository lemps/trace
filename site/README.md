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
    ├── demo-setup.mjs   creates the demo repos and demo config
    ├── build-page.mjs   writes index.html from features.json
    ├── page.template.html
    ├── lib/             cdp.mjs (Windows driver), bridge*.mjs + ws-server.mjs (macOS driver),
    │                    app.mjs (launch), encode.mjs (ffmpeg), ui.mjs (trace's controls),
    │                    demo-*.mjs (the demo repos' files)
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

Clips come from the real app with **demo data only**. On Windows the runner drives
it over the WebView2 / Chrome DevTools Protocol (`lib/cdp.mjs`); on macOS, whose
WKWebView has no automation port, over a recording build's own bridge
(`lib/bridge.mjs`, below). The scenes are the same on both. You need:

- **A recording build of trace.** Only it reads `TRACE_DEV_CONFIG_DIR` (and
  `TRACE_DEV_CONDUCTOR_DIR`, a demo Conductor install for the importer: it stands in
  for Conductor's data and home folders, so `<it>/com.conductor.app/conductor.db`,
  `<it>/.conductor/`, `<it>/conductor/workspaces/`). Release builds ignore both. Build
  it from the repo root:

  ```sh
  npx tauri build --no-bundle --features recording --config src-tauri/tauri.recording.conf.json
  ```

  The `recording` Cargo feature adds the config overrides and the recorder's
  commands; the conf builds the frontend with `npm run build:recording`
  (`vite build --mode recording`, which sets `VITE_TRACE_RECORDING=1` from
  `.env.recording`) and gives the build its own identifier, so its WebKit storage is
  apart from your trace's. The binary is `src-tauri/target/release/trace`. Don't
  ship it, and don't enable either flag in the release workflow:
  `npm run check:recording` builds the frontend as a release does and fails if the
  bridge is in it (`-- --exe <binary>` also checks a built binary has none of the
  Rust side). The runner refuses to launch a build that doesn't honour the demo
  config: it checks that trace's `scheduler.lock` appears there, and stops the build
  if it doesn't (on macOS it also won't start a binary without the recording hooks).
- **The demo data**: `TRACE_SITE_WORK=<dir> node site/scripts/demo-setup.mjs`. It
  creates three small git repos the scenes use, each with a few commits and a bare
  `origin` (worktrees fetch from it): `tinyroute` (a TypeScript HTTP router with
  `node --test` tests), `pixelsort` (a Rust CLI) and `weatherline` (a Python CLI),
  in `<dir>/demo`, and the demo config, `<dir>/config/trace/repos.json` listing them.
  Point `TRACE_DEV_CONFIG_DIR` at `<dir>/config`. It's safe to run again (existing
  repos are kept; `--reset` starts them over), uses no credentials, commits as a demo
  identity, and copies nothing from your own config. Keep `<dir>` outside your home
  folder: the repos' paths show on screen, and the runner stops on your home path.
- **ffmpeg** with libx264 and libvpx (any static build), as `TRACE_FFMPEG` or on PATH.
- **Claude Code**, signed in. The chat, subagent, inbox, fleet, sessions and
  orchestrator scenes run real, short prompts in the demo repos.

Environment:

| Variable | What |
| --- | --- |
| `TRACE_EXE` | the build to launch (Windows: if none is listening on the debug port; macOS: always, a recording build) |
| `TRACE_DEV_CONFIG_DIR` | the demo config folder |
| `TRACE_SITE_WORK` | a work folder outside the repo: WebView2 profile, frames |
| `TRACE_CDP_PORT` | the debug port (Windows; default 9600) |
| `TRACE_FFMPEG` | ffmpeg (default `ffmpeg`) |

### How the macOS driver works

- **The bridge.** The runner starts a WebSocket server on `127.0.0.1`, on a random
  port, with a random token, and launches the recording build with both
  (`TRACE_RECORDING_PORT`, `TRACE_RECORDING_TOKEN`). trace takes them out of its
  environment at start-up, so nothing it spawns inherits them, and its page
  (`src/recording/bridge.ts`) connects, says hello with the token, and runs the
  functions the scenes send. Every message carries the token; it's never logged or
  saved. The server accepts only loopback connections from trace's origin. As the
  token lasts one run, each run launches trace afresh and quits it at the end.
  trace's CSP is off (`"csp": null`), so the recording conf has nothing to relax.
- **Input** is synthesised in the page (`lib/bridge-input.mjs`): pointer and mouse
  events at an element's centre (hover enter/leave included), `execCommand
  ("insertText")` for typing, which React's inputs and xterm's hidden textarea both
  take, and key events with modifiers. They're untrusted events, so CSS `:hover`
  doesn't show, and the browser's own default actions are done by the driver
  (focus on click, wheel scrolling, the context menu).
- **Frames** are WKWebView's own snapshots of the page, at 2× (2560×1600 for a
  1280×800 clip), written as PNGs by trace; the encoder scales them to 1280. No
  Screen Recording permission is needed. It holds 20 fps, the clips' rate (about 50
  at most). Keep trace's window on screen while recording.
- **Stills** (`d.screenshot(file)`) show the window as you see it: the Browser tab's
  pages are native child webviews, not part of the page, so each visible one is
  snapshotted too and laid over the page with ffmpeg. Clips don't do this: in a
  recorded clip a Browser page is an empty pane, so show it in a still.

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
   screenshot). Its position in the list is its place on the page.
3. `node site/scripts/record.mjs <feature-id>`, then `node site/scripts/build-page.mjs`.
   Until its media is recorded, a feature listed in `features.json` is left off the page
   (the build says so), so a section can be written ahead of its clip.
