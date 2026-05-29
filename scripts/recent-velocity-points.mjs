#!/usr/bin/env node
// recent-velocity-points.mjs
//
// One-time seed of RECENT (last ~35 day) daily star points by walking each
// repo's stargazer list NEWEST-FIRST. This is the missing anchor data that
// star-activity-deltas needs to compute real 7d/30d RIGHT NOW.
//
// WHY: 7d/30d deltas diff the current star count against a point ~7/30 days
// ago. The full ASC backfill walks OLDEST-first (so it rarely reaches recent
// pages on big repos), and the daily snapshot only started covering the full
// registry today — so almost no repo has a 7-day-ago / 30-day-ago anchor
// (measured: 7/400 had a ~7d anchor). Walking newest-first and bucketing the
// last 35 days by day creates dense recent anchors cheaply (only the last few
// pages), giving immediate real 7d/30d. The widened daily snapshot maintains
// them going forward; this is the one-time catch-up.
//
// USAGE
//   GH_TOKEN_POOL=a,b,c REDIS_URL=redis://... node scripts/recent-velocity-points.mjs
//     --repos owner/a,owner/b      (explicit list; else reads repo-registry)
//     --limit 400                  (cap repo count)
//     --recent-days 35             (window depth; default 35)
//
// Merges the recent points into each repo's existing star-activity payload
// (keeps older history for the chart), so the worker star-activity-deltas
// fetcher then computes real 24h/7d/30d unchanged.

import "./_load-env.mjs";
import {
  writeDataStore,
  readDataStore,
  closeDataStore,
} from "./_data-store-write.mjs";

const GITHUB_API = "https://api.github.com";
const PER_PAGE = 100;
const PAGE_LIST_CAP = 400;
const RATE_FLOOR = 150;
const PAGE_DELAY_MS = 35;
const CONCURRENCY = 6;

function parseArgs() {
  const args = { repos: null, limit: null, recentDays: 35 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repos" && argv[i + 1]) {
      args.repos = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--limit" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) args.limit = n;
    } else if (a === "--recent-days" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) args.recentDays = n;
    }
  }
  return args;
}

function buildPool() {
  const pool = (process.env.GH_TOKEN_POOL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (pool.length === 0) {
    const single = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    if (single) pool.push(single);
  }
  return pool;
}

function headers(token) {
  return {
    Accept: "application/vnd.github.star+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "TR-recent-velocity",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function slugFor(fn) {
  return `star-activity:${fn.toLowerCase().replace("/", "__")}`;
}
function dayOf(iso) {
  return iso.slice(0, 10);
}
function rem(res) {
  const n = Number.parseInt(res.headers.get("x-ratelimit-remaining") ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

async function currentStars(fn, token) {
  const r = await fetch(`${GITHUB_API}/repos/${fn}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`repo ${r.status}`);
  const j = await r.json();
  return typeof j.stargazers_count === "number" ? j.stargazers_count : null;
}

// DESC walk: pages last..1, collect per-day counts within the recent window,
// stop once a page's oldest entry predates the cutoff.
async function recentPerDay(fn, token, recentDays) {
  const cutoff = Date.now() - recentDays * 86_400_000;
  const probe = await fetch(
    `${GITHUB_API}/repos/${fn}/stargazers?per_page=${PER_PAGE}&page=1`,
    { headers: headers(token) },
  );
  if (!probe.ok) throw new Error(`probe ${probe.status}`);
  let lastRem = rem(probe);
  const link = probe.headers.get("link") || "";
  const m = link.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  const lastPage = Math.min(m ? Number.parseInt(m[1], 10) : 1, PAGE_LIST_CAP);

  const perDay = new Map();
  const consume = (data) => {
    let oldestT = Infinity;
    for (const e of data) {
      if (!e || typeof e.starred_at !== "string") continue;
      const t = Date.parse(e.starred_at);
      if (!Number.isFinite(t)) continue;
      if (t < oldestT) oldestT = t;
      if (t >= cutoff) {
        const d = dayOf(e.starred_at);
        perDay.set(d, (perDay.get(d) ?? 0) + 1);
      }
    }
    return oldestT;
  };

  if (lastPage === 1) {
    const data = await probe.json();
    if (Array.isArray(data)) consume(data);
    return perDay;
  }

  for (let page = lastPage; page >= 1; page--) {
    if (lastRem !== null && lastRem < RATE_FLOOR) break;
    if (page < lastPage) await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    const res = await fetch(
      `${GITHUB_API}/repos/${fn}/stargazers?per_page=${PER_PAGE}&page=${page}`,
      { headers: headers(token) },
    );
    if (!res.ok) throw new Error(`page ${page} ${res.status}`);
    lastRem = rem(res);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) continue;
    const oldestT = consume(data);
    // Entire page predates the window → all lower pages are older too. Done.
    if (Number.isFinite(oldestT) && oldestT < cutoff) break;
  }
  return perDay;
}

function buildRecentPoints(perDay, total) {
  const days = Array.from(perDay.keys()).sort();
  const cumByDay = new Map();
  let after = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    cumByDay.set(d, total - after);
    after += perDay.get(d) ?? 0;
  }
  const points = days.map((d) => ({
    d,
    s: cumByDay.get(d) ?? total,
    delta: perDay.get(d) ?? 0,
  }));
  const today = dayOf(new Date().toISOString());
  if (points.length === 0 || points[points.length - 1].d !== today) {
    points.push({ d: today, s: total, delta: 0 });
  }
  return points;
}

async function seedOne(fn, token, recentDays) {
  const total = await currentStars(fn, token);
  if (total === null) return "skip";
  const perDay = await recentPerDay(fn, token, recentDays);
  const recentPoints = buildRecentPoints(perDay, total);
  if (recentPoints.length < 2) return "thin";

  const existing = await readDataStore(slugFor(fn)).catch(() => null);
  const existingPoints =
    existing && Array.isArray(existing.points) ? existing.points : [];
  const firstRecentDay = recentPoints[0].d;
  // Keep older history (for the chart); recent window comes from this walk.
  const older = existingPoints.filter((p) => p && p.d < firstRecentDay);
  const merged = [...older, ...recentPoints];

  const payload = {
    repoId: fn,
    points: merged,
    firstObservedAt:
      existing?.firstObservedAt ?? `${merged[0]?.d ?? today()}T00:00:00Z`,
    // Mark walked so star-activity-deltas trusts points[0] as inception for
    // genuinely-young repos (oldest point newer than the window).
    backfillSource:
      existing?.backfillSource && existing.backfillSource !== "snapshot-only"
        ? existing.backfillSource
        : "stargazer-api",
    coversFirstStar: existing?.coversFirstStar ?? older.length > 0,
    updatedAt: new Date().toISOString(),
  };
  await writeDataStore(slugFor(fn), payload, { stampPerRecord: false });
  return "ok";
}
function today() {
  return dayOf(new Date().toISOString());
}

async function main() {
  const args = parseArgs();
  const pool = buildPool();
  if (pool.length === 0) {
    console.error("[recent-velocity] no GH_TOKEN_POOL/GITHUB_TOKEN");
    process.exitCode = 1;
    return;
  }
  let repos = args.repos;
  if (!repos) {
    const reg = await readDataStore("repo-registry").catch(() => null);
    repos = Object.keys(reg?.repos ?? {});
  }
  if (args.limit && repos.length > args.limit) repos = repos.slice(0, args.limit);
  console.log(
    `[recent-velocity] ${repos.length} repos, pool=${pool.length}, recentDays=${args.recentDays}`,
  );

  let ok = 0,
    thin = 0,
    skip = 0,
    failed = 0,
    cursor = 0;
  const queue = [...repos];
  let idx = 0;
  const worker = async () => {
    while (queue.length > 0) {
      const fn = queue.shift();
      if (!fn) break;
      const token = pool[cursor++ % pool.length];
      try {
        const r = await seedOne(fn, token, args.recentDays);
        if (r === "ok") ok++;
        else if (r === "thin") thin++;
        else skip++;
        if (++idx % 25 === 0)
          console.log(`[recent-velocity] ${idx}/${repos.length} ok=${ok} thin=${thin} skip=${skip} failed=${failed}`);
      } catch (e) {
        failed++;
        const msg = String(e?.message ?? e);
        // Rotate past a 403/429 token by simply continuing (next repo uses next token).
        if (!/\b(403|429|404)\b/.test(msg)) {
          console.error(`[recent-velocity] ${fn}: ${msg}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `[recent-velocity] done — ok=${ok} thin=${thin} skip=${skip} failed=${failed}`,
  );
  await closeDataStore();
}

process.on("unhandledRejection", (e) =>
  console.error("[recent-velocity] unhandledRejection", e),
);
main().catch((e) => {
  console.error("[recent-velocity] fatal", e);
  process.exitCode = 1;
});
