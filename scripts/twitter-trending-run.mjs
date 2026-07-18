#!/usr/bin/env node
// TrendingRepo — 5x/day X autopilot runner (TOOLBOX host).
//
// Runs from /etc/cron.d on the box, NOT inside the app container, because it
// drives the host `twitter` CLI (agent-reach / twitter-cli, cookie session).
// Self-contained: Node built-ins + global fetch only, no app imports.
//
// Flow: auth-guard -> POST /api/cron/twitter-trending {slot} (propose)
//   -> download the OG card the proposal names (mediaPath, optional)
//   -> twitter post [-i card.png] -> POST confirm {fullNames, format, packId}
//      (commits the Redis ledger — every pack member starts its cooldown).
// Cap + 14d cooldown make a double fire a no-op. `--dry-run` skips the auth
// guard and the post, printing the composed tweet + card status instead.
//
// Args: --slot A|B|C|D|E   content-calendar slot (omit = plain trending single)
//       --dry-run      compose + fetch card, never post
//
// Env: CRON_SECRET (required), TRENDINGREPO_URL (default localhost:3023),
//      TWITTER_MEDIA_FLAG (default "-i" — the CLI's attach-image flag),
//      TRENDING_POST_INTENT_FILE (default /var/lib/.../pending.json), plus
//      TWITTER_AUTH_TOKEN / TWITTER_CT0 sourced for the `twitter` CLI.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const APP = (process.env.TRENDINGREPO_URL || "http://localhost:3023").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET;
const DRY = process.argv.includes("--dry-run");
const MEDIA_FLAG = process.env.TWITTER_MEDIA_FLAG || "-i";
const INTENT_FILE =
  process.env.TRENDING_POST_INTENT_FILE ||
  "/var/lib/trendingrepo-x-autopilot/pending.json";

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
const SLOT = ["A", "B", "C", "D", "E", "F", "G"].includes(SLOT_RAW) ? SLOT_RAW : undefined;

function twitter(args) {
  return execFileSync("twitter", args, { encoding: "utf8", timeout: 60_000 });
}

async function readIntent() {
  try {
    const intent = JSON.parse(await readFile(INTENT_FILE, "utf8"));
    const valid =
      intent?.version === 1 &&
      typeof intent.createdAt === "string" &&
      typeof intent.slot === "string" &&
      Array.isArray(intent.confirm?.fullNames) &&
      intent.confirm.fullNames.length > 0 &&
      typeof intent.confirm.text === "string" &&
      (intent.tweetId === undefined || /^\d{15,20}$/.test(intent.tweetId));
    if (!valid) throw new Error("invalid pending intent");
    return intent;
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw new Error(`cannot read pending post intent ${INTENT_FILE}: ${e.message}`);
  }
}

async function writeIntent(intent) {
  await mkdir(dirname(INTENT_FILE), { recursive: true, mode: 0o700 });
  const temp = `${INTENT_FILE}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(intent)}\n`, { mode: 0o600 });
  await rename(temp, INTENT_FILE);
}

async function confirmIntent(intent) {
  if (!intent.tweetId) {
    throw new Error(
      `pending post outcome unknown; inspect @trendingrepo before removing ${INTENT_FILE}`,
    );
  }
  const cres = await fetch(`${APP}/api/cron/twitter-trending`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      confirm: { ...intent.confirm, tweetId: intent.tweetId },
    }),
  });
  if (!cres.ok) {
    throw new Error(`confirm HTTP ${cres.status}: ${(await cres.text()).slice(0, 200)}`);
  }
  await unlink(INTENT_FILE);
  log("posted", `slot=${intent.slot}`, intent.tweetId);
  log("confirm:", cres.status, "->", intent.confirm.fullNames.join(", "));
  log("tweet: https://x.com/trendingrepo/status/" + intent.tweetId);
}

// Download the proposal's OG card. Any failure -> null (post text-only rather
// than losing the slot). Guards: PNG magic + >10KB so we never attach an HTML
// error page or a half-rendered card.
async function fetchCard(mediaPath) {
  try {
    const res = await fetch(`${APP}${mediaPath}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      log("card HTTP", res.status, "— posting without media");
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const isPng =
      buf.length > 10_240 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isPng) {
      log(`card invalid (${buf.length}B, not PNG) — posting without media`);
      return null;
    }
    const file = join(tmpdir(), `trendingrepo-x-card-${Date.now()}.png`);
    await writeFile(file, buf);
    log(`card ok: ${(buf.length / 1024).toFixed(0)}KB -> ${file}`);
    return file;
  } catch (e) {
    log("card fetch failed:", e.message, "— posting without media");
    return null;
  }
}

async function main() {
  if (!SECRET) {
    log("CRON_SECRET unset — abort");
    process.exit(1);
  }

  const pending = await readIntent();
  if (pending) {
    if (DRY) {
      throw new Error(`pending post requires reconciliation: ${INTENT_FILE}`);
    }
    log("reconciling pending post", pending.tweetId || "outcome-unknown");
    await confirmIntent(pending);
    return;
  }

  // 1. Auth guard (skipped in dry-run — the endpoint needs no cookies).
  if (!DRY) {
    let raw;
    try {
      raw = twitter(["--compact", "status"]);
    } catch (e) {
      log("twitter status failed:", e.message, "— skip");
      process.exit(0);
    }
    // `--compact status` emits YAML, not JSON — parse loosely.
    const ok = /^ok:\s*true\b/m.test(raw);
    const user = (raw.match(/^\s*username:\s*['"]?([A-Za-z0-9_]+)/m) || [])[1] || "";
    if (!ok) {
      log("not authenticated — skip (run `trending-twitter-login` on the box)");
      process.exit(0);
    }
    if (user.toLowerCase() !== "trendingrepo") {
      log(`session is @${user || "?"}, expected @trendingrepo — REFUSING to post`);
      process.exit(1);
    }
    log("authed as @" + user);
  }

  // 2. Propose — the endpoint resolves the slot's calendar format (single /
  //    discovery / themed pack), checks cooldown/cap, and composes.
  const pres = await fetch(`${APP}/api/cron/twitter-trending`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(SLOT ? { slot: SLOT } : {}),
  });
  if (!pres.ok) {
    log("propose HTTP", pres.status, (await pres.text()).slice(0, 200));
    process.exit(1);
  }
  const plan = await pres.json();
  if (!plan?.post) {
    log("no post:", plan?.reason || "unknown", SLOT ? `(slot ${SLOT})` : "");
    process.exit(0);
  }

  const members = plan.fullNames?.length ? plan.fullNames : [plan.fullName];
  const tweet = `${plan.text}\n${plan.url}`;
  log(
    `candidate: ${plan.format || "trending_single"}${plan.packId ? `/${plan.packId}` : ""}`,
    members.join(", "),
  );

  // 3. Card (optional — text-only post is always better than a lost slot).
  const mediaFile = plan.mediaPath ? await fetchCard(plan.mediaPath) : null;

  if (DRY) {
    log(
      `DRY-RUN — would tweet${mediaFile ? " with card" : " (no card)"}:\n----\n${tweet}\n----`,
    );
    process.exit(0);
  }

  const intent = {
    version: 1,
    createdAt: new Date().toISOString(),
    slot: SLOT ?? "unslotted",
    confirm: {
      fullNames: members,
      text: plan.text,
      ...(plan.format ? { format: plan.format } : {}),
      ...(plan.packId ? { packId: plan.packId } : {}),
      ...(plan.ranker ? { ranker: plan.ranker } : {}),
      ...(plan.source ? { source: plan.source } : {}),
    },
  };
  await writeIntent(intent);

  // 4. Post via the host CLI.
  let out;
  try {
    const args = ["post", tweet, "--json"];
    if (mediaFile) args.splice(2, 0, MEDIA_FLAG, mediaFile);
    out = twitter(args);
  } catch (e) {
    log("twitter post failed:", e.message);
    process.exit(1);
  } finally {
    if (mediaFile) await unlink(mediaFile).catch(() => {});
  }
  let tweetId;
  try {
    const j = JSON.parse(out);
    tweetId = j?.data?.id || j?.id || j?.data?.tweetId;
  } catch {
    /* CLI may emit YAML instead of JSON — loose-match the id below */
  }
  if (!tweetId) tweetId = (out.match(/\b(\d{15,20})\b/) || [])[1];
  if (!tweetId) {
    log("no tweet id in CLI response:", out.slice(0, 200));
    process.exit(1);
  }
  // 5. Confirm — commit the durable ledger + audit so cooldown/cap hold.
  //    v2 body (fullNames/format/packId); the endpoint also accepts the old
  //    {fullName} shape, so a stale runner and a new app stay compatible.
  intent.tweetId = String(tweetId);
  await writeIntent(intent);

  // Confirm is idempotent on tweetId/fullName. On failure the intent stays on
  // disk, and the next run reconciles it before any new proposal or post.
  await confirmIntent(intent);
}

main().catch((e) => {
  log("runner error:", e.message);
  process.exit(1);
});
