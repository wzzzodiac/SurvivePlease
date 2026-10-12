import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error("Browser error:", e.message);
});
await page.goto("http://localhost:5173");
await page.waitForSelector("canvas");
await page.waitForTimeout(1000);
await page.screenshot({ path: "qa/desktop-menu.png" });
await page.locator("#player-name").fill("Cauce");
await page.getByRole("button", { name: "Play practice" }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "qa/desktop-hidden.png" });
await page.keyboard.down("d");
await page.waitForTimeout(900);
await page.keyboard.up("d");
await page.getByRole("button", { name: "LOCK SHOT" }).click();
await page.waitForFunction(
  () => document.querySelector("#phase-label")?.textContent === "THE REVEAL",
  {},
  { timeout: 12000 },
);
await page.waitForTimeout(750);
await page.screenshot({ path: "qa/desktop-reveal.png" });
const progress = setInterval(async () => {
  try {
    console.log(
      await page.evaluate(() => ({
        phase: document.querySelector("#phase-label")?.textContent,
        round: document.querySelector(".round strong")?.textContent,
        timer: document.querySelector("#timer")?.textContent,
        alive: document.querySelector("#alive")?.textContent,
        hidden: document.hidden,
      })),
    );
  } catch {}
}, 15000);
await page.waitForFunction(
  () => !!document.querySelector(".end-card"),
  {},
  { timeout: 160000 },
);
clearInterval(progress);
await page.screenshot({ path: "qa/desktop-results.png" });
const result = await page.locator(".end-card").innerText();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
});
const mp = await mobile.newPage();
mp.on("pageerror", (e) => errors.push(e.message));
await mp.goto("http://localhost:5173");
await mp.waitForTimeout(800);
await mp.screenshot({ path: "qa/mobile-menu.png" });
await mp.getByRole("button", { name: "Play practice" }).tap();
await mp.waitForTimeout(500);
await mp.screenshot({ path: "qa/mobile-hidden.png" });
const move = mp.getByRole("button", { name: "Move right" });
const box = await move.boundingBox();
await mp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await mp.mouse.down();
await mp.waitForTimeout(800);
await mp.mouse.up();
await mp.locator("canvas").tap({ position: { x: 100, y: 400 } });
await mp.getByRole("button", { name: "FIRE" }).tap();
await mp.waitForFunction(
  () => document.querySelector("#phase-label")?.textContent === "THE REVEAL",
  {},
  { timeout: 12000 },
);
await mp.waitForTimeout(750);
await mp.screenshot({ path: "qa/mobile-reveal.png" });
await writeFile(
  "qa/browser-results.json",
  JSON.stringify(
    {
      errors,
      result,
      mobileControls: !!box,
      desktop: { width: 1440, height: 1000 },
      mobile: { width: 390, height: 844 },
      note: "Edge headless; mobile viewport/touch emulation, not physical device.",
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Browser QA passed; complete bot match and desktop/mobile captures saved.",
);
