#!/usr/bin/env node
// TrendingRepo — X engagement autopilot runner (TOOLBOX host).
//
// Triggers one engagement pass on the app: search fresh candidate posts from
// curated AI/dev accounts + topic queries, compose an on-brand reply, and (in
// LIVE mode) post it as a reply via the app's outbound adapter. Unlike the
// broadcast autopilot this needs NO host `twitter` CLI — the app adapter does
// the posting server-side — so this runner is a thin, auth-guarded HTTP driver.
//
// Self-contained: Node built-ins + global fetch only, no app imports.
//
// Flow: read gate -> POST /api/cron/x-engagement { dryRun } -> log the result.
// The app enforces the real gate (TWITTER_ENGAGEMENT_MODE), the daily cap, the
// 72h/author cooldown, and per-post dedupe, so a double fire is a safe no-op.
//
// Args: --dry-run   force a dry pass (compose drafts, post nothing)
//       --once      run a single pass and exit (default behaviour)
//       --slot X    advisory slot label, forwarded for parity with autopilot
//
// Env: CRON_SECRET (required), TRENDINGREPO_URL (default http://localhost:3023),
//      TWITTER_ENGAGEMENT_MODE (off|dry|live — dormant-skip when off unless --dry-run).

const APP = (process.env.TRENDINGREPO_URL || "http://localhost:3023").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET;
const MODE = (process.env.TWITTER_ENGAGEMENT_MODE || "").trim().toLowerCase();
const DRY = process.argv.includes("--dry-run");

const log = (...a) => console.log(new Date().toISOString(), ...a);

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  const pref = process.argv.find((a) => a.startsWith(`${flag}=`));
  return pref ? pref.slice(flag.length + 1) : undefined;
}

const SLOT_RAW = (argValue("--slot") || "").toUpperCase();
const SLOT = /^[A-Z]$/.test(SLOT_RAW) ? SLOT_RAW : undefined;

async function main() {
  if (!SECRET) {
    log("CRON_SECRET unset — abort");
    process.exit(1);
  }

  // Courtesy dormant-skip so we never make a pointless call. The app is the
  // source of truth — it re-reads TWITTER_ENGAGEMENT_MODE and can still no-op.
  if (!DRY && MODE !== "dry" && MODE !== "live") {
    log(`mode=${MODE || "unset"} != live/dry — dormant skip`);
    process.exit(0);
  }

  const body = { ...(DRY ? { dryRun: true } : {}), ...(SLOT ? { slot: SLOT } : {}) };
  let res;
  try {
    res = await fetch(`${APP}/api/cron/x-engagement`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    log("request failed:", e.message);
    process.exit(1);
  }

  if (!res.ok) {
    log("HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200));
    process.exit(1);
  }

  const result = await res.json().catch(() => null);
  if (!result || result.ok !== true) {
    log("unexpected response:", JSON.stringify(result).slice(0, 200));
    process.exit(1);
  }

  log(
    `mode=${result.mode}${result.reason ? ` reason=${result.reason}` : ""}`,
    `scanned=${result.scanned} eligible=${result.eligible}`,
    `drafted=${result.drafted} posted=${result.posted} skipped=${result.skipped}`,
    `budgetLeft=${result.dailyBudgetRemaining}`,
  );
  for (const r of result.records || []) {
    const reply = (r.replyText || "").replace(/\s+/g, " ").slice(0, 120);
    log(`  [${r.status}] @${r.authorHandle} ${r.postUrl}${reply ? ` :: ${reply}` : ""}`);
  }
}

main().catch((e) => {
  log("runner error:", e.message);
  process.exit(1);
});
