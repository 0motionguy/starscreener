#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

async function loadChromium() {
  try {
    const mod = await import("playwright");
    return mod.chromium;
  } catch {
    const mod = await import("@playwright/test");
    return mod.chromium;
  }
}

const baseUrl = process.env.STARSCREENER_BASE_URL ?? "https://trendingrepo.com";
const loops = Number.parseInt(process.env.HEAP_DRILL_LOOPS ?? "20", 10);
const pathA = process.env.HEAP_DRILL_PATH_A ?? "/";
const pathB = process.env.HEAP_DRILL_PATH_B ?? "/search?q=react";
const scenario = process.env.HEAP_DRILL_SCENARIO ?? `${pathA} <-> ${pathB}`;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(process.cwd(), "qa-artifacts", "agn-852", stamp);

async function captureSnapshot(cdp, filePath) {
  const chunks = [];
  const onChunk = ({ chunk }) => chunks.push(chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  await fs.writeFile(filePath, chunks.join(""), "utf8");
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
}

async function readHeapUsage(cdp) {
  const usage = await cdp.send("Runtime.getHeapUsage");
  return {
    usedSize: usage.usedSize,
    totalSize: usage.totalSize,
    usedMb: Number((usage.usedSize / 1024 / 1024).toFixed(2)),
    totalMb: Number((usage.totalSize / 1024 / 1024).toFixed(2)),
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("HeapProfiler.enable");
  await cdp.send("Runtime.enable");

  const firstUrl = new URL(pathA, baseUrl).toString();
  const secondUrl = new URL(pathB, baseUrl).toString();

  await page.goto(firstUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_000);
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await readHeapUsage(cdp);
  await captureSnapshot(cdp, path.join(outDir, "before.heapsnapshot"));

  for (let i = 0; i < loops; i += 1) {
    await page.goto(secondUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(150);
    await page.goto(firstUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(150);
  }

  await cdp.send("HeapProfiler.collectGarbage");
  await page.waitForTimeout(500);
  const after = await readHeapUsage(cdp);
  await captureSnapshot(cdp, path.join(outDir, "after.heapsnapshot"));

  const summary = {
    issue: "AGN-852",
    scenario,
    baseUrl,
    pathA,
    pathB,
    loops,
    capturedAt: new Date().toISOString(),
    before,
    after,
    deltaMb: Number((after.usedMb - before.usedMb).toFixed(2)),
    leakSuspected: after.usedMb - before.usedMb > 15,
  };

  await fs.writeFile(
    path.join(outDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  await browser.close();
  console.log(`AGN-852 heap drill complete: ${outDir}`);
  console.log(JSON.stringify(summary));
}

main().catch((err) => {
  console.error("AGN-852 heap drill failed");
  console.error(err);
  process.exitCode = 1;
});
