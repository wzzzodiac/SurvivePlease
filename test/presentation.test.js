import { test } from "node:test";
import assert from "node:assert/strict";
import { actorVisible } from "../src/presentation.js";
test("a casualty appears only in its own reveal/results, never in later rounds", () => {
  const dead = { id: "a", alive: false, s: 0.4 };
  for (const phase of ["reveal", "results"]) {
    assert.equal(
      actorVisible(dead, { phase, eliminated: [{ id: "a" }] }),
      true,
    );
    assert.equal(
      actorVisible(dead, { phase, eliminated: [{ id: "b" }] }),
      false,
    );
  }
  for (const phase of ["position", "shrink", "finished"])
    assert.equal(
      actorVisible(dead, { phase, eliminated: [{ id: "a" }] }),
      false,
    );
});
test("hidden living rivals have no visible avatar while revealed survivors remain visible", () => {
  assert.equal(
    actorVisible({ id: "a", alive: true }, { phase: "position" }),
    false,
  );
  assert.equal(
    actorVisible({ id: "a", alive: true, s: 0 }, { phase: "reveal" }),
    true,
  );
});
