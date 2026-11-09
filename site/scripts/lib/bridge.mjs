// The macOS driver: the same API as cdp.mjs, for trace's WKWebView, which has no
// automation port. It needs a recording build of trace (site/README.md).
//
// The driver is a WebSocket server on 127.0.0.1, on a random port, with a random
// token per run. trace gets both at launch (app.mjs), and its page
// (src/recording/bridge.ts) connects, says hello with the token, and runs the
// functions sent to it. Every message both ways carries the token; it's never
// logged or written down. Input is synthesised in the page (bridge-input.mjs);
// frames come from WKWebView's own snapshots, written by trace.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { insertText, keyPress, metrics, pointer } from "./bridge-input.mjs";
import { sleep } from "./cdp.mjs";
import { composite } from "./encode.mjs";
import { listen } from "./ws-server.mjs";

const PROTOCOL = "trace-recording-bridge";
/** The page's origin in WKWebView. */
const ORIGIN = "tauri://localhost";
/** The capture rate: encode.mjs makes 20 fps clips. */
const FPS = 20;

/**
 * Start the driver's server. Returns { port, token, connect(timeout), close() };
 * connect resolves to a driver once trace's page has said hello.
 */
export async function startBridge() {
  const token = randomBytes(32).toString("hex");
  const expected = Buffer.from(token);
  const same = (t) => {
    const given = Buffer.from(typeof t === "string" ? t : "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  let page = null;
  let hellos = 0;
  /** Sources the scenes asked to run on every new document. */
  const newDoc = [];
  const peers = new Set();
  const waiting = new Set();
  const pending = new Map();
  let nextId = 0;
  const server = await listen({
    protocol: PROTOCOL,
    accept: (req) => req.headers.origin === ORIGIN,
    onPeer: (peer) => {
      peers.add(peer);
      let hello = false;
      peer.onmessage = (text) => {
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          return peer.close();
        }
        if (!same(msg.token)) return peer.close();
        if (!hello) {
          if (msg.type !== "hello") return peer.close();
          hello = true;
          page?.close();
          page = peer;
          for (const w of waiting) w();
          // A reloaded page: run the new-document scripts again.
          if (hellos++) for (const src of newDoc) call(runNewDoc, [src]).catch(() => {});
          return;
        }
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        "error" in msg ? p.rej(new Error(msg.error)) : p.res(msg.result);
      };
      peer.onclose = () => {
        peers.delete(peer);
        if (page !== peer) return;
        page = null;
        for (const [id, p] of pending) {
          pending.delete(id);
          p.rej(new Error("trace's page went away"));
        }
      };
    },
  });

  /** Wait until the page is connected (it reconnects after a reload). */
  const ready = async (timeout = 30000) => {
    if (page) return page;
    let done;
    const wait = new Promise((r) => {
      done = r;
      waiting.add(r);
    });
    const timer = sleep(timeout).then(() => "timeout");
    const r = await Promise.race([wait, timer]);
    waiting.delete(done);
    if (r === "timeout" || !page) throw new Error("trace's page didn't connect to the recorder");
    return page;
  };

  /** Run `fn` (a function, or its source) in the page with `args`. */
  const call = async (fn, args = []) => {
    const peer = await ready();
    const id = ++nextId;
    const src = typeof fn === "function" ? fn.toString() : String(fn);
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      peer.send(JSON.stringify({ token, id, fn: src, args }));
    });
  };

  return {
    port: server.port,
    token,
    connect: async (timeout) => {
      await ready(timeout);
      return makeDriver(call, newDoc);
    },
    close: () => {
      for (const p of peers) p.close();
      server.close();
    },
  };
}

/** Wrap an expression as a function, so the page always runs a function. */
const asFn = (expr) => (typeof expr === "function" ? expr : `() => (${expr})`);

/**
 * Run a script meant for each new document. The page has already loaded when
 * it runs, so its DOMContentLoaded listeners run at once.
 */
function runNewDoc(src) {
  const run = new Function("addEventListener", src);
  run((type, fn) => (type === "DOMContentLoaded" ? fn() : addEventListener(type, fn)));
}

/** `newDoc`: the sources the scenes asked to run on every new document. */
function makeDriver(call, newDoc) {
  /** The page's metrics once a resize has landed: the same twice, 150 ms apart. */
  const settled = async () => {
    let last = await call(metrics);
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      const m = await call(metrics);
      if (i >= 2 && m.width === last.width && m.height === last.height) return m;
      last = m;
    }
    return last;
  };
  const d = {
    eval: (expr, ...args) => call(asFn(expr), args),
    /** Size the page to width × height CSS pixels; resolves to devicePixelRatio. */
    async viewport(width = 1280, height = 800) {
      // The window's size takes in its title bar: ask, measure, and ask again
      // with the difference added.
      let [w, h] = [width, height];
      let m;
      for (let i = 0; i < 4; i++) {
        await call((a, b) => rec.viewport(a, b), [w, h]);
        m = await settled();
        if (m.width === width && m.height === height) return m.dpr;
        w += width - m.width;
        h += height - m.height;
      }
      throw new Error(`the page is ${m.width}×${m.height}, not ${width}×${height}`);
    },
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
    center: (selector, text) =>
      d.waitFor(
        (sel, txt) => {
          const els = [...document.querySelectorAll(sel)].filter((e) => {
            const r = e.getBoundingClientRect();
            if (!r.width || !r.height) return false;
            if (!txt) return true;
            const t = (e.innerText || e.getAttribute("aria-label") || e.title || "").trim();
            return t === txt || t.startsWith(txt);
          });
          const e = els.find((x) => !els.some((o) => o !== x && x.contains(o)));
          if (!e) return null;
          e.scrollIntoView({ block: "nearest" });
          const r = e.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        },
        15000,
        selector,
        text ?? null,
      ),
    async click(selector, text, opts = {}) {
      const { x, y } = await d.center(selector, text);
      await d.mouse(x, y, opts);
    },
    mouse: (x, y, opts = {}) => call(pointer, ["click", x, y, opts]),
    async hover(selector, text) {
      const { x, y } = await d.center(selector, text);
      await call(pointer, ["move", x, y]);
    },
    async type(text, delay = 35) {
      for (const ch of text) {
        if (ch === "\n") await d.key("Enter");
        else await call(insertText, [ch]);
        await sleep(delay);
      }
    },
    key: (key, modifiers = 0) => call(keyPress, [key, modifiers]),
    /**
     * A PNG of the window as the user sees it: the page, with each Browser-tab page
     * (a native child webview, snapshotted on its own) laid over it where it sits.
     * `includeChildren: false` keeps just the page.
     */
    async screenshot(file, { includeChildren = true } = {}) {
      const out = resolve(file);
      const m = await call(metrics);
      const still = await call((f, w, h, c) => rec.snapshot(f, w, h, c), [out, m.width, m.height, includeChildren]);
      if (still.layers.length) composite(out, still.layers, m.dpr);
    },
    /** Record into `dir`: frame PNGs plus frames.json, as encode.mjs reads. Returns stop(). */
    async record(dir) {
      const abs = resolve(dir);
      rmSync(abs, { recursive: true, force: true });
      mkdirSync(abs, { recursive: true });
      const m = await call(metrics);
      await call((p, fps, w, h) => rec.captureStart(p, fps, w, h), [abs, FPS, m.width, m.height]);
      return async () => {
        await sleep(300);
        const frames = await call(() => rec.captureStop());
        writeFileSync(`${abs}/frames.json`, JSON.stringify({ frames, end: Date.now() / 1000 }));
        return frames.length;
      };
    },
    /** The CDP commands the scenes send, done the bridge's way. */
    async send(method, params = {}) {
      if (method === "Page.addScriptToEvaluateOnNewDocument") {
        newDoc.push(params.source);
        await call(runNewDoc, [params.source]);
        return {};
      }
      if (method === "Input.dispatchMouseEvent") {
        const kinds = { mouseMoved: "move", mouseWheel: "wheel", mousePressed: "down", mouseReleased: "up" };
        const { type, x, y, ...opts } = params;
        if (!kinds[type]) throw new Error(`send: no mouse event "${type}" on macOS`);
        return call(pointer, [kinds[type], x, y, opts]);
      }
      if (method === "Input.insertText") return call(insertText, [params.text]);
      throw new Error(`send("${method}") isn't supported by the macOS driver`);
    },
    close: () => {},
  };
  d.screencast = d.record;
  return d;
}

