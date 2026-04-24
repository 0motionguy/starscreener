// Regression coverage test — guards the `.data/repos.jsonl` JSONL fallback
// path in getDerivedRepos(). Without that fallback, mature repos that have
// aged out of OSSInsights trending feeds (ollama, vercel/next.js, …) were
// silently dropped from the derived set, causing /repo/[owner]/[name] to
// 404 on cold Vercel Lambdas.
//
// Invariants asserted:
//   1. Every row in `.data/repos.jsonl` is reachable via getDerivedRepoByFullName.
//   2. A hand-picked list of well-known tracked repos is reachable.
//   3. getDerivedRepos().length is at least as large as the JSONL row count.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  __resetDerivedReposCache,
  getDerivedRepoByFullName,
  getDerivedRepos,
} from "../../derived-repos";
import { currentDataDir, FILES } from "../storage/file-persistence";

interface JsonlRepoLite {
  fullName?: unknown;
}

function readPipelineJsonlFullNames(): string[] {
  const path = join(currentDataDir(), FILES.repos);
  if (!existsSync(path)) return [];
  try {
    statSync(path);
  } catch {
    return [];
  }
  const raw = readFileSync(path, "utf8");
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as JsonlRepoLite;
      if (typeof rec.fullName === "string" && rec.fullName.includes("/")) {
        out.push(rec.fullName);
      }
    } catch {
      // skip corrupt lines — the runtime loader does the same.
    }
  }
  return out;
}

test("derived-repos coverage — ollama/ollama is reachable by fullName", () => {
  __resetDerivedReposCache();
  const repo = getDerivedRepoByFullName("ollama/ollama");
  assert.ok(
    repo !== null,
    "getDerivedRepoByFullName('ollama/ollama') must not return null — it is line 1 of .data/repos.jsonl",
  );
  assert.equal(repo!.fullName, "ollama/ollama");
});

test("derived-repos coverage — vercel/next.js is reachable by fullName", () => {
  __resetDerivedReposCache();
  const repo = getDerivedRepoByFullName("vercel/next.js");
  assert.ok(
    repo !== null,
    "getDerivedRepoByFullName('vercel/next.js') must not return null",
  );
  assert.equal(repo!.fullName, "vercel/next.js");
});

test("derived-repos coverage — five well-known repos from .data/repos.jsonl", () => {
  __resetDerivedReposCache();
  const jsonlNames = readPipelineJsonlFullNames();
  if (jsonlNames.length === 0) {
    // Without the persisted pipeline file there is nothing to test; the
    // smoke test already covers the trending-only path.
    return;
  }

  const candidates = [
    "ollama/ollama",
    "langchain-ai/langchain",
    "huggingface/transformers",
    "vercel/next.js",
    "openai/whisper",
  ];
  const present = candidates.filter((name) =>
    jsonlNames.some((n) => n.toLowerCase() === name.toLowerCase()),
  );
  assert.ok(
    present.length >= 5,
    `expected at least 5 of the well-known repos to live in .data/repos.jsonl; found ${present.length}`,
  );

  for (const name of present) {
    const hit = getDerivedRepoByFullName(name);
    assert.ok(hit !== null, `getDerivedRepoByFullName(${JSON.stringify(name)}) returned null`);
  }
});

test("derived-repos coverage — count >= .data/repos.jsonl row count", () => {
  __resetDerivedReposCache();
  const jsonlNames = readPipelineJsonlFullNames();
  const derived = getDerivedRepos();
  assert.ok(
    derived.length >= jsonlNames.length,
    `derived set (${derived.length}) must cover every .data/repos.jsonl row (${jsonlNames.length})`,
  );
});

test("derived-repos coverage — every .data/repos.jsonl fullName is byFullName-resolvable", () => {
  __resetDerivedReposCache();
  const jsonlNames = readPipelineJsonlFullNames();
  const missing: string[] = [];
  for (const name of jsonlNames) {
    if (getDerivedRepoByFullName(name) === null) {
      missing.push(name);
    }
  }
  assert.equal(
    missing.length,
    0,
    `the following ${missing.length} repos are in .data/repos.jsonl but not reachable via getDerivedRepoByFullName: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", …" : ""}`,
  );
});
