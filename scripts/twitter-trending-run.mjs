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
const ACCOUNT = process.env.TWITTER_ACCOUNT || "Trendingrepo";
const POST_ATTEMPTS = Math.max(1, Number(process.env.TRENDING_POST_ATTEMPTS || 3));
const POST_RETRY_BASE_MS = Math.max(
  1_000,
  Number(process.env.TRENDING_POST_RETRY_MS || 45_000),
);

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

// execFileSync's `message` is only "Command failed: <argv>" — the CLI writes its
// real error to stdout (`--json` mode) or stderr. Logging just `message` is how
// the 2026-07-21 post failure became undiagnosable.
function cliError(e) {
  const out = [e?.stdout, e?.stderr]
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean)
    .join(" | ");
  const msg = String(e?.message || "unknown").split("\n")[0];
  return (out ? `${out} :: ${msg}` : msg).slice(0, 800);
}

function normalizeTweetText(s) {
  return String(s || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Did the pending post actually publish? The intent is written BEFORE the CLI
// post so a crash between post and confirm stays recoverable — but a FAILED post
// leaves that same file with no tweetId, and refusing to proceed turns one
// transient error into a permanent outage (2026-07-21: 21 slots lost).
// X's own timeline is the only source of truth, so ask it. Text alone is not
// enough (pack headers repeat weekly), hence the createdAt window.
// Returns "landed" (mutates intent.tweetId), "absent", or "unreachable".
async function resolvePendingOutcome(intent) {
  let raw;
  try {
    raw = twitter(["user-posts", ACCOUNT, "--json"]);
  } catch (e) {
    log("outcome probe failed:", cliError(e));
    return "unreachable";
  }
  let posts = null;
  try {
    const j = JSON.parse(raw);
    if (j?.ok !== false) posts = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null;
  } catch {
    /* fall through to the unreachable guard */
  }
  if (!posts?.length) {
    log("outcome probe: no usable timeline — leaving intent for the next slot");
    return "unreachable";
  }

  const want = normalizeTweetText(intent.confirm.text);
  const createdAt = Date.parse(intent.createdAt);
  if (!want || !Number.isFinite(createdAt)) return "absent";
  const from = createdAt - 2 * 60 * 1000;
  const to = createdAt + 30 * 60 * 1000;
  const hit = posts.find((p) => {
    const at = Date.parse(p?.createdAtISO || p?.createdAt || "");
    if (!Number.isFinite(at) || at < from || at > to) return false;
    return normalizeTweetText(p?.text).startsWith(want);
  });
  if (!hit?.id) return "absent";
  intent.tweetId = String(hit.id);
  return "landed";
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
    throw new Error(`confirmIntent called without a tweetId (${INTENT_FILE})`);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// X error 226 — "This request looks like it might be automated" — is
// intermittent, not a ban: the same tweet usually goes through minutes later.
// It got much likelier once twitter-cli stopped being able to send
// x-client-transaction-id (x.com dropped the `ondemand.s` bundle reference the
// upstream xclienttransaction lib scrapes; 1.0.3 is latest and still broken, so
// there is no version to upgrade to). Treat it — plus rate limits and 5xx — as
// retriable rather than losing the slot.
function isRetriablePostError(message) {
  return (
    /\(226\)|might be automated/i.test(message) ||
    /HTTP (?:429|5\d\d)\b/.test(message) ||
    /rate.?limit|timed? ?out|ETIMEDOUT|ECONNRESET/i.test(message)
  );
}

/**
 * Post via the host CLI with bounded retries. Before EVERY retry it asks X
 * whether the previous attempt actually landed, so a retry can never
 * double-post. Returns the CLI output, or null when a failed attempt turned out
 * to have landed (intent.tweetId is then set and the caller should confirm).
 */
async function postWithRetry(tweet, mediaFile, intent) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const args = ["post", tweet, "--json"];
      if (mediaFile) args.splice(2, 0, MEDIA_FLAG, mediaFile);
      return twitter(args);
    } catch (e) {
      const message = cliError(e);
      log(`twitter post attempt ${attempt}/${POST_ATTEMPTS} failed:`, message);

      // Never retry blind — the CLI can fail after X accepted the tweet.
      if ((await resolvePendingOutcome(intent)) === "landed") {
        log("post landed despite the CLI error ->", intent.tweetId);
        return null;
      }
      if (attempt >= POST_ATTEMPTS || !isRetriablePostError(message)) {
        process.exit(1);
      }
      const waitMs = POST_RETRY_BASE_MS * attempt;
      log(`retriable — waiting ${Math.round(waitMs / 1000)}s before retry`);
      await sleep(waitMs);
    }
  }
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
    if (!pending.tweetId) {
      const outcome = await resolvePendingOutcome(pending);
      if (outcome === "unreachable") {
        log("outcome unresolved — skipping this slot, will retry next tick");
        process.exit(0);
      }
      if (outcome === "absent") {
        // The post never reached X. Drop the intent and use this slot rather
        // than dead-locking every future slot behind a failure that already
        // resolved itself.
        log(`pending post never landed on @${ACCOUNT} — discarding intent, recovering slot`);
        await unlink(INTENT_FILE).catch(() => {});
      } else {
        log("outcome probe: pending post DID land ->", pending.tweetId);
        await writeIntent(pending);
      }
    }
    if (pending.tweetId) {
      await confirmIntent(pending);
      return;
    }
  }

  // 1. Auth guard (skipped in dry-run — the endpoint needs no cookies).
  if (!DRY) {
    let raw;
    try {
      raw = twitter(["--compact", "status"]);
    } catch (e) {
      log("twitter status failed:", cliError(e), "— skip");
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

  // 4. Post via the host CLI, retrying X's intermittent automation rejection.
  let out;
  try {
    out = await postWithRetry(tweet, mediaFile, intent);
  } finally {
    if (mediaFile) await unlink(mediaFile).catch(() => {});
  }
  if (out === null) {
    // A failed attempt had actually landed; postWithRetry set intent.tweetId.
    await writeIntent(intent);
    await confirmIntent(intent);
    return;
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
