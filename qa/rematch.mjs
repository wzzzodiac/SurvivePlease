import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const site = process.env.QA_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const proof = { site, errors: [] };
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: i ? 1280 : 415, height: 950 } });
    await context.addInitScript(() => {
      const Native = WebSocket;
      window.wsQA = { states: [], closed: [] };
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args); window.socketQA = this;
          this.addEventListener("close", (e) => wsQA.closed.push(e.code));
          this.addEventListener("message", (e) => {
            const m = JSON.parse(e.data);
            if (m.type !== "state") return;
            wsQA.states.push(m);
            const own = m.game?.players.find((p) => p.id === m.you);
            if (window.autoLockQA && m.game?.phase === "position" && own?.alive && !own.locked) {
              const v = own.s * 6, a = Math.floor(v) * Math.PI / 3, t = v % 1;
              const x = (1 - t) * Math.cos(a) + t * Math.cos(a + Math.PI / 3);
              const z = (1 - t) * Math.sin(a) + t * Math.sin(a + Math.PI / 3);
              this.send(JSON.stringify({ type: "input", aim: Math.atan2(z, x), lock: true }));
            }
          });
        }
      };
      const AudioContext = window.AudioContext;
      window.voicesQA = 0;
      window.AudioContext = class extends AudioContext {
        createOscillator() { window.voicesQA++; return super.createOscillator(); }
      };
    });
    const p = await context.newPage(); pages.push(p);
    p.on("pageerror", (e) => proof.errors.push(e.message));
    await p.goto(site);
    await p.getByRole("button", { name: "Play with friends" }).click();
  }
  const [host, guest] = pages;
  await host.getByRole("button", { name: "Create room" }).click();
  await host.locator(".code").waitFor();
  const code = (await host.locator(".code").innerText()).split(/\s/)[0];
  await guest.locator("#room-code").fill(code);
  await guest.getByRole("button", { name: "Join" }).click();
  await guest.locator(".code").waitFor();
  await host.getByRole("button", { name: "Add bot" }).click();
  await host.waitForFunction(() => document.querySelectorAll(".roster li").length === 3);
  const crew = await host.evaluate(() => wsQA.states.at(-1).lobby.map((p) => p.id));
  for (const p of pages) {
    await p.evaluate(() => { window.autoLockQA = true; });
    await p.getByRole("button", { name: "Ready", exact: false }).click();
  }
  await host.getByRole("button", { name: "Start match" }).click();
  // Outward human shots leave the bot alive; AFK eventually ends this real match.
  await host.getByRole("button", { name: "Rematch", exact: false }).waitFor({ timeout: 65000 });
  await guest.locator(".end-card").waitFor();
  for (const p of pages) await p.evaluate(() => { window.autoLockQA = false; });
  assert.equal(await guest.locator('[data-action="rematch"]').count(), 0);
  await host.screenshot({ path: "../qa/surviveplease-rematch-end.png" });
  const oldVoices = await host.evaluate(() => voicesQA);
  await host.getByRole("button", { name: "Rematch", exact: false }).click();
  for (const p of pages) {
    await p.locator(".code").waitFor();
    assert((await p.locator(".code").innerText()).startsWith(code));
    const data = await p.evaluate(() => wsQA.states.at(-1));
    assert.deepEqual(data.lobby.map((p) => p.id), crew);
    assert(data.lobby.every((p) => p.ready === p.bot));
    assert.deepEqual(await p.evaluate(() => wsQA.closed), []);
    await p.getByRole("button", { name: "Ready", exact: false }).click();
  }
  await host.getByRole("button", { name: "Start match" }).click();
  for (const p of pages) await p.locator("#shoot").waitFor();
  const fresh = await host.evaluate(() => wsQA.states.at(-1).game);
  assert.equal(fresh.round, 1);
  assert(fresh.players.every((p) => p.alive && !p.locked));
  await Promise.all(pages.map((p) => p.locator("#shoot").click()));
  await host.waitForFunction((count) => voicesQA > count, oldVoices, { timeout: 12000 });
  Object.assign(proof, { sameRoom: true, sameTwoHumansAndBot: true, freshRoundOne: true, audioReplaysInRematch: true, noDisconnects: true });
  if (!process.env.QA_URL) {
    const p = await browser.newPage(); await p.goto(site + "/qa/render.html");
    await p.waitForFunction(() => window.qaScene && window.qaView);
    const samples = await p.evaluate(async () => {
      const { resolve, view } = await import("/shared/game.js");
      resolve(qaGame); qaView = view(qaGame, "p0");
      // A known impact also verifies its flash waits for the traveling beam.
      qaView.shots[0].hit = "p1";
      const samples = [];
      for (const clock of [0.65, 0.74, 0.84]) {
        qaView.clock = clock; qaDraw(1, 1 / 60);
        const beam = qaScene.shotGroup.children.find((o) => o.userData.flight);
        const flash = qaScene.shotGroup.children.find((o) => o.geometry.type === "IcosahedronGeometry");
        const { from, to, length } = beam.userData.flight;
        const origin = beam.position.clone().addScaledVector(to.clone().sub(from).normalize(), -beam.scale.y / 2);
        samples.push({ clock, fraction: beam.scale.y / length, originError: origin.distanceTo(from), flash: flash.visible });
      }
      return samples;
    });
    assert.equal(samples[0].fraction, 0);
    assert(Math.abs(samples[1].fraction - 0.5) < 0.001);
    assert.equal(samples[2].fraction, 1);
    assert(samples.every((s) => s.originError < 1e-8));
    assert(!samples[1].flash && samples[2].flash);
    proof.beamAnimation = samples;
  }
  assert.deepEqual(proof.errors, []);
  await writeFile("../qa/surviveplease-rematch-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally { await browser.close(); }
