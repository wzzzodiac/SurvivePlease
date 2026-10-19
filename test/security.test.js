import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import { Rooms } from "../server/rooms.js";
import { createApp } from "../server/index.js";

test("invalid names cannot publish orphan rooms or alter an existing roster", () => {
  const rooms = new Rooms();
  for (const name of [JSON.parse('{"toString":null}'), {}, [], 42, null]) {
    assert.throws(() => rooms.create("bad", name), /Name must be text/);
    assert.equal(rooms.rooms.size, 0);
  }
  const room = rooms.create("host", "  Alice  ", "unknown-animal");
  assert.equal(room.players[0].name, "Alice");
  assert.equal(room.players[0].animal, "fox");
  assert.throws(() => rooms.join(room.code, "bad", {}), /Name must be text/);
  assert.equal(room.players.length, 1);
  assert.equal(rooms.create("default").players[0].name, "Animal");
});

test("all five idle reservations expire and capacity is recovered", () => {
  let now = 100000;
  const rooms = new Rooms({
    now: () => now,
    lobbyIdleMs: 100,
    lobbyMaxMs: 1000,
  });
  for (let i = 0; i < 5; i++) rooms.create(String(i), "Player");
  assert.throws(() => rooms.create("extra", "Extra"), /occupied/);
  now += 100;
  assert.equal(rooms.expire().length, 5);
  assert.equal(rooms.rooms.size, 0);
  assert(rooms.create("new", "New"));
});

test("lobby activity has a hard lifetime; active games and rematches remain valid", () => {
  let now = 100000;
  const rooms = new Rooms({
    now: () => now,
    lobbyIdleMs: 100,
    lobbyMaxMs: 250,
    finishedIdleMs: 50,
  });
  const stale = rooms.create("a", "A");
  for (let i = 0; i < 3; i++) {
    now += 90;
    rooms.ready(stale, "a");
  }
  assert.deepEqual(rooms.expire(), [stale]);
  const active = rooms.create("b", "B");
  rooms.bot(active, "b");
  rooms.ready(active, "b");
  rooms.start(active, "b");
  now += 10000;
  assert.deepEqual(rooms.expire(), []);
  active.game.phase = "finished";
  rooms.step(0);
  now += 49;
  assert.deepEqual(rooms.expire(), []);
  rooms.rematch(active, "b");
  assert.equal(active.finishedAt, null);
  now += 51;
  assert.deepEqual(rooms.expire(), []);
  rooms.ready(active, "b");
  rooms.start(active, "b");
  active.game.phase = "finished";
  rooms.step(0);
  now += 50;
  assert.deepEqual(rooms.expire(), [active]);
});

async function fixture(t, options = {}) {
  const app = createApp(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  async function connect() {
    const socket = new WebSocket(
      `ws://127.0.0.1:${app.server.address().port}`,
      {
        origin: "http://localhost:5173",
      },
    );
    const packets = [];
    socket.on("message", (raw) => packets.push(JSON.parse(raw.toString())));
    await once(socket, "open");
    return { socket, packets };
  }
  return { app, connect };
}
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    assert(Date.now() < deadline, "local fixture timed out");
    await delay(10);
  }
}

test("idle lobby/final snapshots stop, while live gameplay still publishes at 20 Hz", async (t) => {
  const { app, connect } = await fixture(t);
  const a = await connect(),
    b = await connect();
  a.socket.send(JSON.stringify({ type: "create", name: "A" }));
  await until(() => a.packets.some((p) => p.type === "state"));
  const code = a.packets.find((p) => p.type === "state").code;
  b.socket.send(JSON.stringify({ type: "join", code, name: "B" }));
  await until(
    () =>
      a.packets.some((p) => p.lobby?.length === 2) &&
      b.packets.some((p) => p.type === "state"),
  );
  const before = a.packets.length;
  await delay(180);
  assert.equal(
    a.packets.length,
    before,
    "unchanged lobby must not be broadcast repeatedly",
  );
  a.socket.send(JSON.stringify({ type: "ready" }));
  b.socket.send(JSON.stringify({ type: "ready" }));
  await until(() => a.packets.at(-1)?.lobby?.every((p) => p.ready));
  a.socket.send(JSON.stringify({ type: "start" }));
  await until(() => a.packets.at(-1)?.game);
  const activePackets = a.packets.length;
  await delay(180);
  assert(
    a.packets.length >= activePackets + 2,
    "live game snapshots still arrive",
  );
  const room = app.rooms.rooms.get(code);
  room.game.phase = "finished";
  app.step();
  await until(() => a.packets.at(-1)?.game?.phase === "finished");
  const finalPackets = a.packets.length;
  a.socket.send(JSON.stringify({ type: "unknown" }));
  await delay(180);
  assert.equal(
    a.packets.length,
    finalPackets,
    "unchanged result and unknown actions do not resend state",
  );
});

test("unjoined connections expire despite chatter, and expired rooms release every member", async (t) => {
  let now = 100000;
  const { app, connect } = await fixture(t, {
    now: () => now,
    joinTimeoutMs: 100,
    lifecycle: { lobbyIdleMs: 200 },
  });
  const idle = await connect();
  idle.socket.send(JSON.stringify({ type: "unknown" }));
  const closed = once(idle.socket, "close");
  now += 100;
  app.sweep();
  assert.equal((await closed)[0], 1008);
  const a = await connect(),
    b = await connect();
  a.socket.send(JSON.stringify({ type: "create", name: "A" }));
  await until(() => a.packets.some((p) => p.type === "state"));
  const code = a.packets.find((p) => p.type === "state").code;
  b.socket.send(JSON.stringify({ type: "join", code, name: "B" }));
  await until(() => app.rooms.rooms.get(code).players.length === 2);
  const closes = [once(a.socket, "close"), once(b.socket, "close")];
  now += 200;
  app.sweep();
  assert.deepEqual(
    (await Promise.all(closes)).map((c) => c[0]),
    [1008, 1008],
  );
  assert.equal(app.rooms.rooms.size, 0);
  assert.equal(app.clients.size, 0);
});
