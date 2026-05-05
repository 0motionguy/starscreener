#!/usr/bin/env node
// scripts/check-cron-overlap.mjs
// Cron-schedule overlap detector. Reads docs/_generated/engine.json,
// expands each cron to minute-of-week slots (0..10079), reports
// collisions to docs/_generated/cron-overlap.md. Exit 0 always.

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_JSON = resolve(ROOT, "docs/_generated/engine.json");
const DERIVE_SCRIPT = resolve(ROOT, "scripts/derive-engine-inventory.mjs");
const OUT_MD = resolve(ROOT, "docs/_generated/cron-overlap.md");
const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ensureEngineJson() {
  const stale =
    !existsSync(ENGINE_JSON) ||
    Date.now() - statSync(ENGINE_JSON).mtimeMs > 24 * 60 * 60 * 1000;
  if (stale && existsSync(DERIVE_SCRIPT)) {
    try { execFileSync(process.execPath, [DERIVE_SCRIPT], { stdio: "inherit" }); }
    catch (e) { console.warn("WARN: derive-engine-inventory.mjs failed:", e.message); }
  }
}

// Parse one cron field. Returns sorted unique array of integers in [min..max],
// or null if the field is too complex / invalid for this minimal parser.
function parseField(field, min, max) {
  const out = new Set();
  const parts = field.split(",");
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) return null;
    let stepStr = null;
    let body = part;
    const slashIdx = part.indexOf("/");
    if (slashIdx >= 0) {
      body = part.slice(0, slashIdx);
      stepStr = part.slice(slashIdx + 1);
    }
    const step = stepStr === null ? 1 : Number(stepStr);
    if (!Number.isInteger(step) || step <= 0) return null;
    let lo, hi;
    if (body === "*" || body === "") {
      lo = min;
      hi = max;
    } else if (body.includes("-")) {
      const [a, b] = body.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(body);
      hi = lo;
      if (stepStr !== null) hi = max; // "5/10" -> 5,15,25... up to max
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

// Return array of minute-of-week slots, or null if cron is too complex.
// Standard 5-field: m h dom mon dow. We expand only when dom and mon are
// unrestricted (* / */1) so the schedule maps cleanly onto a weekly cycle.
function expandCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [mF, hF, domF, monF, dowF] = fields;
  const minutes = parseField(mF, 0, 59);
  const hours = parseField(hF, 0, 23);
  if (!minutes || !hours) return null;
  const domAll = domF === "*" || domF === "*/1";
  const monAll = monF === "*" || monF === "*/1";
  // dow is 0-6 (Sun=0). 7 also Sun in some dialects; we don't accept 7.
  const dows = parseField(dowF, 0, 6);
  if (!dows) return null;
  if (!domAll || !monAll) {
    // dom/mon constraints don't fit a weekly slot model cleanly.
    return null;
  }
  const slots = [];
  for (const d of dows) {
    for (const h of hours) {
      for (const m of minutes) {
        slots.push(d * 1440 + h * 60 + m);
      }
    }
  }
  return slots;
}

function slotLabel(slot) {
  const dow = Math.floor(slot / 1440);
  const rem = slot % 1440;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  return `${DOW_LABEL[dow]} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function main() {
  ensureEngineJson();
  if (!existsSync(ENGINE_JSON)) {
    console.error("ERROR: engine.json not found at", ENGINE_JSON);
    process.exit(0);
  }
  const engine = JSON.parse(readFileSync(ENGINE_JSON, "utf8"));
  const workflows = Array.isArray(engine.workflows) ? engine.workflows : [];

  const slotMap = new Map(); // slot -> Set<workflowName>
  let totalExprs = 0;
  let skipped = 0;

  for (const wf of workflows) {
    const name = wf.name || wf.file || "(unnamed)";
    const crons = Array.isArray(wf.crons) ? wf.crons : [];
    for (const cron of crons) {
      totalExprs++;
      const slots = expandCron(cron);
      if (!slots) {
        skipped++;
        console.warn(`WARN: skipping complex cron "${cron}" in ${name}`);
        continue;
      }
      for (const s of slots) {
        if (!slotMap.has(s)) slotMap.set(s, new Set());
        slotMap.get(s).add(name);
      }
    }
  }

  const overlaps = [];
  for (const [slot, names] of slotMap.entries()) {
    if (names.size > 1) overlaps.push({ slot, names: [...names].sort() });
  }
  overlaps.sort((a, b) => b.names.length - a.names.length || a.slot - b.slot);

  const high = overlaps.filter((o) => o.names.length >= 3);
  const pair = overlaps.filter((o) => o.names.length === 2);

  const section = (title, rows) => {
    const out = [`## ${title}`, ""];
    if (rows.length === 0) { out.push("_None._", ""); return out; }
    out.push("| Slot (UTC dow HH:MM) | Workflows |", "| --- | --- |");
    for (const o of rows) out.push(`| ${slotLabel(o.slot)} | ${o.names.join(", ")} |`);
    out.push("");
    return out;
  };

  const auditDate = new Date().toISOString().slice(0, 10);
  const lines = [
    "---",
    "status: snapshot",
    `audit-date: ${auditDate}`,
    "verified-by: scripts/check-cron-overlap.mjs",
    "reason: auto-generated cron-collision report (gitignored per ADR 0005)",
    "---",
    "",
    "# Cron schedule overlap report -- auto-generated",
    "",
    "Generated by `scripts/check-cron-overlap.mjs`. Lists minutes-of-the-week",
    "where 2+ workflows fire simultaneously.",
    "",
    ...section("High overlap (3+ workflows on same minute)", high),
    ...section("Pair overlap (2 workflows on same minute)", pair),
    "## Stats",
    `- Total cron expressions: ${totalExprs}`,
    `- Cron expressions skipped (too complex): ${skipped}`,
    `- Total slots used: ${slotMap.size}`,
    `- Slots with overlap: ${overlaps.length}`,
    "",
  ];

  writeFileSync(OUT_MD, lines.join("\n"), "utf8");
  console.log(
    `CRON-OVERLAP: workflows=${workflows.length} slots-used=${slotMap.size} overlaps=${overlaps.length}`
  );
  process.exit(0);
}

main();
