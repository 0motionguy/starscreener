#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const chunksDir = resolve(root, ".next", "static", "chunks", "app");
const thresholdKb = Number(process.env.BUNDLE_SIZE_BUDGET_KB ?? "300");
const thresholdBytes = Math.floor(thresholdKb * 1024);

function walkJsFiles(dir, out) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
}

try {
  const files = [];
  walkJsFiles(chunksDir, files);

  if (files.length === 0) {
    console.error(
      `[bundle-budget] no app-route JS chunks found under ${chunksDir}`,
    );
    process.exit(1);
  }

  const oversized = [];
  for (const file of files) {
    const size = statSync(file).size;
    if (size > thresholdBytes) oversized.push({ file, size });
  }

  if (oversized.length === 0) {
    console.log(
      `[bundle-budget] OK ${files.length} chunk(s) checked, threshold=${thresholdKb}KB`,
    );
    process.exit(0);
  }

  console.error(
    `[bundle-budget] FAIL ${oversized.length} chunk(s) exceed ${thresholdKb}KB`,
  );
  for (const item of oversized) {
    const kb = Math.ceil(item.size / 1024);
    const rel = item.file.replace(`${root}\\`, "").replace(`${root}/`, "");
    console.error(` - ${rel}: ${kb}KB`);
  }
  process.exit(1);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[bundle-budget] ERROR ${message}`);
  process.exit(1);
}
