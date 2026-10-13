import { test } from "node:test";
import assert from "node:assert/strict";
import { RevealCues } from "../src/audio.js";

const reveal = (round, clock, deaths = 1) => ({
  phase: "reveal", round, clock,
  shots: [{ id: "a" }, { id: "b" }],
  eliminated: Array.from({ length: deaths }, (_, id) => ({ id })),
});

test("effects follow visible beams and fire once per reveal, including casualty-free rounds", () => {
  const cues = new RevealCues();
  assert.equal(cues.update(reveal(1, 0), true), null);
  assert.equal(cues.update(reveal(1, 0.64), true), null);
  assert.deepEqual(cues.update(reveal(1, 0.65), true), { shots: 2, deaths: 1 });
  assert.equal(cues.update(reveal(1, 0.7), true), null);
  assert.equal(cues.update({ ...reveal(1, 0), phase: "results" }, true), null);
  assert.deepEqual(cues.update(reveal(2, 0.7, 0), true), { shots: 2, deaths: 0 });
});

test("muted and hidden reveals are consumed without catching up after unmute", () => {
  const cues = new RevealCues();
  assert.equal(cues.update(reveal(1, 0.1), false), null);
  assert.equal(cues.update(reveal(1, 0.7), true), null);
  assert.deepEqual(cues.update(reveal(2, 0.7), true), { shots: 2, deaths: 1 });
});

test("late snapshots stay silent; a new match resets round numbering", () => {
  const cues = new RevealCues();
  assert.equal(cues.update(reveal(1, 2), true), null);
  cues.reset();
  assert.deepEqual(cues.update(reveal(1, 0.7), true), { shots: 2, deaths: 1 });
});
