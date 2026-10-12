import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Rooms } from "./rooms.js";
const rooms = new Rooms(),
  clients = new Map(),
  buckets = new Map();
const origins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
).split(",");
const server = createServer((req, res) => {
  res.writeHead(req.url === "/health" ? 200 : 404, {
    "Content-Type": "application/json",
  });
  res.end(
    JSON.stringify(
      req.url === "/health"
        ? { ok: true, rooms: rooms.rooms.size }
        : { error: "Not found" },
    ),
  );
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 2048,
  perMessageDeflate: false,
});
server.on("upgrade", (req, socket, head) => {
  const ip = req.socket.remoteAddress;
  let b = buckets.get(ip);
  const now = Date.now();
  if (!b || now - b.time > 60000) {
    b = { time: now, count: 0, creates: 0 };
    buckets.set(ip, b);
  }
  if (
    !origins.includes(req.headers.origin) ||
    ++b.count > 20 ||
    [...clients.values()].filter((c) => c.ip === ip).length >= 12
  ) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536)
    ws.send(JSON.stringify(data));
}
wss.on("connection", (ws, req) => {
  const id = randomUUID(),
    c = {
      ws,
      id,
      ip: req.socket.remoteAddress,
      room: null,
      count: 0,
      window: Date.now(),
      lastCreate: 0,
      alive: true,
    };
  clients.set(id, c);
  send(ws, { type: "hello", you: id });
  ws.on("pong", () => (c.alive = true));
  ws.on("message", (raw) => {
    try {
      const now = Date.now();
      if (now - c.window >= 1000) {
        c.window = now;
        c.count = 0;
      }
      if (++c.count > 40) {
        ws.close(1008, "Too many actions");
        return;
      }
      const m = JSON.parse(raw.toString());
      if (!m || typeof m !== "object") return;
      if (m.type === "create" || m.type === "join") {
        if (c.room) throw Error("Sal de tu sala antes");
        if (m.type === "create") {
          let b = buckets.get(c.ip);
          if (!b || now - b.time > 60000) {
            b = { time: now, count: 0, creates: 0 };
            buckets.set(c.ip, b);
          }
          if (now - c.lastCreate < 10000 || ++b.creates > 5)
            throw Error("Espera antes de crear otra sala");
          c.lastCreate = now;
          c.room = rooms.create(id, m.name, m.animal);
        } else
          c.room = rooms.join(
            String(m.code || "")
              .trim()
              .toUpperCase(),
            id,
            m.name,
            m.animal,
          );
      } else if (c.room) {
        if (m.type === "ready") rooms.ready(c.room, id);
        if (m.type === "start") rooms.start(c.room, id);
        if (m.type === "input") rooms.input(c.room, id, m);
        if (m.type === "leave") {
          rooms.leave(c.room, id);
          c.room = null;
          send(ws, { type: "left" });
        }
      }
      if (c.room) send(ws, rooms.state(c.room, id));
    } catch (e) {
      send(ws, { type: "error", message: e.message });
    }
  });
  ws.on("close", () => {
    if (c.room) rooms.leave(c.room, id);
    clients.delete(id);
  });
  ws.on("error", () => ws.close());
});
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  rooms.step((now - last) / 1000);
  last = now;
  for (const c of clients.values())
    if (c.room) send(c.ws, rooms.state(c.room, c.id));
}, 50);
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
  for (const [ip, b] of buckets)
    if (Date.now() - b.time > 60000) buckets.delete(ip);
}, 30000).unref();
server.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
  console.log("SurvivePlease WebSocket on port " + (process.env.PORT || 3001)),
);
