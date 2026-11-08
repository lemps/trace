// Minimal Chrome DevTools Protocol client for driving trace's WebView2 window.
// No dependencies: Node 22+ has fetch and WebSocket built in.
//
// Env:
//   TRACE_CDP_PORT   the --remote-debugging-port trace was started with (default 9600)

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PORT = Number(process.env.TRACE_CDP_PORT || 9600);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Connect to trace's main page target. */
export async function connect(port = PORT) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
  if (!page) throw new Error(`no page target on port ${port}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message} ${msg.error.data ?? ""}`)) : res(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method).delete(fn);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  return makeDriver({ send, on, close: () => ws.close() });
}

function makeDriver(c) {
  const d = {
    ...c,
    /** Evaluate an expression (or a function source with args) in the page. */
    async eval(expr, ...args) {
      const expression =
        typeof expr === "function" ? `(${expr.toString()})(...${JSON.stringify(args)})` : expr;
      const r = await c.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    /** Fix the viewport so every clip has the same size. */
    async viewport(width = 1280, height = 800) {
      await c.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    },
    /** Wait until `fn` (page-side) returns truthy. */
    async waitFor(fn, timeout = 15000, ...args) {
      const end = Date.now() + timeout;
      for (;;) {
        const v = await d.eval(fn, ...args).catch(() => null);
        if (v) return v;
        if (Date.now() > end) throw new Error(`timeout waiting for ${fn.toString().slice(0, 120)}`);
        await sleep(150);
      }
    },
    /** The centre of the first visible element matching a selector and (optionally) text. */
    async center(selector, text) {
      const p = await d.waitFor(
        (sel, txt) => {
          const els = [...document.querySelectorAll(sel)].filter((e) => {
            const r = e.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            if (!txt) return true;
            const t = (e.innerText || e.getAttribute("aria-label") || e.title || "").trim();
            return t === txt || t.startsWith(txt);
          });
          // The innermost match: a row's title, not the list that contains it.
          const e = els.find((x) => !els.some((o) => o !== x && x.contains(o)));
          if (!e) return null;
          e.scrollIntoView({ block: "nearest" });
          const r = e.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        },
        15000,
        selector,
        text ?? null,
      );
      return p;
    },
    /** Click like a user: real mouse events at the element's centre. */
    async click(selector, text, opts = {}) {
      const { x, y } = await d.center(selector, text);
      await d.mouse(x, y, opts);
    },
    async mouse(x, y, { button = "left", clickCount = 1 } = {}) {
      await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, clickCount });
      await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount });
    },
    async hover(selector, text) {
      const { x, y } = await d.center(selector, text);
      await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    },
    /** Type text visibly, a character at a time. */
    async type(text, delay = 35) {
      for (const ch of text) {
        if (ch === "\n") await d.key("Enter");
        else await c.send("Input.insertText", { text: ch });
        await sleep(delay);
      }
    },
    /** Press a key, with modifiers: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift. */
    async key(key, modifiers = 0) {
      const codes = {
        Enter: [13, "Enter", "\r"],
        Escape: [27, "Escape"],
        Tab: [9, "Tab"],
        ArrowDown: [40, "ArrowDown"],
        ArrowUp: [38, "ArrowUp"],
        ArrowLeft: [37, "ArrowLeft"],
        ArrowRight: [39, "ArrowRight"],
        Backspace: [8, "Backspace"],
      };
      const [vk, code, text] = codes[key] ?? [key.toUpperCase().charCodeAt(0), `Key${key.toUpperCase()}`];
      const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
      await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      if (text && !modifiers) await c.send("Input.dispatchKeyEvent", { type: "char", text, ...base });
      await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    },
    async screenshot(file) {
      const r = await c.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    /**
     * Record a screencast into `dir` (frame PNGs + frames.txt with timestamps).
     * Returns stop(), which resolves to the frame count.
     */
    async record(dir) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const frames = [];
      const off = c.on("Page.screencastFrame", async (p) => {
        const name = `f${String(frames.length).padStart(5, "0")}.jpg`;
        frames.push({ name, t: p.metadata.timestamp });
        writeFileSync(join(dir, name), Buffer.from(p.data, "base64"));
        c.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
      });
      await c.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
      // A frame only arrives when something paints; nudge one at the start.
      await d.eval("document.body.style.outline='0px solid transparent'");
      return async () => {
        await sleep(300);
        await c.send("Page.stopScreencast");
        off();
        const end = Date.now() / 1000;
        writeFileSync(join(dir, "frames.json"), JSON.stringify({ frames, end }));
        return frames.length;
      };
    },
  };
  return d;
}
