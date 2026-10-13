import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.QA_URL || "http://127.0.0.1:5173/";
const proof = { url: base, checks: [] };
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 320 });
    await context.addInitScript(() => {
      window.audioQA = { contexts: [], music: [], voices: [], gains: [] };
      const NativeContext = window.AudioContext, NativeAudio = window.Audio;
      window.AudioContext = class extends NativeContext {
        constructor(...args) { super(...args); window.audioQA.contexts.push(this); }
        createOscillator() { const voice = super.createOscillator(); window.audioQA.voices.push(voice); return voice; }
        createGain() { const gain = super.createGain(); window.audioQA.gains.push(gain); return gain; }
      };
      window.Audio = class extends NativeAudio {
        constructor(...args) { super(...args); window.audioQA.music.push(this); }
      };
    });
    const page = await context.newPage(), errors = [], requests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(base);
    await page.getByRole("button", { name: "Mute all audio" }).waitFor();
    assert(!requests.some((url) => url.endsWith(".mp3")), "No music download before a gesture");
    await page.getByRole("button", { name: "Mute all audio" }).click();
    assert.equal(await page.evaluate(() => audioQA.contexts.length), 0);
    await page.getByRole("button", { name: "Enable all audio" }).click();
    await page.waitForFunction(() => audioQA.music[0]?.currentTime > 0 && audioQA.contexts[0]?.state === "running");
    const music = await page.evaluate(() => ({ duration: audioQA.music[0].duration, loop: audioQA.music[0].loop }));
    assert(music.duration > 115 && music.duration < 120);
    assert(music.loop);
    await page.locator("#player-name").fill("Audio QA");
    await page.getByRole("button", { name: "Mute all audio" }).click();
    assert.equal(await page.locator("#player-name").inputValue(), "Audio QA");
    assert(await page.evaluate(() => audioQA.music[0].paused));
    await page.getByRole("button", { name: /Play practice/ }).click();
    await page.getByRole("button", { name: "Enable all audio" }).waitFor();
    await page.getByRole("button", { name: "Enable all audio" }).click();
    await page.waitForFunction(() => !audioQA.music[0].paused);
    await page.getByLabel("Adjust volume").click();
    await page.getByRole("slider", { name: "Master volume" }).press("Home");
    await page.waitForFunction(() => audioQA.gains[0].gain.value < 0.001);
    await page.getByRole("slider", { name: "Master volume" }).evaluate((slider) => {
      slider.value = "30"; slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => Math.abs(audioQA.gains[0].gain.value - 0.3) < 0.001);
    assert.equal(await page.locator("#volume-value").textContent(), "30%");
    const bounds = await page.locator("header").evaluate((header) => [...header.querySelectorAll("a,button,summary,.mode-tag,.volume-popover")].filter((el) => el.getBoundingClientRect().width).map((el) => {
      const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, right: r.right };
    }));
    assert(bounds.every((r) => r.left >= 0 && r.right <= width), JSON.stringify(bounds));
    if (width === 320) {
      assert(await page.getByRole("button", { name: "Move left" }).isVisible());
      assert(await page.getByRole("button", { name: "Move right" }).isVisible());
      assert(await page.locator("#shoot").isVisible());
      await page.screenshot({ path: "qa/audio-mobile.png" });
    }
    // Exercise the real visibility handler without claiming physical-device coverage.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => audioQA.music[0].paused && audioQA.contexts[0].state === "suspended");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => !audioQA.music[0].paused && audioQA.contexts[0].state === "running");
    if (width === 1280 && !process.env.QA_URL) {
      await page.locator("#shoot").click();
      await page.waitForFunction(() => audioQA.voices.length >= 2, { timeout: 25000 });
      const burst = await page.evaluate(() => audioQA.voices.length);
      assert(burst === 2 || burst === 4);
      await page.waitForFunction(() => document.querySelector("#phase-label").textContent !== "THE REVEAL");
      assert.equal(await page.evaluate(() => audioQA.voices.length), burst);
      proof.liveReveal = { oscillatorVoices: burst, repeatsInResults: false };
    }
    await page.getByRole("button", { name: "Mute all audio" }).click();
    assert.equal(await page.evaluate(() => audioQA.gains[0].gain.value), 0);
    await page.reload();
    await page.getByRole("button", { name: "Enable all audio" }).waitFor();
    assert.equal(await page.evaluate(() => audioQA.contexts.length), 0);
    await page.getByLabel("Adjust volume").click();
    assert.equal(await page.getByRole("slider", { name: "Master volume" }).inputValue(), "30");
    await page.getByRole("button", { name: "Enable all audio" }).click();
    await page.waitForFunction(() => Math.abs(audioQA.gains[0]?.gain.value - 0.3) < 0.001);
    assert.deepEqual(errors, []);
    proof.checks.push({ width, music, bounds, autoplay: "gesture only", mute: "persists", volume: "master gain 0/30%, persists across reload and mute", visibility: "pauses/resumes" });
    await context.close();
  }
  if (!process.env.QA_URL) {
    const page = await browser.newPage();
    await page.goto(base);
    const effects = await page.evaluate(async () => {
      const { GameAudio } = await import("/src/audio.js");
      const context = new OfflineAudioContext(1, 44100, 44100);
      const audio = new GameAudio();
      audio.context = context;
      audio.master = context.createGain(); audio.master.gain.value = 0.75; audio.master.connect(context.destination);
      audio.tone("triangle", 880, 110, 0, 0.16, 0.22);
      audio.tone("sine", 170, 65, 0, 0.11, 0.15);
      audio.tone("sine", 520, 130, 0.12, 0.42, 0.18);
      audio.tone("triangle", 260, 65, 0.18, 0.40, 0.08);
      const data = (await context.startRendering()).getChannelData(0);
      let peak = 0, energy = 0, tail = 0;
      for (let i = 0; i < data.length; i++) { peak = Math.max(peak, Math.abs(data[i])); energy += data[i] ** 2; if (i > 30000) tail += data[i] ** 2; }
      return { peak, rms: Math.sqrt(energy / data.length), tail, remainingVoices: audio.voices.size };
    });
    assert(effects.peak > 0.02 && effects.peak < 0.5);
    assert(effects.rms > 0.005);
    assert.equal(effects.tail, 0);
    assert.equal(effects.remainingVoices, 0);
    proof.effects = effects;
  }
  await writeFile("qa/audio-results.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally { await browser.close(); }
