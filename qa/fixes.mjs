import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
try {
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await desktop.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/qa/render.html");
  await page.waitForFunction(() => !!window.qaScene);
  await page.evaluate(() => {
    qaGame.players[1].alive = false;
    qaGame.eliminated = [{ id: "p1", by: "test" }];
    qaGame.phase = "reveal";
    qaGame.clock = 1;
    qaView = undefined;
  });
  await page.evaluate(async () => {
    const { view } = await import("/shared/game.js");
    qaView = view(qaGame, "p0");
    for (let i = 0; i < 60; i++) qaDraw(i / 60);
  });
  assert.equal(
    await page.evaluate(() => qaScene.actors.get("p1").model.visible),
    true,
  );
  await page.screenshot({ path: "qa/fix-death-current.png" });
  await page.evaluate(async () => {
    const { view } = await import("/shared/game.js");
    qaGame.round++;
    qaGame.eliminated = [];
    qaGame.phase = "reveal";
    qaGame.clock = 0.1;
    qaView = view(qaGame, "p0");
    qaDraw(2);
  });
  assert.equal(
    await page.evaluate(() => qaScene.actors.get("p1").model.visible),
    false,
  );
  assert.equal(
    await page.evaluate(() => qaScene.actors.get("p1").label.hidden),
    true,
  );
  await page.screenshot({ path: "qa/fix-death-next.png" });
  const duel = await page.evaluate(async () => {
    const { createGame, player, tick, view, CONFIG } = await import(
      "/shared/game.js"
    );
    qaScene.draw(null, "p0", 0, 1 / 60, true);
    qaGame = createGame([
      player("p0", "Miso", "fox"),
      player("p1", "Pip", "penguin"),
    ]);
    qaGame.rings = 1;
    qaGame.radius = CONFIG.baseRadius;
    qaGame.round = 9;
    qaGame.phase = "results";
    qaGame.remaining = 0;
    tick(qaGame, 0.01);
    for (let i = 0; i < 100; i++) {
      tick(qaGame, 1 / 60);
      qaView = view(qaGame, "p0");
      qaDraw(i / 60);
    }
    qaGame.phase = "reveal";
    qaGame.clock = 1;
    qaView = view(qaGame, "p0");
    qaDraw(3);
    return {
      radius: qaGame.radius,
      duel: qaGame.duel,
      visible: [...qaScene.actors.values()].filter((a) => a.model.visible)
        .length,
      coreScale: qaScene.rings.at(-1).scale.x,
    };
  });
  assert.equal(duel.duel, true);
  assert.equal(duel.radius, 1.05);
  assert.equal(duel.visible, 2);
  assert.ok(Math.abs(duel.coreScale - 0.35) < 0.01);
  await page.screenshot({ path: "qa/final-duel-desktop.png" });
  const pointBlank = await page.evaluate(async () => {
    const { createGame, player, resolve, view, CONFIG } = await import("/shared/game.js");
    qaScene.draw(null, "p0", 0, 1 / 60, true);
    qaGame = createGame([player("p0", "Miso"), player("p1", "Pip", "penguin")]);
    qaGame.radius = CONFIG.finalRadius;
    qaGame.rings = 1;
    qaGame.duel = true;
    qaGame.players.forEach((p) => { p.s = 0.1; p.aim = 0; });
    resolve(qaGame);
    qaGame.clock = 1;
    qaView = view(qaGame, "p0");
    qaDraw(4);
    return {
      eliminated: qaGame.eliminated.length,
      hits: qaGame.shots.map((s) => s.hit),
      finiteTransforms: qaScene.shotGroup.children.every((o) => o.matrixWorld.elements.every(Number.isFinite)),
    };
  });
  assert.equal(pointBlank.eliminated, 0);
  assert.deepEqual(pointBlank.hits, [null, null]);
  assert.ok(pointBlank.finiteTransforms);
  await page.screenshot({ path: "qa/point-blank.png" });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto("http://localhost:5173");
  await mp.getByRole("button", { name: "Play practice" }).tap();
  await mp.waitForTimeout(400);
  async function dockCheck() {
    const buttons = await mp.locator(".bottom-hud button").all();
    assert.equal(buttons.length, 3);
    const boxes = [];
    for (const button of buttons) {
      assert.ok(await button.isVisible());
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.x >= 0 && box.x + box.width <= mp.viewportSize().width + 1);
      assert.ok(
        box.y >= 0 && box.y + box.height <= mp.viewportSize().height + 1,
      );
      boxes.push(box);
    }
    for (let i = 0; i < boxes.length - 1; i++)
      assert.ok(boxes[i].x + boxes[i].width <= boxes[i + 1].x);
    return boxes;
  }
  const portrait = await dockCheck();
  await mp.screenshot({ path: "qa/mobile-controls-v2.png" });
  // Capture the live player state to prove touch aiming works without moving.
  await mp.evaluate(async () => {
    const moduleUrl = performance.getEntriesByType("resource")
      .find((e) => new URL(e.name).pathname === "/src/scene.js").name;
    const { ArenaScene } = await import(moduleUrl);
    const original = ArenaScene.prototype.draw;
    window.restoreAimProbe = () => { ArenaScene.prototype.draw = original; };
    ArenaScene.prototype.draw = function (state, you, ...args) {
      const p = state?.players.find((p) => p.id === you);
      window.aimProbe = p && { s: p.s, aim: p.aim };
      return original.call(this, state, you, ...args);
    };
  });
  await mp.locator("canvas").tap({ position: { x: 80, y: 350 } });
  await mp.waitForTimeout(150);
  const firstAim = await mp.evaluate(() => aimProbe);
  await mp.locator("canvas").tap({ position: { x: 310, y: 500 } });
  await mp.waitForTimeout(150);
  const secondAim = await mp.evaluate(() => aimProbe);
  assert.equal(firstAim.s, secondAim.s);
  assert.ok(Math.abs(firstAim.aim - secondAim.aim) > 0.1);
  await mp.evaluate(() => restoreAimProbe());
  // Chromium CDP generates real touch pointers: keep walking while a second
  // finger taps the arena, then release only the aiming finger.
  const cdp = await mobile.newCDPSession(mp),
    right = portrait[1],
    finger = {
      x: right.x + right.width / 2,
      y: right.y + right.height / 2,
      id: 1,
    };
  const before = await mp
    .locator(".nameplate.self")
    .evaluate((e) => e.style.left + e.style.top);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  await mp.waitForTimeout(250);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger, { x: 120, y: 390, id: 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [finger],
  });
  const middle = await mp
    .locator(".nameplate.self")
    .evaluate((e) => e.style.left + e.style.top);
  await mp.waitForTimeout(300);
  const after = await mp
    .locator(".nameplate.self")
    .evaluate((e) => e.style.left + e.style.top);
  assert.notEqual(before, middle);
  assert.notEqual(middle, after);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mp.getByRole("button", { name: "FIRE" }).tap();
  await mp.waitForTimeout(150);
  assert.ok(await mp.locator("#shoot").isDisabled());
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.waitForTimeout(400);
  const landscape = await dockCheck();
  await mp.screenshot({ path: "qa/mobile-landscape-v2.png" });
  const mainFrameRate = await mp.evaluate(async () => {
    const moduleUrl = performance
      .getEntriesByType("resource")
      .find((e) => new URL(e.name).pathname === "/src/scene.js").name;
    const { ArenaScene } = await import(moduleUrl);
    const original = ArenaScene.prototype.draw;
    let frames = 0;
    ArenaScene.prototype.draw = function (...args) {
      frames++;
      return original.apply(this, args);
    };
    const start = performance.now();
    await new Promise((r) => setTimeout(r, 1500));
    ArenaScene.prototype.draw = original;
    return (frames * 1000) / (performance.now() - start);
  });
  assert.ok(
    mainFrameRate <= 65 && mainFrameRate > 10,
    `Measured ${mainFrameRate} renders/s`,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "qa/fixes-results.json",
    JSON.stringify(
      {
        oldCasualtyHidden: true,
        currentDeathVisible: true,
        duel,
        pointBlank,
        portrait,
        landscape,
        multiTouchMovementPreserved: true,
        touchAimIndependentOfMovement: true,
        mainFrameRate,
        errors,
        note: "Windows Edge headless. Mobile touch/DPR/rotation emulated, not physical device.",
      },
      null,
      2,
    ),
  );
  console.log(
    "Fixes passed: one-shot death presentation, tiny core duel, three-button portrait/landscape dock, real emulated multi-touch and frame cap.",
  );
} finally {
  await browser.close();
}
