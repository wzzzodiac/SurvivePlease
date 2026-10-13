import { test } from "node:test";
import assert from "node:assert/strict";
import { Rooms } from "../server/rooms.js";
import { OnlineMotion } from "../src/online-motion.js";

test("host can add/remove ready bots, fill eight seats and start alone with bots", () => {
  const rooms = new Rooms(), r = rooms.create("host", "H");
  assert.throws(() => rooms.bot(r, "visitor"), /host/);
  rooms.bot(r, "host");
  const bot = r.players[1];
  assert(bot.bot && bot.ready);
  rooms.ready(r, bot.id);
  assert(bot.ready);
  rooms.bot(r, "host", true);
  assert.equal(r.players.length, 1);
  for (let i = 0; i < 7; i++) rooms.bot(r, "host");
  assert.equal(new Set(r.players.map((p) => p.id)).size, 8);
  assert.throws(() => rooms.bot(r, "host"), /full/);
  rooms.ready(r, "host");
  rooms.start(r, "host");
  assert.equal(r.game.players.filter((p) => p.bot).length, 7);
  assert.throws(() => rooms.bot(r, "host", true), /started/);
  for (let i = 0; i < 20; i++) rooms.step(0.1);
  assert(r.game.players.filter((p) => p.bot).some((p) => p.excursion > 0));
});

test("bots never inherit hosting or keep a room alive without humans", () => {
  const rooms = new Rooms(), r = rooms.create("a", "A");
  rooms.bot(r, "a");
  rooms.join(r.code, "b", "B");
  rooms.leave(r, "a");
  assert.equal(r.host, "b");
  rooms.leave(r, "b");
  assert.equal(rooms.rooms.size, 0);
});

const snapshot = () => ({ phase: "position", round: 1, radius: 5.3, clock: 1, remaining: 19, players: [
  { id: "you", alive: true, locked: false, s: 0.999, aim: 1 }, { id: "hidden", alive: true },
] });
test("online presentation moves between packets, wraps corners and keeps authority/private state intact", () => {
  const motion = new OnlineMotion(), game = snapshot(), before = structuredClone(game);
  motion.receive(game, 1000);
  const a = motion.frame(game, "you", 1, 2, 1016, 0.016);
  const b = motion.frame(game, "you", 1, 2, 1032, 0.016);
  assert.notEqual(a.players[0].s, b.players[0].s);
  assert(b.players[0].s >= 0 && b.players[0].s < 0.02);
  assert.equal(b.players[0].aim, 2);
  assert.equal("s" in b.players[1], false);
  assert.deepEqual(game, before);
  game.players[0].locked = true;
  const locked = motion.frame(game, "you", 1, 2, 1050, 0.016);
  assert.equal(locked.players[0].s, game.players[0].s);
  game.phase = "reveal";
  assert.equal(motion.frame(game, "you", 1, 2, 1080, 0.016).players[0].s, game.players[0].s);
});

test("online clock extrapolation is bounded during a stalled connection", () => {
  const motion = new OnlineMotion(), game = snapshot();
  motion.receive(game, 1000);
  const frame = motion.frame(game, "you", 0, null, 5000, 0.016);
  assert.equal(frame.clock, 1.12);
  assert.equal(frame.remaining, 18.88);
});
