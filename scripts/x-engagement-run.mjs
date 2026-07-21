#!/usr/bin/env node
// TrendingRepo — X engagement autopilot runner (TOOLBOX host).
//
// The app can't post (its outbound adapter is a no-op without OAuth/reach), so
// this host runner posts replies via the host `twitter` CLI — the same cookie
// session (TWITTER_AUTH_TOKEN/CT0) the 7x/day broadcast uses. Flow:
//   1. auth guard: `twitter status` → must be @Trendingrepo, else refuse.
//   2. propose: POST /api/cron/x-engagement { dryRun:true } → the app composes,
//      grounds, classifies + freshness/ledger-filters and returns the eligible
//      drafts (postId + reply text). Consumes NO ledger.
//   3. per draft: `twitter reply <postId> <text> --json`.
//   4. confirm: POST { confirm:{...} } → the app commits the ledger + audit.
// A dry run (--dry-run, or mode=dry) does step 2 + logs the drafts, posts nothing.
//
// Self-contained: Node built-ins + global fetch + the host `twitter` CLI.
// Env: CRON_SECRET, TRENDINGREPO_URL (default localhost:3023),
//      TWITTER_ENGAGEMENT_MODE (off|dry|live), TWITTER_AUTH_TOKEN / TWITTER_CT0.

import { execFileSync } from "node:child_process";

const APP = (process.env.TRENDINGREPO_URL || "http://localhost:3023").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET;
const MODE = (process.env.TWITTER_ENGAGEMENT_MODE || "").trim().toLowerCase();
const DRY = process.argv.includes("--dry-run");
const POST_ACCOUNT = "trendingrepo"; // expected authed handle, lowercased

const log = (...a) => console.log(new Date().toISOString(), ...a);

function twitter(args) {
  return execFileSync("twitter", args, { encoding: "utf8", timeout: 60_000 });
}

async function callApp(body) {
  const res = await fetch(`${APP}/api/cron/x-engagement`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return res.json();
}

function parseTweetId(out) {
  try {
    const j = JSON.parse(out);
    const id = j?.data?.id || j?.id || j?.data?.tweetId;
    if (id) return String(id);
  } catch {
    /* CLI may emit YAML — loose-match below */
  }
  return (out.match(/\b(\d{15,20})\b/) || [])[1] || null;
}

async function propose() {
  const result = await callApp({ dryRun: true });
  const recs = Array.isArray(result?.records) ? result.records : [];
  log(
    `propose: scanned=${result.scanned} eligible=${result.eligible}`,
    `drafted=${result.drafted} budget=${result.dailyBudgetRemaining}`,
  );
  return recs.filter((r) => r.status === "drafted" && r.postId && r.replyText);
}

async function main() {
  if (!SECRET) {
    log("CRON_SECRET unset — abort");
    process.exit(1);
  }

  // Courtesy dormant-skip; the app re-checks the gate too.
  if (!DRY && MODE !== "dry" && MODE !== "live") {
    log(`mode=${MODE || "unset"} != live/dry — dormant skip`);
    process.exit(0);
  }

  // DRY (or mode=dry): propose + show drafts, post nothing.
  if (DRY || MODE === "dry") {
    const drafts = await propose();
    for (const d of drafts) {
      log(`  [draft] @${d.authorHandle} ${d.postUrl} :: ${(d.replyText || "").replace(/\s+/g, " ").slice(0, 160)}`);
    }
    log(`dry: ${drafts.length} draft(s), posted 0`);
    return;
  }

  // LIVE — auth guard, then propose → CLI reply → confirm.
  let status;
  try {
    status = twitter(["--compact", "status"]);
  } catch (e) {
    log("twitter status failed:", e.message, "— skip");
    process.exit(0);
  }
  if (!/^ok:\s*true/m.test(status)) {
    log("not authenticated — skip (set TWITTER_AUTH_TOKEN / TWITTER_CT0)");
    process.exit(0);
  }
  const user = (status.match(/username:\s*'?([A-Za-z0-9_]+)/) || [])[1] || "";
  if (user.toLowerCase() !== POST_ACCOUNT) {
    log(`session @${user || "?"}, expected @${POST_ACCOUNT} — REFUSING to post`);
    process.exit(1);
  }
  log("authed as @" + user);

  const drafts = await propose();
  let posted = 0;
  for (const d of drafts) {
    let out;
    try {
      out = twitter(["reply", String(d.postId), d.replyText, "--json"]);
    } catch (e) {
      log(`reply to ${d.postId} failed: ${e.message} — skip`);
      continue;
    }
    const replyTweetId = parseTweetId(out);
    try {
      await callApp({
        confirm: {
          postId: String(d.postId),
          authorId: d.authorId,
          authorHandle: d.authorHandle || "",
          postUrl: d.postUrl || "",
          replyText: d.replyText,
          ...(replyTweetId ? { replyTweetId } : {}),
        },
      });
    } catch (e) {
      log(`confirm for ${d.postId} failed: ${e.message} (reply posted ${replyTweetId || "?"})`);
    }
    posted += 1;
    log(`  replied @${d.authorHandle} ${d.postUrl} -> ${replyTweetId || "?"} :: ${(d.replyText || "").replace(/\s+/g, " ").slice(0, 110)}`);
  }
  log(`live: posted ${posted}/${drafts.length}`);
}

main().catch((e) => {
  log("runner error:", e.message);
  process.exit(1);
});
