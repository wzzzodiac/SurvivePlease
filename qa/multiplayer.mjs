import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import WebSocket from "ws";
const site = process.env.QA_URL || "http://localhost:5173";
const endpoint = process.env.QA_WS_URL || "ws://localhost:3001";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [],
  packets = [[], []],
  pages = [];
try {
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const p = await context.newPage();
    pages.push(p);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("websocket", (ws) =>
      ws.on("framereceived", (f) => {
        try {
          const m = JSON.parse(f.payload);
          if (m.type === "state") packets[i].push(m);
        } catch {}
      }),
    );
    await p.goto(site);
    await p.locator("#player-name").fill(i ? "Atlas" : "Cauce");
    await p.getByRole("button", { name: "Play with friends" }).click();
    await p.locator("#server-url").fill(endpoint);
  }
  await pages[0].getByRole("button", { name: "Create room" }).click();
  await pages[0].waitForSelector(".code");
  const code = (await pages[0].locator(".code").innerText()).split(/\s/)[0];
  await pages[1].locator("#room-code").fill(code);
  await pages[1].getByRole("button", { name: "Join" }).click();
  await pages[1].waitForSelector(".code");
  await pages[0].screenshot({ path: "qa/multiplayer-lobby.png" });
  for (const p of pages)
    await p.getByRole("button", { name: "Ready" }).click();
  await pages[0].waitForTimeout(200);
  await pages[0].getByRole("button", { name: "Start match" }).click();
  for (const p of pages) await p.waitForSelector("#shoot");
  await pages[0].keyboard.down("d");
  await pages[1].keyboard.down("a");
  await pages[0].waitForTimeout(400);
  await pages[0].keyboard.up("d");
  await pages[1].keyboard.up("a");
  await pages[0].mouse.move(1250, 400);
  await pages[1].mouse.move(25, 650);
  await pages[0].waitForTimeout(200);
  const hidden = packets.map((arr) =>
    arr.filter((m) => m.game?.phase === "position").at(-1),
  );
  for (const m of hidden) {
    assert.ok(m);
    for (const p of m.game.players.filter((p) => p.id !== m.you)) {
      assert.equal("s" in p, false);
      assert.equal("aim" in p, false);
    }
  }
  const t = Date.now();
  await Promise.all(
    pages.map((p) => p.getByRole("button", { name: "LOCK SHOT" }).click()),
  );
  for (const p of pages)
    await p.waitForFunction(
      () =>
        document.querySelector("#phase-label")?.textContent === "THE REVEAL",
      {},
      { timeout: 4000 },
    );
  const earlyResolutionMs = Date.now() - t;
  assert.ok(earlyResolutionMs < 4000);
  await pages[0].screenshot({ path: "qa/multiplayer-reveal-a.png" });
  await pages[1].screenshot({ path: "qa/multiplayer-reveal-b.png" });
  const reveals = packets.map((arr) =>
    arr.find((m) => m.game?.phase === "reveal"),
  );
  assert.deepEqual(reveals[0].game.shots, reveals[1].game.shots);
  assert.equal(reveals[0].game.shots.length, 2);
  const a = packets[0].find((m) => m.game?.phase === "position");
  assert.notEqual(
    hidden[0].game.players.find((p) => p.id === a.you).s,
    a.game.players.find((p) => p.id === a.you).s,
  );
  await pages[1].close();
  await pages[0].waitForTimeout(150);
  await pages[0].waitForFunction(
    () => !!document.querySelector(".end-card"),
    {},
    { timeout: 30000 },
  );
  const reject = new WebSocket(endpoint, {
    origin: "https://untrusted.example",
  });
  const originRejected = await new Promise((resolve) => {
    reject.on("unexpected-response", (_, res) => {
      res.resume();
      resolve(res.statusCode === 403);
    });
    reject.on("error", () => resolve(true));
    reject.on("open", () => {
      reject.close();
      resolve(false);
    });
  });
  assert.ok(originRejected);
  assert.deepEqual(errors, []);
  await writeFile(
    "qa/multiplayer-results.json",
    JSON.stringify(
      {
        site,
        endpoint,
        clients: 2,
        separateContexts: true,
        hiddenPacketsPrivate: true,
        simultaneousShotsIdentical: true,
        earlyResolutionMs,
        disconnectHandled: true,
        untrustedOriginRejected: originRejected,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Two real browser clients passed: lobby, ready/start, movement, hidden packets, simultaneous reveal, disconnect and origin rejection.",
  );
} finally {
  await browser.close();
}
