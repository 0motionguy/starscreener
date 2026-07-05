#!/usr/bin/env node
// TrendingRepo — 3x/day X autopilot runner (TOOLBOX host).
//
// Runs from /etc/cron.d on the box, NOT inside the app container, because it
// drives the host `twitter` CLI (agent-reach / twitter-cli, cookie session).
// Self-contained: Node built-ins + global fetch only, no app imports.
//
// Flow: auth-guard -> POST /api/cron/twitter-trending (propose) -> twitter post
// -> POST confirm (commits the Redis ledger + audit). Cap + 14d cooldown make a
// double fire a no-op. `--dry-run` skips the auth guard and the post, printing
// the composed tweet the endpoint would send.
//
// Env: CRON_SECRET (required), TRENDINGREPO_URL (default localhost:3023),
//      plus TWITTER_AUTH_TOKEN / TWITTER_CT0 sourced for the `twitter` CLI.

import { execFileSync } from "node:child_process";

const APP = (process.env.TRENDINGREPO_URL || "http://localhost:3023").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET;
const DRY = process.argv.includes("--dry-run");

const log = (...a) => console.log(new Date().toISOString(), ...a);

function twitter(args) {
  return execFileSync("twitter", args, { encoding: "utf8", timeout: 60_000 });
}

async function main() {
  if (!SECRET) {
    log("CRON_SECRET unset — abort");
    process.exit(1);
  }

  // 1. Auth guard (skipped in dry-run — the endpoint needs no cookies).
  if (!DRY) {
    let status;
    try {
      status = JSON.parse(twitter(["--compact", "status"]));
    } catch (e) {
      log("twitter status failed:", e.message, "— skip");
      process.exit(0);
    }
    if (!status?.ok) {
      log("not authenticated — skip (run `trending-twitter-login` on the box)");
      process.exit(0);
    }
    log("authed as @" + (status?.data?.user?.username || "?"));
  }

  // 2. Propose — the endpoint ranks (spam-filtered), checks cooldown/cap, composes.
  const pres = await fetch(`${APP}/api/cron/twitter-trending`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  if (!pres.ok) {
    log("propose HTTP", pres.status, (await pres.text()).slice(0, 200));
    process.exit(1);
  }
  const plan = await pres.json();
  if (!plan?.post) {
    log("no post:", plan?.reason || "unknown");
    process.exit(0);
  }

  const tweet = `${plan.text}\n${plan.url}`;
  log("candidate:", plan.fullName);
  if (DRY) {
    log("DRY-RUN — would tweet:\n----\n" + tweet + "\n----");
    process.exit(0);
  }

  // 3. Post via the host CLI.
  let out;
  try {
    out = twitter(["post", tweet, "--json"]);
  } catch (e) {
    log("twitter post failed:", e.message);
    process.exit(1);
  }
  let tweetId;
  try {
    const j = JSON.parse(out);
    tweetId = j?.data?.id || j?.id || j?.data?.tweetId;
  } catch {
    /* fall through to the id check */
  }
  if (!tweetId) {
    log("no tweet id in CLI response:", out.slice(0, 200));
    process.exit(1);
  }
  log("posted", tweetId);

  // 4. Confirm — commit the durable ledger + audit so cooldown/cap hold.
  const cres = await fetch(`${APP}/api/cron/twitter-trending`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: { fullName: plan.fullName, tweetId, text: plan.text } }),
  });
  log("confirm:", cres.status, "->", plan.fullName);
  log("tweet: https://x.com/BreakSroom/status/" + tweetId);
}

main().catch((e) => {
  log("runner error:", e.message);
  process.exit(1);
});
