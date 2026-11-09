// A minimal WebSocket server (RFC 6455) for the macOS recording bridge: text
// frames, ping/pong and close, on 127.0.0.1 only. No dependencies, like cdp.mjs.

import { createHash } from "node:crypto";
import { createServer } from "node:http";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Encode one unmasked frame (servers never mask). */
function frame(opcode, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.alloc(2) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (n < 126) head[1] = n;
  else if (n < 65536) {
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

/** Wrap an upgraded socket: send(text), close(), onmessage(text), onclose(). */
function wrap(socket) {
  const peer = { onmessage: () => {}, onclose: () => {} };
  let buf = Buffer.alloc(0);
  let parts = [];
  let closed = false;
  const end = () => {
    if (closed) return;
    closed = true;
    socket.destroy();
    peer.onclose();
  };
  peer.send = (text) => !closed && socket.write(frame(0x1, Buffer.from(text)));
  peer.close = () => {
    if (!closed) socket.write(frame(0x8, Buffer.alloc(0)));
    end();
  };
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80;
      const opcode = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        at = 10;
      }
      // Clients must mask; anything else isn't a browser.
      if (!masked) return end();
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const data = Buffer.from(buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(at + 4 + len);
      if (opcode === 0x8) {
        socket.write(frame(0x8, data.subarray(0, 2)));
        return end();
      }
      if (opcode === 0x9) socket.write(frame(0xa, data));
      if (opcode === 0x1 || opcode === 0x0) {
        parts.push(data);
        if (fin) {
          const text = Buffer.concat(parts).toString("utf8");
          parts = [];
          peer.onmessage(text);
        }
      }
    }
  });
  socket.on("close", end);
  socket.on("error", end);
  return peer;
}

/**
 * Listen on 127.0.0.1 at a random port. `accept(req)` vets each upgrade request
 * (origin, subprotocol); `onPeer(peer)` gets each accepted connection.
 * Resolves to { port, close() }.
 */
export function listen({ protocol, accept, onPeer }) {
  const server = createServer((_req, res) => {
    res.writeHead(426).end();
  });
  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    const offered = String(req.headers["sec-websocket-protocol"] ?? "").split(/,\s*/);
    const ok =
      LOOPBACK.has(req.socket.remoteAddress) &&
      String(req.headers.upgrade).toLowerCase() === "websocket" &&
      key &&
      offered.includes(protocol) &&
      accept(req);
    if (!ok) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const digest = createHash("sha1").update(key + GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${digest}\r\nSec-WebSocket-Protocol: ${protocol}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    onPeer(wrap(socket));
  });
  return new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => {
      res({
        port: server.address().port,
        close: () => {
          server.closeAllConnections?.();
          server.close();
        },
      });
    });
  });
}
