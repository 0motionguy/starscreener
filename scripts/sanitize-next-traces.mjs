#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const serverDir = path.join(root, ".next", "server");

const blockedRoots = [
  path.join(root, ".claude"),
  path.join(root, ".vercel"),
  path.join(root, "awesome-codex-skills"),
  path.join(root, "docs", "review"),
];

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isBlocked(absPath) {
  if (blockedRoots.some((blocked) => isInside(absPath, blocked))) return true;

  const dataRel = path.relative(path.join(root, ".data"), absPath);
  return (
    dataRel !== "" &&
    !dataRel.startsWith("..") &&
    !path.isAbsolute(dataRel) &&
    dataRel.split(path.sep)[0]?.startsWith("backup")
  );
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") return;
    throw err;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".nft.json")) {
      yield fullPath;
    }
  }
}

let tracesChanged = 0;
let filesRemoved = 0;

for await (const tracePath of walk(serverDir)) {
  const raw = await readFile(tracePath, "utf8");
  const trace = JSON.parse(raw);
  if (!Array.isArray(trace.files)) continue;

  const traceDir = path.dirname(tracePath);
  const files = trace.files.filter((file) => {
    const absPath = path.resolve(traceDir, file);
    return !isBlocked(absPath);
  });

  if (files.length !== trace.files.length) {
    filesRemoved += trace.files.length - files.length;
    tracesChanged += 1;
    await writeFile(
      tracePath,
      JSON.stringify({ ...trace, files }, null, 0),
      "utf8",
    );
  }
}

console.log(
  `[sanitize-next-traces] updated ${tracesChanged} trace files; removed ${filesRemoved} local entries`,
);
