import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const site = process.env.QA_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const proof = { site, simulatedLatency: "70 ms outgoing + 60–80 ms incoming", errors: [] };
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: i ? 1280 : 415, height: 1000 } });
    await context.addInitScript(() => {
      window.wsQA = { sent: [], states: [], closed: [] };
      const Native = WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener("close", (e) => wsQA.closed.push({ code: e.code, reason: e.reason }));
          this.addEventListener("message", (e) => {
            const m = JSON.parse(e.data);
            if (m.type === "state") wsQA.states.push(m);
          });
        }
        send(data) {
          wsQA.sent.push({ time: performance.now(), ...JSON.parse(data) });
          setTimeout(() => { if (this.readyState === Native.OPEN) super.send(data); }, 70);
        }
        set onmessage(handler) {
          super.onmessage = (e) => setTimeout(() => handler(e), 60 + Math.random() * 20);
        }
      };
    });
    const p = await context.newPage(); pages.push(p);
    p.on("pageerror", (e) => proof.errors.push(e.message));
    await p.goto(site);
    if (!process.env.QA_URL) await p.evaluate(async () => {
      const { OnlineMotion } = await import("/src/online-motion.js");
      const frame = OnlineMotion.prototype.frame;
      window.motionQA = [];
      OnlineMotion.prototype.frame = function (...args) {
        const display = frame.apply(this, args);
        if (window.collectMotionQA) motionQA.push(display.players.find((p) => p.id === args[1])?.s);
        return display;
      };
    });
    await p.getByRole("button", { name: "Play with friends" }).click();
  }
  const [host, guest] = pages;
  await host.getByRole("button", { name: "Create room" }).click();
  await host.locator(".code").waitFor();
  const code = (await host.locator(".code").innerText()).split(/\s/)[0];
  await guest.locator("#room-code").fill(code);
  await guest.getByRole("button", { name: "Join" }).click();
  await guest.locator(".code").waitFor();
  assert.equal(await guest.locator('[data-action="add-bot"]').count(), 0);
  for (let n = 3; n <= 8; n++) {
    await host.getByRole("button", { name: "Add bot" }).click();
    await host.waitForFunction((count) => document.querySelectorAll(".roster li").length === count, n);
  }
  assert(await host.getByRole("button", { name: "Add bot" }).isDisabled());
  await host.getByRole("button", { name: "Remove bot" }).click();
  await host.waitForFunction(() => document.querySelectorAll(".roster li").length === 7);
  await host.screenshot({ path: "../qa/surviveplease-online-bots.png" });
  for (const p of pages) await p.getByRole("button", { name: "Ready", exact: false }).click();
  await host.getByRole("button", { name: "Start match" }).click();
  await host.locator("#shoot").waitFor();
  await guest.locator("#shoot").waitFor();
  await host.evaluate(() => { window.collectMotionQA = true; });
  // 40 repeated keydowns/s previously triggered 1008 within two seconds.
  await host.evaluate(() => new Promise((resolve) => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    let n = 0;
    const timer = setInterval(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "d", repeat: true, bubbles: true }));
      if (++n === 160) {
        clearInterval(timer);
        document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "d", bubbles: true }));
        window.collectMotionQA = false;
        resolve();
      }
    }, 25);
  }));
  assert(await host.locator("#shoot").isVisible());
  const stats = await host.evaluate(() => {
    const inputs = wsQA.sent.filter((m) => m.type === "input");
    const maxPerSecond = Math.max(...inputs.map((m) => inputs.filter((p) => p.time >= m.time && p.time < m.time + 1000).length));
    const samples = window.motionQA || [];
    return { closed: wsQA.closed, maxPerSecond, frames: samples.length,
      movingFrames: samples.filter((s, i) => i && s !== samples[i - 1]).length,
      states: wsQA.states };
  });
  assert.deepEqual(stats.closed, []);
  assert(stats.maxPerSecond < 25);
  if (!process.env.QA_URL) assert(stats.frames > 30 && stats.movingFrames > stats.frames * 0.8);
  for (const m of stats.states.filter((m) => m.game?.phase === "position")) {
    assert(m.game.players.filter((p) => p.id !== m.you).every((p) => !("s" in p) && !("aim" in p)));
  }
  assert(stats.states.some((m) => m.game?.players.length === 7));
  await Promise.all(pages.map((p) => p.locator("#shoot").click()));
  for (const p of pages) await p.waitForFunction(() => document.querySelector("#phase-label")?.textContent === "THE REVEAL");
  const shots = await Promise.all(pages.map((p) => p.evaluate(() => wsQA.states.find((m) => m.game?.phase === "reveal").game.shots)));
  assert.deepEqual(shots[0], shots[1]);
  assert.equal(shots[0].length, 7);
  assert.deepEqual(proof.errors, []);
  delete stats.states;
  Object.assign(proof, { ...stats, bots: 5, fullRoomAndRemoval: true, hiddenPositionsPrivate: true, sevenSimultaneousShots: true });
  await writeFile("../qa/surviveplease-online-stability.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally { await browser.close(); }
