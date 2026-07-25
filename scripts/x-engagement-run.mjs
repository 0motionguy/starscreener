#!/usr/bin/env node
// TrendingRepo — X engagement autopilot runner (TOOLBOX host).
//
// Reading AND posting use the host `twitter` CLI (free, cookie session — the
// same TWITTER_AUTH_TOKEN/CT0 the 7x/day broadcast uses). Only compose/ground/
// ledger live in the app. Flow:
//   1. auth guard: `twitter status` → must be @Trendingrepo, else refuse.
//   2. getTargets: POST { getTargets:true } → curated handles.
//   3. read: `twitter user-posts <h> --json` per handle → build fresh candidates
//      (FREE, unlike paid scrapecreators). NOT `search --from`: X rotated the
//      SearchTimeline queryId twitter-cli hardcodes, so every search 404s.
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

// execFileSync's `message` is only "Command failed: <argv>" — twitter-cli writes
// its real error to stdout under --json. Logging just `message` hides the cause.
function cliError(e) {
  const out = [e?.stdout, e?.stderr]
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean)
    .join(" | ");
  const msg = String(e?.message || "unknown").split("\n")[0];
  return (out ? `${out} :: ${msg}` : msg).slice(0, 400);
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

// Map `twitter user-posts <handle> --json` output into engagement candidates.
//
// `search --from` is permanently dead: twitter-cli resolves queryIds with
// prefer_fallback=True, so SearchTimeline always uses the hardcoded
// MJpyQGqgklrVl_0X9gNy3A (graphql.py FALLBACK_QUERY_IDS) — X rotated it and
// every search now 404s. UserTweets still resolves, and for a curated roster
// "this handle's latest posts" is exactly what we were asking search for.
function tweetsToCandidates(handle, out) {
  let arr = [];
  try {
    const d = JSON.parse(out);
    // The CLI reports API failures as an ok:false payload on stdout with a zero
    // exit code — treating that as "no tweets" is how 15 dead reads looked like
    // a quiet day instead of an outage.
    if (d?.ok === false) {
      log(`read @${handle} error: ${JSON.stringify(d.error || {}).slice(0, 200)}`);
      return [];
    }
    arr = Array.isArray(d?.data) ? d.data : (d?.data?.tweets || d?.tweets || []);
  } catch {
    return [];
  }
  const cands = [];
  for (const t of Array.isArray(arr) ? arr : []) {
    const id = String(t.id_str || t.id || t.rest_id || t.tweet_id || "");
    if (!/^\d{10,25}$/.test(id)) continue;
    const text = String(t.full_text || t.text || t.content || "");
    // `search --exclude retweets` filtered these server-side; user-posts flags
    // them instead, so drop them here.
    if (t.isRetweet === true || /^RT\s+@\w/i.test(text.trim())) continue;
    cands.push({
      id,
      url: `https://x.com/${handle}/status/${id}`,
      authorId: handle.toLowerCase(),
      authorHandle: handle,
      text,
      createdAt: toIso(t.createdAtISO || t.created_at || t.createdAt || t.date || t.time),
      isReply: /^@\w/.test(text.trim()),
      isRetweet: false,
      likeCount:
        Number(t.metrics?.likes ?? t.favorite_count ?? t.like_count ?? t.likes ?? 0) || 0,
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
    log("twitter status failed:", cliError(e), "— skip");
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

  // FREE read: pull each handle's latest posts via the cookie CLI.
  const candidates = [];
  let readFailures = 0;
  for (const h of handles.slice(0, MAX_HANDLES)) {
    let out;
    try {
      out = twitter(["user-posts", h, "--json"]);
    } catch (e) {
      readFailures += 1;
      log(`read @${h} failed: ${cliError(e)}`);
      continue;
    }
    for (const c of tweetsToCandidates(h, out).slice(0, PER_HANDLE)) candidates.push(c);
  }
  const targets = Math.min(handles.length, MAX_HANDLES);
  log(
    `read ${candidates.length} candidates from ${targets} targets (free CLI)` +
      (readFailures ? ` — ${readFailures}/${targets} reads FAILED` : ""),
  );
  if (!candidates.length) {
    // Every read failing is a transport outage, not a quiet day. Exit non-zero
    // so it shows up as a failed run instead of a clean no-op.
    if (readFailures === targets) {
      log(`ALL ${targets} reads failed — X transport is down, not an empty roster`);
      process.exit(1);
    }
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
