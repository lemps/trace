import {
  recordingBridge,
  recordingCaptureStart,
  recordingCaptureStop,
  recordingSnapshot,
  recordingViewport,
} from "@/ipc/recording";

// trace-recording-bridge: the page half of the homepage clip recorder's macOS
// driver (site/scripts/lib/bridge.mjs). Only a recording build has it: main.tsx
// imports it behind VITE_TRACE_RECORDING, which Vite inlines, so other builds drop
// it (`npm run check:recording` proves it).
//
// The driver is a WebSocket server on 127.0.0.1, its port and per-run token
// handed to trace at launch. This page connects to it, says hello with the token,
// then runs the functions it sends ({ token, id, fn, args }) and replies with
// { token, id, result | error }. A message without the token ends the bridge.

/** The WebSocket subprotocol; also the string the bundle check looks for. */
const PROTOCOL = "trace-recording-bridge";

/** What a driver function can reach besides the page: the recording commands. */
const recorder = {
  viewport: recordingViewport,
  snapshot: recordingSnapshot,
  captureStart: recordingCaptureStart,
  captureStop: recordingCaptureStop,
};

interface Call {
  token?: unknown;
  id?: unknown;
  fn?: unknown;
  args?: unknown;
}

/** Equal tokens, compared in time that doesn't depend on where they differ. */
function sameToken(given: unknown, token: string): boolean {
  if (typeof given !== "string" || given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** Run a driver function's source with its args; `rec` is the recording commands. */
async function run(fn: string, args: unknown[]): Promise<unknown> {
  // The driver's own code, sent over the authenticated loopback socket.
  const make = new Function("rec", `"use strict"; return (${fn});`) as (
    rec: typeof recorder
  ) => (...a: unknown[]) => unknown;
  return await make(recorder)(...args);
}

function describe(e: unknown): string {
  return e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
}

function connect(port: number, token: string): void {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, PROTOCOL);
  let refused = false;
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token }));
  ws.onmessage = async (ev) => {
    let call: Call;
    try {
      call = JSON.parse(String(ev.data)) as Call;
    } catch {
      call = {};
    }
    if (!sameToken(call.token, token) || typeof call.id !== "number") {
      refused = true;
      ws.close();
      return;
    }
    const reply = { token, id: call.id } as Record<string, unknown>;
    try {
      if (typeof call.fn !== "string") throw new Error("no function to run");
      const args = Array.isArray(call.args) ? call.args : [];
      reply.result = (await run(call.fn, args)) ?? null;
    } catch (e) {
      reply.error = describe(e);
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
  };
  // The driver may not be listening yet, or a scene reloaded the page: try again.
  ws.onclose = () => {
    if (!refused) setTimeout(() => connect(port, token), 1000);
  };
}

/** Connect to the recorder's driver, if trace was launched by it. */
export async function startRecordingBridge(): Promise<void> {
  const bridge = await recordingBridge().catch(() => null);
  if (bridge) connect(bridge.port, bridge.token);
}
