import { test } from "node:test";
import assert from "node:assert/strict";
import { ANIMALS, player } from "../shared/game.js";
import { animal } from "../src/animals.js";
import { Rooms } from "../server/rooms.js";

test("eight selectable species have distinct, bounded batched models", () => {
  assert.equal(ANIMALS.length, 8);
  assert.equal(new Set(ANIMALS).size, 8);
  const signatures = new Set();
  for (const kind of ANIMALS) {
    assert.equal(player("a", "A", kind).animal, kind);
    const model = animal(kind, "#ffab63");
    const meshes = model.userData.body.children;
    assert(meshes.length <= 6, `${kind}: draw calls`);
    let vertices = 0;
    for (const mesh of meshes) {
      const positions = mesh.geometry.attributes.position;
      vertices += positions.count;
      assert([...positions.array].every(Number.isFinite), `${kind}: invalid geometry`);
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    assert(vertices < 7000, `${kind}: geometry budget`);
    signatures.add(meshes.map((m) => `${m.material.color.getHexString()}:${m.geometry.attributes.position.count}`).join("|"));
  }
  assert.equal(signatures.size, 8);
});

test("all eight species survive online selection, bots and rematch", () => {
  const rooms = new Rooms(), r = rooms.create("a", "A", ANIMALS[0]);
  for (let i = 1; i < 8; i++) rooms.join(r.code, String(i), "P", ANIMALS[i]);
  assert.deepEqual(rooms.state(r, "a").lobby.map((p) => p.animal), ANIMALS);
  r.players.forEach((p) => rooms.ready(r, p.id)); rooms.start(r, "a");
  assert.deepEqual(r.game.players.map((p) => p.animal), ANIMALS);
  r.game.phase = "finished"; rooms.rematch(r, "a");
  assert.deepEqual(r.players.map((p) => p.animal), ANIMALS);
  const solo = rooms.create("solo", "Solo");
  for (let i = 0; i < 7; i++) rooms.bot(solo, "solo");
  assert.deepEqual(solo.players.map((p) => p.animal), ANIMALS);
});
