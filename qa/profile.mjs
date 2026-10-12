import { chromium } from "@playwright/test";
import { writeFile, readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const label = process.argv[2] || "after";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const samples = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext(
      mobile
        ? {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 3,
          }
        : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
    );
    const page = await context.newPage();
    await page.goto("http://localhost:5173/qa/render.html");
    await page.waitForFunction(() => !!window.qaScene);
    for (const phase of ["position", "reveal"]) {
      const result = await page.evaluate(async (phase) => {
        qaView.phase = phase;
        qaView.clock = 1;
        if (phase === "reveal")
          qaView.players = qaGame.players.map((p, i) => ({
            ...p,
            color: ["#ffab63", "#c5a4f5", "#64ccdc", "#b3dc77"][i % 4],
          }));
        const times = [];
        let last;
        for (let i = 0; i < 150; i++) {
          const now = await new Promise(requestAnimationFrame);
          if (i > 30) times.push(now - last);
          last = now;
          qaDraw(now / 1000);
        }
        const renderer = qaScene.renderer,
          gl = renderer.getContext();
        times.sort((a, b) => a - b);
        return {
          phase,
          frames: times.length,
          frameMedianMs: times[Math.floor(times.length * 0.5)],
          frameP95Ms: times[Math.floor(times.length * 0.95)],
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          renderWidth: renderer.domElement.width,
          renderHeight: renderer.domElement.height,
          pixelRatio: renderer.getPixelRatio(),
          shadowMap: renderer.shadowMap.enabled,
          renderer: gl.getParameter(gl.RENDERER),
        };
      }, phase);
      samples.push({
        profile: mobile ? "mobile-emulated-DPR3" : "desktop",
        ...result,
      });
    }
    await context.close();
  }
  const files = await readdir("dist/assets");
  const bundle = [];
  for (const name of files.filter((n) => /\.(js|css)$/.test(n))) {
    const data = await readFile("dist/assets/" + name);
    bundle.push({
      file: name,
      bytes: data.length,
      gzipBytes: gzipSync(data).length,
    });
  }
  const report = {
    label,
    environment:
      "Edge headless on Windows; touch/viewport/DPR emulation. Frame timings are host measurements, not phone GPU, battery or thermal evidence.",
    samples,
    bundle,
  };
  await writeFile(
    `qa/performance-${label}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
