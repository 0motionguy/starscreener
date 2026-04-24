import { readFileSync } from "node:fs";
import { getDerivedRepos } from "../src/lib/derived-repos";

const derived = new Set(
  getDerivedRepos().map((r) => r.fullName.toLowerCase()),
);
const lines = readFileSync(".data/reasons.jsonl", "utf8").split(/\r?\n/);
const matches: string[] = [];
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const rec = JSON.parse(line) as {
      repoId?: string;
      details?: unknown[];
    };
    const fn = rec.repoId?.replace("--", "/");
    if (fn && derived.has(fn.toLowerCase()) && rec.details?.length) {
      matches.push(fn);
      if (matches.length >= 5) break;
    }
  } catch {
    /* skip */
  }
}
console.log("SMOKE_CANDIDATES:", matches.join(" "));
