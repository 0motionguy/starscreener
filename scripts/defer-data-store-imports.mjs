#!/usr/bin/env node
// One-shot transform: convert `import { getDataStore } from "./data-store"`
// (static, top-of-file) into `const { getDataStore } = await import("./data-store")`
// inserted at the start of the function body that calls getDataStore().
//
// Why: a static `getDataStore` import pulls the entire ioredis dependency
// tree (and its `require("dns")` / `require("net")` calls) into the client
// bundle whenever a "use client" file transitively imports the lib module
// — and crashes turbopack with "Module not found: Can't resolve 'dns'".
// Deferring the import to the async refresh helper keeps the sync getters
// in these libs client-safe.
//
// Strategy
//   1. Remove the line matching /^import\s*\{\s*getDataStore\s*\}\s*from\s*["']\.\/data-store["'];?\s*$/m
//   2. For each call site `getDataStore()`, walk backwards to find the
//      enclosing function/closure body opening (the line with `=> {` or
//      `function ... {` or `async () => {`) and insert
//      `const { getDataStore } = await import("./data-store");` as the
//      first body line (matching indentation of the call site).
//   3. Skip files where the import is already dynamic.
//
// One-pass per file. Idempotent: running twice is a no-op because step (1)
// only matches the static form.

import { readFile, writeFile } from "node:fs/promises";

const TARGETS = [
  "src/lib/funding-news.ts",
  "src/lib/trending.ts",
  "src/lib/revenue-startups.ts",
  "src/lib/revenue-overlays.ts",
  "src/lib/revenue-benchmarks.ts",
  "src/lib/repo-profiles.ts",
  "src/lib/repo-metadata.ts",
  "src/lib/reddit-data.ts",
  "src/lib/reddit-baselines.ts",
  "src/lib/reddit-all-data.ts",
  "src/lib/recent-repos.ts",
  "src/lib/npm.ts",
  "src/lib/lobsters-trending.ts",
  "src/lib/hot-collections.ts",
  "src/lib/hackernews-trending.ts",
  "src/lib/devto-trending.ts",
  "src/lib/collection-rankings.ts",
  "src/lib/bluesky-trending.ts",
  "src/lib/aiso-persist.ts",
];

const STATIC_IMPORT_RE =
  /^import\s*\{\s*getDataStore\s*\}\s*from\s*["']\.\/data-store["'];?\s*$/m;

function leadingWhitespace(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : "";
}

function transformFile(src) {
  if (!STATIC_IMPORT_RE.test(src)) {
    return { changed: false, content: src, reason: "no static import" };
  }

  // Step 1: drop the static import line (and its trailing newline).
  let next = src.replace(/^import\s*\{\s*getDataStore\s*\}\s*from\s*["']\.\/data-store["'];?\s*\r?\n/m, "");

  // Step 2: insert dynamic import on the line before each getDataStore() call.
  // We work line-by-line so we can preserve indentation and avoid touching
  // call sites inside comments. To avoid duplicate inserts when the same
  // function has multiple calls, we track which line ranges already received
  // an insert and skip subsequent calls in the same enclosing scope.
  const lines = next.split(/\r?\n/);
  const insertions = []; // { atIndex, text }
  const processedScopeStarts = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("getDataStore(")) continue;
    // Skip lines inside a single-line comment.
    if (/^\s*\/\//.test(line)) continue;

    // Find enclosing scope start: walk backwards looking for a `{` at end of
    // an async-flagged line. If we hit a top-level statement (no leading
    // whitespace + `function`/`const`/`export`), use that line +1.
    let scopeStart = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      const l = lines[j];
      // Async arrow/function opening: `(async () => {`, `async function ... {`,
      // `() => {` inside a Promise chain, etc. Match a line ending with `{`
      // and containing `async` OR an arrow `=>`.
      if (/\{\s*$/.test(l) && (/\basync\b/.test(l) || /=>\s*\{?\s*$/.test(l) || /\bfunction\b/.test(l))) {
        scopeStart = j;
        break;
      }
    }

    if (scopeStart === -1) {
      // Fallback: insert just above the current line at the same indent.
      scopeStart = i - 1;
    }

    if (processedScopeStarts.has(scopeStart)) continue;
    processedScopeStarts.add(scopeStart);

    const indent = leadingWhitespace(line);
    insertions.push({
      atIndex: i,
      text: `${indent}const { getDataStore } = await import("./data-store");`,
    });
  }

  // Apply insertions from bottom to top so indices stay valid.
  insertions.sort((a, b) => b.atIndex - a.atIndex);
  for (const { atIndex, text } of insertions) {
    lines.splice(atIndex, 0, text);
  }

  return {
    changed: true,
    content: lines.join("\n"),
    reason: `${insertions.length} call site(s) deferred`,
  };
}

let totalChanged = 0;
for (const rel of TARGETS) {
  const src = await readFile(rel, "utf8");
  const result = transformFile(src);
  if (result.changed) {
    await writeFile(rel, result.content, "utf8");
    totalChanged += 1;
    console.log(`[defer] ${rel} — ${result.reason}`);
  } else {
    console.log(`[skip] ${rel} — ${result.reason}`);
  }
}
console.log(`\nDone. ${totalChanged}/${TARGETS.length} files transformed.`);
