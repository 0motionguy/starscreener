#!/usr/bin/env node
// Clerk configuration verification gate.
//
// History (2026-05-31): the auth-modal-broken regression took ~2h to
// diagnose because three independent things had to be right at once:
//   1. `pk_live_*` in .env.local matches the publishable key on prod
//   2. `allowed_origins` on the Clerk instance contains prod hosts
//   3. The satellite domain (clerk.trendingrepo.com) is verified +
//      reachable + returns the right CORS header
// Each silently fails until a user clicks "Sign up" and nothing
// happens. This gate fails fast on session start / pre-deploy.
//
// Usage:
//   CLERK_SECRET_KEY=sk_live_* \
//     node scripts/verify-clerk-config.mjs
//
// Without CLERK_SECRET_KEY, runs the public probes only (still useful
// at session start to confirm the satellite is up).

import fs from "node:fs";
import path from "node:path";

const PROD_HOSTS = (process.env.CLERK_PROD_HOSTS ||
  "https://trendingrepo.com,https://www.trendingrepo.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SATELLITE = process.env.CLERK_SATELLITE || "https://clerk.trendingrepo.com";
const PRIMARY_ORIGIN = PROD_HOSTS[0];

const SK = process.env.CLERK_SECRET_KEY || null;
const ENV_FILES = [".env.local", ".env.production"].map((p) =>
  path.resolve(process.cwd(), p),
);

function readEnvFile(p) {
  if (!fs.existsSync(p)) return null;
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function mask(t) {
  if (!t) return "(unset)";
  if (t.length <= 8) return `${t.slice(0, 4)}***`;
  return `${t.slice(0, 8)}***${t.slice(-4)}`;
}

const results = [];
const fail = (label, msg) => results.push({ label, ok: false, msg });
const ok = (label, msg) => results.push({ label, ok: true, msg });

// --- check 1: env-file pk_live_* consistency ---
{
  const envs = ENV_FILES.map((p) => ({ p, env: readEnvFile(p) })).filter((e) => e.env);
  const pks = envs.map((e) => ({
    p: path.basename(e.p),
    pk: e.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || null,
  }));
  if (pks.length === 0) {
    ok("env-files", "no .env.local / .env.production present locally (skip)");
  } else {
    const distinct = new Set(pks.map((x) => x.pk));
    if (distinct.size > 1) {
      fail(
        "env-files",
        `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY differs across env files: ${pks
          .map((x) => `${x.p}=${mask(x.pk)}`)
          .join(", ")}`,
      );
    } else if (![...distinct][0]?.startsWith("pk_live_") && ![...distinct][0]?.startsWith("pk_test_")) {
      fail("env-files", `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing or malformed`);
    } else {
      ok("env-files", `consistent across ${pks.length} file(s): ${mask([...distinct][0])}`);
    }
  }
}

// --- check 2: allowed_origins on the Clerk instance (needs sk) ---
if (SK) {
  try {
    const res = await fetch("https://api.clerk.com/v1/instance", {
      headers: { Authorization: `Bearer ${SK}` },
    });
    if (!res.ok) {
      fail("allowed_origins", `api.clerk.com/v1/instance returned ${res.status}`);
    } else {
      const body = await res.json();
      const allowed = Array.isArray(body.allowed_origins) ? body.allowed_origins : [];
      const missing = PROD_HOSTS.filter((h) => !allowed.includes(h));
      if (missing.length) {
        fail(
          "allowed_origins",
          `Clerk instance.allowed_origins missing: ${missing.join(", ")} (have: ${allowed.join(", ") || "(empty)"})`,
        );
      } else {
        ok("allowed_origins", `Clerk instance lists all ${PROD_HOSTS.length} prod host(s)`);
      }
    }
  } catch (err) {
    fail("allowed_origins", `Clerk API call failed: ${err.message}`);
  }
} else {
  ok("allowed_origins", "skipped — set CLERK_SECRET_KEY to enable");
}

// --- check 3: satellite reachability + CORS header ---
{
  try {
    const res = await fetch(`${SATELLITE}/v1/environment`, {
      headers: { Origin: PRIMARY_ORIGIN },
    });
    const acao = res.headers.get("access-control-allow-origin");
    if (res.status !== 200) {
      fail("satellite", `${SATELLITE}/v1/environment returned ${res.status}`);
    } else if (!acao || (acao !== PRIMARY_ORIGIN && acao !== "*")) {
      fail("satellite", `ACAO mismatch — expected ${PRIMARY_ORIGIN}, got ${acao ?? "(missing)"}`);
    } else {
      ok("satellite", `${SATELLITE} 200 + ACAO=${acao}`);
    }
  } catch (err) {
    fail("satellite", `fetch failed: ${err.message}`);
  }
}

// --- report ---
let failures = 0;
console.log(`[verify-clerk-config] ${results.length} check(s):`);
for (const r of results) {
  if (r.ok) console.log(`  OK   ${r.label.padEnd(20)} ${r.msg}`);
  else {
    console.error(`  FAIL ${r.label.padEnd(20)} ${r.msg}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(``);
  console.error(`[verify-clerk-config] ${failures} check(s) failed — Clerk config drift.`);
  console.error(``);
  console.error(`Recovery checklist:`);
  console.error(`  - Confirm pk_live_* / sk_live_* in Clerk Dashboard match local .env`);
  console.error(`  - Add prod origins to allowed_origins in Clerk Dashboard → Instance`);
  console.error(`  - Verify satellite CNAMEs in Cloudflare DNS (clerk.* all gray-cloud)`);
  console.error(`  - Restart prod app after rotating secrets`);
  process.exit(1);
}

console.log(`[verify-clerk-config] OK — all checks passed.`);
