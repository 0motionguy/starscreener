/**
 * agent-qa-guard.mjs — prod-bundle guard for the agent-qa bridge.
 *
 * The bridge must be compile-time gated behind
 * NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED: a production build made WITHOUT
 * the flag must contain zero bridge footprint.
 * Run after `next build`:  npm run qa:agent:guard
 *
 * Exit 1 if any marker string appears in .next/static JS output. Markers:
 * vendor provenance, vendored module name, the runtime window global, and
 * this repo's flag name (which must be inlined away, never read dynamically).
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");
const MARKERS = [
  "@0motionguy/agent-bridge",
  "agent-qa-bridge",
  "__AISO_AGENT__",
  "NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED",
];

if (!existsSync(STATIC_DIR)) {
  console.error("agent-qa-guard: .next/static not found — run the production build first.");
  process.exit(1);
}

// Stale-build refusal (AQ-P1-07): a guard that scans last week's .next
// proves nothing about today's code.
const BUILD_ID = path.join(process.cwd(), ".next", "BUILD_ID");
if (!existsSync(BUILD_ID)) {
  console.error("agent-qa-guard: .next/BUILD_ID not found — incomplete build; re-run next build.");
  process.exit(1);
}
const allowStale = process.argv.includes("--allow-stale");
const maxAgeMin = Number(process.env.AGENT_QA_GUARD_MAX_AGE_MIN ?? 60);
const ageMin = (Date.now() - statSync(BUILD_ID).mtimeMs) / 60_000;
if (!allowStale && ageMin > maxAgeMin) {
  console.error(
    `agent-qa-guard: STALE — .next build is ${ageMin.toFixed(1)} min old (max ${maxAgeMin}). ` +
      "Re-run `next build` first, or pass --allow-stale.",
  );
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|mjs)$/.test(name)) yield p;
  }
}

const hits = [];
for (const file of walk(STATIC_DIR)) {
  const text = readFileSync(file, "utf8");
  for (const marker of MARKERS) {
    if (text.includes(marker)) hits.push({ file: path.relative(process.cwd(), file), marker });
  }
}

if (hits.length > 0) {
  console.error("agent-qa-guard: FAIL — bridge markers found in prod bundle:");
  for (const h of hits) console.error(`  ${h.marker}  ←  ${h.file}`);
  console.error("Was NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED set during this build?");
  process.exit(1);
}
console.log("agent-qa-guard: PASS — no agent-bridge footprint in .next/static.");
