#!/usr/bin/env node
// Bonus #4 (audit handoff) — print closure rate per category for the
// TECH_DEBT_AUDIT.md findings table. Uses `git log --grep="<TICKET-ID>"`
// to detect closure (each closing commit references the ticket in its
// subject or body). Pin this in package.json so "how much debt is left"
// is one command away.
//
// Run via `npm run audit:status`. Reads TECH_DEBT_AUDIT.md from repo root.

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AUDIT_PATH = resolve(ROOT, "TECH_DEBT_AUDIT.md");

const CATEGORIES = ["XS", "WK", "APP", "LIB", "UI", "SCR"];
const TICKET_RE = /\*\*([A-Z]+)-(\d+)\*\*/g;

async function loadFindings() {
  const md = await readFile(AUDIT_PATH, "utf8");
  const seen = new Set();
  const findings = [];
  for (const m of md.matchAll(TICKET_RE)) {
    const id = `${m[1]}-${m[2]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!CATEGORIES.includes(m[1])) continue;
    findings.push({ id, category: m[1] });
  }
  return findings;
}

function isClosedByCommit(ticketId) {
  // Match ticket id in commit subject or body. `--grep` is regex; escape
  // the dash defensively though it's literal in regex, but the parens
  // matter. Use --extended-regexp not strictly necessary here.
  try {
    const out = execFileSync(
      "git",
      ["log", "--all", "--grep", `\\b${ticketId}\\b`, "--format=%H"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function pct(n, d) {
  if (d === 0) return "0.0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function main() {
  const findings = await loadFindings();
  const byCategory = new Map();
  for (const c of CATEGORIES) byCategory.set(c, { total: 0, closed: 0 });

  for (const f of findings) {
    const bucket = byCategory.get(f.category);
    bucket.total += 1;
    const commits = isClosedByCommit(f.id);
    if (commits.length > 0) bucket.closed += 1;
  }

  // Header
  const grandTotal = findings.length;
  const grandClosed = Array.from(byCategory.values()).reduce(
    (s, b) => s + b.closed,
    0,
  );

  console.log("");
  console.log("===============================================");
  console.log(" STARSCREENER tech-debt audit — closure status");
  console.log("===============================================");
  console.log(
    `  Total: ${grandClosed}/${grandTotal} closed (${pct(grandClosed, grandTotal)})`,
  );
  console.log("");
  console.log("  Category | Closed/Total | Rate");
  console.log("  ---------+--------------+--------");
  for (const c of CATEGORIES) {
    const b = byCategory.get(c);
    const closedFrag = `${b.closed}/${b.total}`.padEnd(12);
    console.log(`  ${c.padEnd(8)} | ${closedFrag} | ${pct(b.closed, b.total)}`);
  }
  console.log("");

  // Open list — the actual to-do for the next session.
  const open = findings.filter(
    (f) => isClosedByCommit(f.id).length === 0,
  );
  if (open.length > 0) {
    console.log(`  Open findings (${open.length}):`);
    const byCat = new Map();
    for (const f of open) {
      if (!byCat.has(f.category)) byCat.set(f.category, []);
      byCat.get(f.category).push(f.id);
    }
    for (const c of CATEGORIES) {
      const ids = byCat.get(c);
      if (!ids || ids.length === 0) continue;
      console.log(`    ${c}: ${ids.sort().join(", ")}`);
    }
    console.log("");
  } else {
    console.log("  ALL FINDINGS CLOSED. Run /tech-debt-audit to refresh.");
    console.log("");
  }

  // Counter-signals to the operator. Closure detection is git-grep based
  // and undercounts when the operator's auto-commit absorbs work under
  // an unrelated commit message — verify against docs/AUDIT_HANDOFF.md
  // for the authoritative count.
  console.log(
    "  Note: closure detected by 'git log --grep <TICKET-ID>'. The auto-commit",
  );
  console.log(
    "  pattern can land work under unrelated messages → real closure may be higher.",
  );
  console.log("");
}

main().catch((err) => {
  console.error("[audit-status] failed:", err.message ?? err);
  process.exit(1);
});
