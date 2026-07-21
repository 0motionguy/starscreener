#!/usr/bin/env node
// TrendingRepo — X engagement autopilot runner (TOOLBOX host).
//
// Reading AND posting use the host `twitter` CLI (free, cookie session — the
// same TWITTER_AUTH_TOKEN/CT0 the 7x/day broadcast uses). Only compose/ground/
// ledger live in the app. Flow:
//   1. auth guard: `twitter status` → must be @Trendingrepo, else refuse.
//   2. getTargets: POST { getTargets:true } → curated handles.
//   3. read: `twitter search --from <h> --type latest --exclude retweets --json`
//      per handle → build fresh candidates (FREE, unlike paid scrapecreators).
//   4. propose: POST { candidates, dryRun:true } → the app grounds + classifies
//      + freshness/ledger-filters + composes and returns the eligible drafts.
//   5. LIVE: `twitter reply <postId> <text> --json` per draft → POST { confirm }
//      so the app commits the ledger + audit. DRY just lists the drafts.
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
const MAX_HANDLES = Number(process.env.ENGAGE_MAX_HANDLES || 15);
const PER_HANDLE = Number(process.env.ENGAGE_PER_HANDLE || 6);

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

function toIso(raw) {
  if (!raw) return new Date(0).toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

// Map `twitter search --from <handle> --json` output into engagement candidates.
function tweetsToCandidates(handle, out) {
  let arr = [];
  try {
    const d = JSON.parse(out);
    arr = Array.isArray(d?.data) ? d.data : (d?.data?.tweets || d?.tweets || []);
  } catch {
    return [];
  }
  const cands = [];
  for (const t of Array.isArray(arr) ? arr : []) {
    const id = String(t.id_str || t.id || t.rest_id || t.tweet_id || "");
    if (!/^\d{10,25}$/.test(id)) continue;
    const text = String(t.full_text || t.text || t.content || "");
    cands.push({
      id,
      url: `https://x.com/${handle}/status/${id}`,
      authorId: handle.toLowerCase(),
      authorHandle: handle,
      text,
      createdAt: toIso(t.created_at || t.createdAt || t.date || t.time),
      isReply: /^@\w/.test(text.trim()),
      isRetweet: /^RT\s+@\w/i.test(text.trim()),
      likeCount: Number(t.favorite_count || t.like_count || t.likes || 0) || 0,
      matchedReason: `target:@${handle}`,
    });
  }
  return cands;
}

async function main() {
  if (!SECRET) {
    log("CRON_SECRET unset — abort");
    process.exit(1);
  }
  if (!DRY && MODE !== "dry" && MODE !== "live") {
    log(`mode=${MODE || "unset"} != live/dry — dormant skip`);
    process.exit(0);
  }

  // Cookies drive both the CLI read and the CLI reply — auth-guard once.
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
    log(`session @${user || "?"}, expected @${POST_ACCOUNT} — REFUSING`);
    process.exit(1);
  }
  log("authed as @" + user);

  // Targets from the app (curated roster, self-excluded).
  let handles = [];
  try {
    const r = await callApp({ getTargets: true });
    handles = Array.isArray(r?.handles) ? r.handles : [];
  } catch (e) {
    log("getTargets failed:", e.message);
    process.exit(1);
  }
  if (!handles.length) {
    log("no targets — nothing to do");
    return;
  }

  // FREE read: search each handle's latest tweets via the cookie CLI.
  const candidates = [];
  for (const h of handles.slice(0, MAX_HANDLES)) {
    let out;
    try {
      out = twitter(["search", "--from", h, "--type", "latest", "--exclude", "retweets", "--json"]);
    } catch (e) {
      log(`search @${h} failed: ${e.message}`);
      continue;
    }
    for (const c of tweetsToCandidates(h, out).slice(0, PER_HANDLE)) candidates.push(c);
  }
  log(`read ${candidates.length} candidates from ${Math.min(handles.length, MAX_HANDLES)} targets (free CLI)`);
  if (!candidates.length) {
    log("no candidates read — done");
    return;
  }

  // Propose: the app grounds + classifies + filters + composes (no ledger).
  const result = await callApp({ candidates, dryRun: true });
  const drafts = (Array.isArray(result?.records) ? result.records : []).filter(
    (r) => r.status === "drafted" && r.postId && r.replyText,
  );
  log(`propose: scanned=${result.scanned} eligible=${result.eligible} drafted=${drafts.length} budget=${result.dailyBudgetRemaining}`);
  for (const d of drafts) {
    log(`  [draft] @${d.authorHandle} ${d.postUrl} :: ${(d.replyText || "").replace(/\s+/g, " ").slice(0, 160)}`);
  }

  const live = MODE === "live" && !DRY;
  if (!live) {
    log(`dry: ${drafts.length} draft(s), posted 0`);
    return;
  }

  // LIVE — post each reply via the cookie CLI, then confirm to the app.
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
