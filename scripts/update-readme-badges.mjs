#!/usr/bin/env node
// Bonus tooling — regenerate the three audit badges in README.md from
// ground-truth sources. Idempotent: re-running with no source changes is
// a no-op. Exits 0 when the file is already up-to-date OR was updated.
//
// Sources of truth:
//   1. Audit closure       → BADGE_DATA line in docs/AUDIT_COMPLETE.md
//                             (manual edit when audit is re-run)
//   2. V2 conformance      → exit code of `node scripts/check-no-legacy-tokens.mjs`
//                             (0 → "100%", non-zero → "regressing")
//   3. Critical findings   → critical_open field in the BADGE_DATA line
//
// Why parse from a metadata line rather than `npm run audit:status`?
// audit-status.mjs detects closure via `git log --grep <TICKET-ID>` which
// undercounts when the operator's auto-commit absorbs work under unrelated
// messages. The AUDIT_COMPLETE.md headline is the manual ground truth.
//
// Run via `npm run update:badges`. Pin in CI later if you want PRs to
// auto-bump the badges when the audit doc changes.

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const README_PATH = resolve(ROOT, "README.md");
const AUDIT_COMPLETE_PATH = resolve(ROOT, "docs/AUDIT_COMPLETE.md");
const TOKENS_GUARD_PATH = resolve(ROOT, "scripts/check-no-legacy-tokens.mjs");

const COLOR_GREEN = "22c55e";
const COLOR_RED = "dc2626";

const BADGE_DATA_RE =
  /<!--\s*BADGE_DATA:\s*closed=(\d+)\s+total=(\d+)\s+critical_open=(\d+)\s*-->/;

async function loadAuditCounts() {
  const md = await readFile(AUDIT_COMPLETE_PATH, "utf8");
  const match = md.match(BADGE_DATA_RE);
  if (!match) {
    throw new Error(
      `BADGE_DATA marker not found in ${AUDIT_COMPLETE_PATH}. Expected:\n` +
        `  <!-- BADGE_DATA: closed=N total=M critical_open=K -->`,
    );
  }
  return {
    closed: Number(match[1]),
    total: Number(match[2]),
    criticalOpen: Number(match[3]),
  };
}

function runV2Guard() {
  const result = spawnSync(process.execPath, [TOKENS_GUARD_PATH], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

// shields.io URL shape: /badge/<label>-<message>-<color>.svg?style=for-the-badge[&logo=...]
// shields.io quirks: literal hyphens must be doubled (`--`); literal
// underscores doubled (`__`). Everything else goes through standard
// URL-encoding so `%` → `%25`, ` ` → `%20`, `/` → `%2F`.
function encodeBadge(text) {
  return encodeURIComponent(
    text.replaceAll("-", "--").replaceAll("_", "__"),
  );
}

function buildBadgeUrl(label, message, color) {
  const l = encodeBadge(label);
  const m = encodeBadge(message);
  return `https://img.shields.io/badge/${l}-${m}-${color}.svg?style=for-the-badge`;
}

function buildAuditBadge({ closed, total }) {
  const url = buildBadgeUrl("audit", `${closed}/${total} closed`, COLOR_GREEN);
  return `[![Tech-debt audit](${url})](./docs/AUDIT_COMPLETE.md)`;
}

function buildV2Badge(passing) {
  const message = passing ? "100%" : "regressing";
  const color = passing ? COLOR_GREEN : COLOR_RED;
  const url = buildBadgeUrl("V2 conformance", message, color);
  return `[![V2 conformance](${url})](./scripts/check-no-legacy-tokens.mjs)`;
}

function buildCriticalBadge({ criticalOpen }) {
  const color = criticalOpen === 0 ? COLOR_GREEN : COLOR_RED;
  const url = buildBadgeUrl("critical open", String(criticalOpen), color);
  return `[![Critical findings](${url})](./docs/AUDIT_COMPLETE.md)`;
}

async function main() {
  const counts = await loadAuditCounts();
  const v2Passing = runV2Guard();

  const auditLine = buildAuditBadge(counts);
  const v2Line = buildV2Badge(v2Passing);
  const criticalLine = buildCriticalBadge(counts);

  const readme = await readFile(README_PATH, "utf8");

  // Replace each badge by alt-text. Each badge sits on its own line in the
  // README. Anchor on the leading `[![<alt>](` and trailing `)`.
  const next = readme
    .replace(/\[!\[Tech-debt audit\]\([^)]+\)\][^\n]*/u, auditLine)
    .replace(/\[!\[V2 conformance\]\([^)]+\)\][^\n]*/u, v2Line)
    .replace(/\[!\[Critical findings\]\([^)]+\)\][^\n]*/u, criticalLine);

  if (next === readme) {
    console.log(
      `[update-readme-badges] OK — already up-to-date (audit ${counts.closed}/${counts.total}, V2 ${v2Passing ? "100%" : "regressing"}, critical=${counts.criticalOpen}).`,
    );
    return;
  }

  await writeFile(README_PATH, next, "utf8");
  console.log(
    `[update-readme-badges] updated — audit ${counts.closed}/${counts.total}, V2 ${v2Passing ? "100%" : "regressing"}, critical=${counts.criticalOpen}.`,
  );
}

main().catch((err) => {
  console.error("[update-readme-badges] failed:", err.message ?? err);
  process.exit(1);
});
