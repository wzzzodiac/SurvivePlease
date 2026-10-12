import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  player,
  input,
  tick,
  resolve,
  view,
  perimeterPoint,
  rayHit,
  CONFIG,
} from "../shared/game.js";
import { Rooms } from "../server/rooms.js";
const duel = () => createGame([player("a", "Alpha"), player("b", "Beta")]);
const advance = (g, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) tick(g, 0.05);
};
test("all confirmations end positioning immediately and freeze input", () => {
  const g = duel();
  input(g, "a", { move: 1, lock: true });
  const s = g.players[0].s;
  input(g, "a", { move: 1, aim: 1 });
  assert.equal(g.players[0].s, s);
  input(g, "b", { lock: true });
  tick(g, 0.01);
  assert.equal(g.phase, "reveal");
  assert.ok(g.remaining > 2);
});
test("timeout automatically records both shots", () => {
  const g = duel();
  advance(g, 20.1);
  assert.equal(g.phase, "reveal");
  assert.equal(g.shots.length, 2);
  assert.ok(g.players.every((p) => p.locked));
});
test("mutual hits eliminate simultaneously, independent of player order", () => {
  for (const reverse of [false, true]) {
    const g = duel();
    g.players[0].aim = Math.PI;
    g.players[1].aim = 0;
    if (reverse) g.players.reverse();
    resolve(g);
    assert.equal(g.players.filter((p) => p.alive).length, 0);
    advance(g, 4.7);
    assert.equal(g.phase, "finished");
    assert.equal(g.draw, true);
  }
});
test("ray misses behind and outside radius, hits the closest front surface", () => {
  assert.equal(rayHit({ x: 0, z: 0 }, 0, { x: -2, z: 0 }), null);
  assert.equal(rayHit({ x: 0, z: 0 }, 0, { x: 3, z: 1 }), null);
  assert.ok(Math.abs(rayHit({ x: 0, z: 0 }, 0, { x: 3, z: 0 }) - 2.52) < 1e-9);
  const g = createGame([player("a", "A"), player("b", "B"), player("c", "C")]);
  g.players[0].s = 0;
  g.players[0].aim = Math.PI;
  g.players[1].s = 0.5;
  g.players[2].s = 0.5;
  resolve(g);
  assert.equal(g.shots[0].hit, "b");
});
test("point-blank rays hit overlapping circles in every direction", () => {
  const origin = { x: 0, z: 0 };
  for (const target of [origin, { x: -0.2, z: 0 }, { x: 0, z: 0.2 }]) {
    for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2])
      assert.equal(rayHit(origin, angle, target), 0);
  }
  assert.equal(rayHit(origin, 0, { x: -CONFIG.hitRadius - 0.001, z: 0 }), null);
});

test("overlapping players eliminate each other simultaneously on every arena size", () => {
  for (const radius of [duel().radius, CONFIG.finalRadius]) {
    for (const gap of [0, 0.001]) {
      for (const reverse of [false, true]) {
        const g = duel();
        g.radius = radius;
        g.players[0].s = 0.1;
        g.players[1].s = 0.1 + gap;
        g.players[0].aim = 0;
        g.players[1].aim = Math.PI;
        if (reverse) g.players.reverse();
        resolve(g);
        assert.ok(g.players.every((p) => !p.alive));
        assert.ok(g.shots.every((shot) => shot.hit !== shot.id && shot.hit !== null));
        advance(g, 4.7);
        assert.equal(g.draw, true);
      }
    }
  }
});

test("continuous movement remains on hexagon edges, including wrap and corners", () => {
  const g = duel();
  input(g, "a", { move: 1 });
  for (let i = 0; i < 150; i++) {
    tick(g, 0.05);
    const s = g.players[0].s,
      pt = perimeterPoint(s, g.radius),
      edge = Math.floor(s * 6),
      v1 = perimeterPoint(edge / 6, g.radius),
      v2 = perimeterPoint((edge + 1) / 6, g.radius);
    assert.ok(
      Math.abs((pt.x - v1.x) * (v2.z - v1.z) - (pt.z - v1.z) * (v2.x - v1.x)) <
        1e-8,
    );
  }
  assert.ok(g.players[0].excursion > 0.7);
});
test("shrinking every third round preserves perimeter coordinates and reduces time", () => {
  const g = duel();
  g.round = 3;
  g.phase = "results";
  g.remaining = 0;
  g.players[0].s = 0.13;
  tick(g, 0.01);
  assert.equal(g.phase, "shrink");
  assert.equal(g.rings, 2);
  assert.equal(g.players[0].s, 0.13);
  advance(g, 1.6);
  assert.equal(g.round, 4);
  assert.equal(g.phase, "position");
  assert.ok(g.remaining <= 17);
});
test("minimum arena and timer stay bounded", () => {
  const g = duel();
  g.rings = 1;
  g.duel = true;
  g.radius = CONFIG.finalRadius;
  g.initialRings = 7;
  g.round = 24;
  g.phase = "results";
  g.remaining = 0;
  tick(g, 0.01);
  assert.equal(g.rings, 1);
  assert.equal(g.remaining, 7);
  assert.equal(g.phase, "position");
});

test("the last two survivors shrink to the core once, preserving their angle", () => {
  const g = duel();
  g.rings = 1;
  g.radius = CONFIG.baseRadius;
  g.round = 9;
  g.phase = "results";
  g.remaining = 0;
  const before = g.players.map((p) => p.s);
  tick(g, 0.01);
  assert.equal(g.duel, true);
  assert.equal(g.phase, "shrink");
  assert.equal(g.radius, CONFIG.finalRadius);
  assert.ok(g.radius < CONFIG.baseRadius / 2);
  assert.deepEqual(
    g.players.map((p) => p.s),
    before,
  );
  advance(g, 1.6);
  assert.equal(g.phase, "position");
  assert.ok(g.remaining <= CONFIG.minTime);
  input(g, "a", { move: 1 });
  tick(g, 0.1);
  assert.ok(
    Math.abs(g.players[0].s - (CONFIG.speed * 0.1) / (6 * CONFIG.baseRadius)) <
      1e-8,
  );
  assert.equal(view(g, "a").duel, true);
});

test("the core is reserved for two survivors and respects the contraction cadence", () => {
  for (const [count, round] of [
    [3, 9],
    [2, 8],
  ]) {
    const g = createGame(
      Array.from({ length: count }, (_, i) => player(String(i), "P")),
    );
    g.rings = 1;
    g.radius = CONFIG.baseRadius;
    g.round = round;
    g.phase = "results";
    g.remaining = 0;
    tick(g, 0.01);
    assert.equal(g.duel, false);
    assert.equal(g.radius, CONFIG.baseRadius);
    assert.equal(g.phase, "position");
  }
});
test("AFK warns twice, eliminates at three; tiny oscillations do not count", () => {
  const g = duel();
  for (let round = 1; round <= 3; round++) {
    g.players.forEach((p) => (p.aim = Math.PI / 2));
    g.players[0].excursion = 0.01;
    g.players[1].excursion = 1;
    resolve(g);
    assert.equal(g.players[0].afk, round);
    assert.equal(g.players[0].alive, round < 3);
  }
  assert.ok(g.eliminated.some((e) => e.id === "a" && e.by === "AFK"));
});
test("significant excursion clears consecutive inactivity", () => {
  const g = duel();
  g.players[0].afk = 2;
  g.players[0].excursion = 0.8;
  g.players.forEach((p) => (p.aim = Math.PI / 2));
  resolve(g);
  assert.equal(g.players[0].afk, 0);
});
test("hidden packets contain no rival coordinates or angles, including dead spectators", () => {
  const g = duel();
  for (const id of ["a", "spectator"]) {
    const v = view(g, id);
    for (const p of v.players.filter((p) => p.id !== id)) {
      assert.equal("s" in p, false);
      assert.equal("aim" in p, false);
    }
    assert.deepEqual(v.shots, []);
  }
  resolve(g);
  assert.ok(view(g, "a").players.every((p) => "s" in p));
});
test("rooms enforce 5 rooms, 8 participants, readiness and host", () => {
  const rooms = new Rooms();
  for (let i = 0; i < 5; i++) rooms.create("host" + i, "H");
  assert.throws(() => rooms.create("overflow", "H"));
  const r = [...rooms.rooms.values()][0];
  assert.throws(() => rooms.start(r, r.host));
  for (let i = 1; i < 8; i++) rooms.join(r.code, "p" + i, "P");
  assert.throws(() => rooms.join(r.code, "ninth", "P"));
  r.players.forEach((p) => rooms.ready(r, p.id));
  assert.throws(() => rooms.start(r, "p1"));
  rooms.start(r, r.host);
  assert.equal(r.game.initialRings, 7);
  assert.throws(() => rooms.join(r.code, "late", "P"));
});
test("disconnect transfers host, removes active player, cleans empty rooms", () => {
  const rooms = new Rooms(),
    r = rooms.create("a", "A");
  rooms.join(r.code, "b", "B");
  rooms.ready(r, "a");
  rooms.ready(r, "b");
  rooms.start(r, "a");
  rooms.leave(r, "a");
  assert.equal(r.host, "b");
  assert.equal(r.game.players[0].alive, false);
  rooms.leave(r, "b");
  assert.equal(rooms.rooms.size, 0);
});
test("bots move, lock and produce a complete match with a winner or draw", () => {
  const g = createGame(
    [
      player("a", "A", "fox", true),
      player("b", "B", "rabbit", true),
      player("c", "C", "frog", true),
    ],
    { roundTime: 4, revealTime: 0.1, resultTime: 0.1 },
  );
  let rounds = 0;
  for (let i = 0; i < 30000 && g.phase !== "finished"; i++) {
    tick(g, 0.05);
    rounds = Math.max(rounds, g.round);
  }
  assert.equal(g.phase, "finished");
  assert.ok(g.draw || g.winner);
  assert.ok(rounds >= 1);
});
test("input rejects non-finite angles and clamps movement", () => {
  const g = duel();
  const aim = g.players[0].aim;
  input(g, "a", { move: 999, aim: NaN });
  assert.equal(g.players[0].move, 1);
  assert.equal(g.players[0].aim, aim);
});
