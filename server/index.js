import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Rooms } from "./rooms.js";
import { CONFIG } from "../shared/game.js";
import { pathToFileURL } from "node:url";

export function createApp(options = {}) {
  const nowMs = options.now ?? Date.now;
  const rooms = new Rooms({ now: nowMs, ...options.lifecycle }),
    clients = new Map(),
    buckets = new Map();
  const maxConnections = CONFIG.maxRooms * CONFIG.maxPlayers;
  // Cloud Run proxies can share a socket IP. Keep the instance bounded without
  // mistaking all players for one household or trusting client-supplied headers.
  const ipConnections = process.env.K_SERVICE ? maxConnections : 12;
  const ipOpensPerMinute = process.env.K_SERVICE ? maxConnections * 2 : 20;
  const joinTimeoutMs = options.joinTimeoutMs ?? 15000;
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
    const now = nowMs();
    if (!b || now - b.time > 60000) {
      b = { time: now, count: 0, creates: 0 };
      buckets.set(ip, b);
    }
    if (
      !origins.includes(req.headers.origin) ||
      wss.clients.size >= maxConnections ||
      ++b.count > ipOpensPerMinute ||
      [...clients.values()].filter((c) => c.ip === ip).length >= ipConnections
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount >= 65536)
      return false;
    ws.send(JSON.stringify(data));
    return true;
  }
  function sendState(c) {
    const r = c.room;
    if (!r) return;
    const idle = !r.game || r.game.phase === "finished";
    if (idle && c.lastIdleRoom === r && c.lastIdleRevision === r.revision)
      return;
    if (send(c.ws, rooms.state(r, c.id)) && idle) {
      c.lastIdleRoom = r;
      c.lastIdleRevision = r.revision;
    }
  }
  function closeForPolicy(c, message) {
    send(c.ws, { type: "error", message });
    if (c.room) rooms.leave(c.room, c.id);
    c.room = null;
    c.lastIdleRoom = null;
    clients.delete(c.id);
    c.ws.close(1008, message);
    const timeout = setTimeout(() => c.ws.terminate(), 1000);
    timeout.unref();
    c.ws.once("close", () => clearTimeout(timeout));
  }
  function sweep() {
    const now = nowMs();
    for (const r of rooms.expire(now))
      for (const c of clients.values())
        if (c.room === r) closeForPolicy(c, "Room expired after inactivity");
    for (const c of clients.values())
      if (!c.room && now >= c.joinDeadline)
        closeForPolicy(c, "Join a room before the connection expires");
  }
  wss.on("connection", (ws, req) => {
    const id = randomUUID(),
      c = {
        ws,
        id,
        ip: req.socket.remoteAddress,
        room: null,
        count: 0,
        window: nowMs(),
        lastCreate: 0,
        alive: true,
        joinDeadline: nowMs() + joinTimeoutMs,
        lastIdleRoom: null,
        lastIdleRevision: -1,
      };
    clients.set(id, c);
    send(ws, { type: "hello", you: id });
    ws.on("pong", () => (c.alive = true));
    ws.on("message", (raw) => {
      try {
        const now = nowMs();
        if (now - c.window >= 1000) {
          c.window = now;
          c.count = 0;
        }
        if (++c.count > 40) {
          ws.close(1008, "Too many actions");
          return;
        }
        const m = JSON.parse(raw.toString());
        if (!m || typeof m !== "object" || Array.isArray(m)) return;
        if (
          ![
            "create",
            "join",
            "ready",
            "start",
            "rematch",
            "add-bot",
            "remove-bot",
            "input",
            "leave",
          ].includes(m.type)
        )
          return;
        if (m.type === "create" || m.type === "join") {
          if (c.room) throw Error("Leave your current room first");
          if (m.type === "create") {
            let b = buckets.get(c.ip);
            if (!b || now - b.time > 60000) {
              b = { time: now, count: 0, creates: 0 };
              buckets.set(c.ip, b);
            }
            if (now - c.lastCreate < 10000 || ++b.creates > 5)
              throw Error("Wait before creating another room");
            c.lastCreate = now;
            c.room = rooms.create(id, m.name, m.animal);
          } else
            c.room = rooms.join(
              (typeof m.code === "string" ? m.code : "").trim().toUpperCase(),
              id,
              m.name,
              m.animal,
            );
        } else if (c.room) {
          if (m.type === "ready") rooms.ready(c.room, id);
          if (m.type === "start") rooms.start(c.room, id);
          if (m.type === "rematch") rooms.rematch(c.room, id);
          if (m.type === "add-bot") rooms.bot(c.room, id);
          if (m.type === "remove-bot") rooms.bot(c.room, id, true);
          if (m.type === "input") rooms.input(c.room, id, m);
          if (m.type === "leave") {
            rooms.leave(c.room, id);
            c.room = null;
            c.lastIdleRoom = null;
            c.joinDeadline = now + joinTimeoutMs;
            send(ws, { type: "left" });
          }
        }
        // Movement snapshots already go out at 20 Hz; avoid duplicate replies
        // for every input packet, which makes arrival timing uneven.
        if (c.room && m.type !== "input") sendState(c);
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
  function step() {
    const now = performance.now();
    rooms.step((now - last) / 1000);
    last = now;
    sweep();
    for (const c of clients.values()) sendState(c);
  }
  const stateTimer = setInterval(step, 50);
  const heartbeatTimer = setInterval(() => {
    for (const c of clients.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
    for (const [ip, b] of buckets)
      if (nowMs() - b.time > 60000) buckets.delete(ip);
  }, 30000).unref();
  return {
    server,
    rooms,
    clients,
    step,
    sweep,
    close: async () => {
      clearInterval(stateTimer);
      clearInterval(heartbeatTimer);
      for (const ws of wss.clients) ws.terminate();
      await new Promise((resolve) => wss.close(resolve));
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = createApp();
  app.server.listen(Number(process.env.PORT) || 3001, "0.0.0.0", () =>
    console.log(
      "SurvivePlease WebSocket on port " + (process.env.PORT || 3001),
    ),
  );
}
