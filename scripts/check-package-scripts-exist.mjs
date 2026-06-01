#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const scriptPathPattern =
  /(?<path>\.?\/?scripts\/[^\s"';&|)]+?\.(?:cjs|mjs|js|ts|mts))/g;

const missing = [];

for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
  for (const match of command.matchAll(scriptPathPattern)) {
    const rawPath = match.groups?.path;
    if (!rawPath || /[*?[\]]/.test(rawPath)) {
      continue;
    }

    const normalizedPath = rawPath.replace(/^\.\//, "");
    const absolutePath = path.resolve(repoRoot, normalizedPath);
    if (!existsSync(absolutePath)) {
      missing.push({ scriptName, rawPath: normalizedPath });
    }
  }
}

if (missing.length > 0) {
  console.error("[check-package-scripts-exist] Missing local script targets:");
  for (const entry of missing) {
    console.error(`- ${entry.scriptName}: ${entry.rawPath}`);
  }
  process.exit(1);
}

console.log(
  `[check-package-scripts-exist] OK - ${Object.keys(packageJson.scripts ?? {}).length} package script(s) checked.`,
);
