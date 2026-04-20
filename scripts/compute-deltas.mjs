#!/usr/bin/env node
// Compute per-repo deltas from the git history of data/trending.json and
// emit data/deltas.json. Runs after scrape-trending in the hourly GHA
// workflow; replaces the ephemeral /tmp-based snapshot pipeline that
// couldn't survive per-invocation Vercel Lambdas.
//
// Algorithm: for each window {1h, 24h, 7d, 30d}, find the commit whose
// committer-timestamp is nearest to `now - window` within a per-window
// buffer. Load that historical trending.json via `git show <sha>:path`
// and join current rows against historical rows by repo_id.
//
// Cold-start: if no commit falls inside a window's buffer we fall back to
// the nearest-in-time commit from the full history of trending.json and
// tag the basis as 'cold-start' with `age_seconds = now - picked_ts`. The
// delta value is real but computed over a shorter window than requested,
// so downstream consumers treat it as diagnostic-only until at least one
// window hits a real (exact/nearest) commit. Only when trending.json has
// never been committed do we emit { value: null, basis: 'no-history' }.
// The script exits 0 either way.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRENDING_PATH = resolve(ROOT, "data/trending.json");
const TRENDING_REL = "data/trending.json";
const OUT_PATH = resolve(ROOT, "data/deltas.json");

// Target windows. buffer_s bounds how far off a candidate commit may be
// from `target = now - window` before we call it 'no-history'.
const WINDOWS = [
  { key: "1h",  seconds: 60 * 60,             buffer_s: 30 * 60 },       // ±30 min
  { key: "24h", seconds: 24 * 60 * 60,        buffer_s: 30 * 60 },       // ±30 min
  { key: "7d",  seconds: 7 * 24 * 60 * 60,    buffer_s: 6 * 60 * 60 },   // ±6 hours
  { key: "30d", seconds: 30 * 24 * 60 * 60,   buffer_s: 6 * 60 * 60 },   // ±6 hours
];

const EXACT_THRESHOLD_S = 60;

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// List every commit touching data/trending.json within [since, until] as
// `{ sha, ts }` tuples. Timestamps are committer-time seconds (%ct).
function listCommitsInWindow(sinceEpoch, untilEpoch) {
  const out = git([
    "log",
    `--since=${sinceEpoch}`,
    `--until=${untilEpoch}`,
    "--format=%H %ct",
    "--",
    TRENDING_REL,
  ]);
  return parseCommitList(out);
}

// Every commit touching data/trending.json. Used for cold-start fallback
// when no commit falls inside a window's buffer.
function listAllCommits() {
  const out = git(["log", "--format=%H %ct", "--", TRENDING_REL]);
  return parseCommitList(out);
}

function parseCommitList(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, ctStr] = line.split(/\s+/);
      return { sha, ts: Number.parseInt(ctStr, 10) };
    })
    .filter((c) => Number.isFinite(c.ts));
}

// Pick the commit closest to targetEpoch. Returns null when nothing in range.
function pickNearest(commits, targetEpoch) {
  if (commits.length === 0) return null;
  let best = commits[0];
  let bestDelta = Math.abs(best.ts - targetEpoch);
  for (let i = 1; i < commits.length; i += 1) {
    const d = Math.abs(commits[i].ts - targetEpoch);
    if (d < bestDelta) {
      best = commits[i];
      bestDelta = d;
    }
  }
  return { sha: best.sha, ts: best.ts, offset: bestDelta };
}

// Read data/trending.json at a specific commit. Returns null if the file
// didn't exist at that sha (e.g. commits before Phase 1).
function readTrendingAt(sha) {
  try {
    const raw = git(["show", `${sha}:${TRENDING_REL}`]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Flatten every bucket into a Map<repo_id, stars_int>. Dedupes by repo_id
// — a repo appearing in multiple buckets (24h/All and 24h/Python etc.) gets
// its max-observed stars value. Max is safe: stars are monotonically
// non-decreasing within a single trending.json snapshot.
function flattenToStarsById(trendingJson) {
  const out = new Map();
  const buckets = trendingJson?.buckets;
  if (!buckets) return out;
  for (const langMap of Object.values(buckets)) {
    for (const rows of Object.values(langMap)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const id = row?.repo_id;
        if (!id) continue;
        const stars = Number.parseInt(row.stars ?? "0", 10);
        if (!Number.isFinite(stars)) continue;
        const prev = out.get(id);
        if (prev === undefined || stars > prev) out.set(id, stars);
      }
    }
  }
  return out;
}

async function main() {
  const now = Math.floor(Date.now() / 1000);

  const currentJson = JSON.parse(await readFile(TRENDING_PATH, "utf8"));
  const currentStars = flattenToStarsById(currentJson);
  if (currentStars.size === 0) {
    throw new Error("current trending.json has zero joinable rows");
  }

  // Cached once — used for cold-start fallback when no in-buffer commit
  // exists. `git log` on a single file is cheap, but no need to repeat it
  // per window.
  const allCommits = listAllCommits();

  // Resolve each window to a picked commit. Three outcomes per window:
  //   - exact / nearest: commit found inside [target ± buffer_s].
  //   - cold-start:     buffer missed; fall back to nearest-in-time commit
  //                     from the full history. The resulting delta is a
  //                     partial-window number, diagnostic-only.
  //   - null:           no trending.json commits exist at all.
  const windowPicks = {};
  const historicalStars = {};
  for (const w of WINDOWS) {
    const target = now - w.seconds;
    const since = target - w.buffer_s;
    const until = target + w.buffer_s;
    const candidates = listCommitsInWindow(since, until);
    let picked = pickNearest(candidates, target);
    let basis;
    if (picked) {
      basis = picked.offset < EXACT_THRESHOLD_S ? "exact" : "nearest";
    } else {
      picked = pickNearest(allCommits, target);
      basis = picked ? "cold-start" : null;
    }
    if (picked && basis) {
      const pickInfo = {
        target_ts: target,
        buffer_s: w.buffer_s,
        picked_commit: picked.sha,
        picked_ts: picked.ts,
        offset_s: picked.offset,
        basis,
      };
      if (basis === "cold-start") pickInfo.age_seconds = now - picked.ts;
      windowPicks[w.key] = pickInfo;
      const hist = readTrendingAt(picked.sha);
      historicalStars[w.key] = hist ? flattenToStarsById(hist) : new Map();
    } else {
      windowPicks[w.key] = null;
      historicalStars[w.key] = null;
    }
  }

  const coverage = {
    "1h":  { exact: 0, nearest: 0, "cold-start": 0, "no-history": 0, "repo-not-tracked": 0 },
    "24h": { exact: 0, nearest: 0, "cold-start": 0, "no-history": 0, "repo-not-tracked": 0 },
    "7d":  { exact: 0, nearest: 0, "cold-start": 0, "no-history": 0, "repo-not-tracked": 0 },
    "30d": { exact: 0, nearest: 0, "cold-start": 0, "no-history": 0, "repo-not-tracked": 0 },
  };

  const repos = {};
  for (const [repoId, starsNow] of currentStars.entries()) {
    const entry = { stars_now: starsNow };
    for (const w of WINDOWS) {
      const pick = windowPicks[w.key];
      if (!pick) {
        entry[`delta_${w.key}`] = { value: null, basis: "no-history" };
        coverage[w.key]["no-history"] += 1;
        continue;
      }
      const histStars = historicalStars[w.key].get(repoId);
      if (histStars === undefined) {
        entry[`delta_${w.key}`] = { value: null, basis: "repo-not-tracked" };
        coverage[w.key]["repo-not-tracked"] += 1;
        continue;
      }
      const deltaEntry = {
        value: starsNow - histStars,
        basis: pick.basis,
        from_commit: pick.picked_commit,
        from_ts: pick.picked_ts,
      };
      if (pick.basis === "cold-start") {
        deltaEntry.age_seconds = pick.age_seconds;
      }
      entry[`delta_${w.key}`] = deltaEntry;
      coverage[w.key][pick.basis] += 1;
    }
    repos[repoId] = entry;
  }

  // Roll coverage into a flat summary so /api/health can compute
  // coverageQuality in O(1) without scanning every repo.
  const coverageSummary = { exact: 0, nearest: 0, "cold-start": 0, "no-history": 0, "repo-not-tracked": 0 };
  for (const w of WINDOWS) {
    for (const k of Object.keys(coverageSummary)) {
      coverageSummary[k] += coverage[w.key][k];
    }
  }

  const payload = {
    computedAt: new Date().toISOString(),
    windows: windowPicks,
    coverage: coverageSummary,
    repos,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`wrote ${OUT_PATH}`);
  console.log(`repos: ${currentStars.size}`);
  for (const w of WINDOWS) {
    const c = coverage[w.key];
    const total = c.exact + c.nearest + c["cold-start"] + c["no-history"] + c["repo-not-tracked"];
    const pct = (n) => (total === 0 ? "0" : ((n * 100) / total).toFixed(1));
    console.log(
      `  ${w.key.padStart(3)}: exact=${c.exact} (${pct(c.exact)}%)  nearest=${c.nearest} (${pct(c.nearest)}%)  cold-start=${c["cold-start"]} (${pct(c["cold-start"])}%)  no-history=${c["no-history"]}  repo-not-tracked=${c["repo-not-tracked"]}`,
    );
  }
}

main().catch((err) => {
  console.error("compute-deltas failed:", err.stack ?? err.message ?? err);
  process.exit(1);
});
