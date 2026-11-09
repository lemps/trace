// The Browser tab (a still): the agent's chat beside a page in its Browser tab, a
// tinyroute playground served here on localhost. A Browser page is a native
// child webview, so a recorded clip would show an empty pane; a still includes
// it (the macOS driver snapshots it and lays it over the page).
import { createServer } from "node:http";
import { ROUTER, ensureSession, ensureStarted, openTab, paneMenu, resetPanes, sleep } from "../lib/ui.mjs";

export const clip = { kind: "still" };

const ROUTES = [
  ["GET", "/items/:id", "200", "item 7"],
  ["POST", "/items", "201", "created item 8"],
  ["DELETE", "/items/:id", "200", "deleted 7"],
  ["GET", "/health", "200", "ok"],
];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>tinyroute playground</title>
<style>
  body{margin:0;font:15px/1.5 -apple-system,system-ui,sans-serif;background:#f6f7f9;color:#1d2330}
  header{background:#1d2330;color:#fff;padding:18px 28px;display:flex;align-items:baseline;gap:12px}
  header b{font-size:20px} header span{opacity:.7;font-size:13px}
  main{padding:24px 28px;max-width:760px}
  h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6a7385;margin:22px 0 10px}
  table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px #0001}
  td,th{padding:10px 14px;text-align:left;border-bottom:1px solid #eceef2;font-size:14px}
  th{font-size:12px;color:#6a7385;font-weight:600}
  code{font:13px ui-monospace,Menlo,monospace}
  .m{font:600 12px ui-monospace,Menlo,monospace;padding:2px 7px;border-radius:5px;background:#e8f0fe;color:#1a56c4}
  .m.POST{background:#e6f6ec;color:#16794a}.m.DELETE{background:#fdecec;color:#b42318}
  .new{font-size:11px;color:#b42318;margin-left:6px}
  pre{background:#1d2330;color:#d7dce5;border-radius:10px;padding:14px 16px;font:13px/1.6 ui-monospace,Menlo,monospace}
  .ok{color:#7ee787}
</style></head><body>
<header><b>tinyroute</b><span>playground · localhost</span></header>
<main>
<h2>Routes</h2>
<table><tr><th>Method</th><th>Path</th><th>Status</th><th>Response</th></tr>
${ROUTES.map(([m, p, s, r]) => `<tr><td><span class="m ${m}">${m}</span>${m === "DELETE" ? '<span class="new">new</span>' : ""}</td><td><code>${p}</code></td><td>${s}</td><td><code>${r}</code></td></tr>`).join("")}
</table>
<h2>Try it</h2>
<pre>$ curl -X DELETE localhost/items/7
<span class="ok">HTTP/1.1 200 OK</span>
deleted 7</pre>
</main></body></html>`;

/** Serve the page on 127.0.0.1 (port 3000 if it's free), for as long as the run lasts. */
function serve() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  server.unref();
  return new Promise((done) => {
    server.once("error", () => server.listen(0, "127.0.0.1", () => done(server.address().port)));
    server.listen(3000, "127.0.0.1", () => done(server.address().port));
  });
}

export async function setup(d) {
  const port = await serve();
  await ensureSession(d, ROUTER);
  await resetPanes(d);
  // Running, so the composer shows the model and mode in use rather than a Start banner.
  await ensureStarted(d);
  // Empty, the tab offers an address bar; with a page already open (a retake), its
  // own bar navigates it. Either way it's `.bw-address-input`.
  await openTab(d, "Browser");
  await sleep(800);
  await d.click(".bw-address-input");
  await d.type(`localhost:${port}`, 10);
  await d.key("Enter");
  await sleep(2500);
  // Browser to the right of the chat.
  await paneMenu(d, 0);
  await d.click("[role=menuitem]", "Split right");
  await sleep(1200);
  await d.click('button.detail-tab[aria-label="Claude"]');
  await sleep(2500);
  await d.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 790 });
  await sleep(500);
}
