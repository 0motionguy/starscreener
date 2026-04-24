#!/usr/bin/env node
// Bucket the cached TrustMRR catalog into (category, star-range, ph-launch?)
// benchmark bands and write data/revenue-benchmarks.json. Consumed by the
// /tools/revenue-estimate page.
//
// Deliberately *not* a regression — with a few-hundred-startup corpus and
// stars being a weak predictor of revenue, a regression overfits and is a
// week of work for marginal accuracy. The bucketed p25/p50/p75 table ships
// today and is easier to reason about.
//
// Inputs:
//   data/trustmrr-startups.json   — full catalog (scripts/sync-trustmrr.mjs)
//   data/repo-metadata.json       — for the star counts of matched repos
//   data/producthunt-launches.json — for the "launched on PH" dimension
//   data/revenue-overlays.json    — to map catalog slug → repo fullName
//
// Output:
//   data/revenue-benchmarks.json
//     {
//       generatedAt, version, totalStartups, totalBuckets,
//       buckets: [{ category, starBand, phLaunched, n, p25, p50, p75 }],
//       starBands: string[]
//     }

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const CATALOG_FILE = resolve(DATA_DIR, "trustmrr-startups.json");
const OVERLAYS_FILE = resolve(DATA_DIR, "revenue-overlays.json");
const REPO_METADATA_FILE = resolve(DATA_DIR, "repo-metadata.json");
const PH_FILE = resolve(DATA_DIR, "producthunt-launches.json");
const OUT_FILE = resolve(DATA_DIR, "revenue-benchmarks.json");

const MIN_BUCKET_SIZE = 5; // skip buckets with n < 5

// Star bands tuned to where the action is for indie-hacker / devtools repos.
// Feel free to revisit after a few sync cycles.
const STAR_BANDS = [
  { label: "0-100", min: 0, max: 100 },
  { label: "100-500", min: 100, max: 500 },
  { label: "500-2K", min: 500, max: 2_000 },
  { label: "2K-10K", min: 2_000, max: 10_000 },
  { label: "10K-50K", min: 10_000, max: 50_000 },
  { label: "50K+", min: 50_000, max: Number.POSITIVE_INFINITY },
];

function bandFor(stars) {
  if (typeof stars !== "number" || !Number.isFinite(stars)) return null;
  return STAR_BANDS.find((b) => stars >= b.min && stars < b.max) ?? null;
}

async function readJsonSafe(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * frac);
}

async function main() {
  const catalog = await readJsonSafe(CATALOG_FILE, null);
  if (!catalog || !Array.isArray(catalog.startups) || catalog.startups.length === 0) {
    console.error(
      "[benchmarks] no trustmrr-startups.json — run scripts/sync-trustmrr.mjs --mode=full first",
    );
    process.exit(1);
  }

  const overlays = await readJsonSafe(OVERLAYS_FILE, { overlays: {} });
  const metadata = await readJsonSafe(REPO_METADATA_FILE, { items: [] });
  const ph = await readJsonSafe(PH_FILE, { launches: [] });

  // slug -> repo fullName (from the overlay match)
  const slugToFullName = new Map();
  for (const [fullName, overlay] of Object.entries(overlays.overlays ?? {})) {
    if (overlay && typeof overlay.trustmrrSlug === "string") {
      slugToFullName.set(overlay.trustmrrSlug, fullName);
    }
  }

  // fullName -> stars (from repo-metadata.json)
  const starsByFullName = new Map();
  for (const item of metadata.items ?? []) {
    if (item && typeof item.fullName === "string" && typeof item.stars === "number") {
      starsByFullName.set(item.fullName, item.stars);
    }
  }

  // fullName -> has PH launch (any tracked launch)
  const phLaunchedFullNames = new Set();
  const phLaunches = Array.isArray(ph.launches) ? ph.launches : [];
  for (const launch of phLaunches) {
    const candidates = [
      launch?.repoFullName,
      launch?.linkedRepo,
      launch?.githubFullName,
    ].filter(Boolean);
    for (const c of candidates) phLaunchedFullNames.add(c);
  }

  // Build per-(category, band, ph) buckets from the catalog. For startups
  // matched to a repo, use that repo's stars and PH-launched flag; for
  // unmatched startups, stars are unknown — bucket them under a synthetic
  // starBand "unmatched" so the estimator can expose them as "category-only"
  // benchmarks when no star count is given.
  const buckets = new Map();

  function push(category, starBand, phLaunched, mrrCents) {
    const key = `${category}||${starBand}||${phLaunched ? "ph" : "noph"}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        category,
        starBand,
        phLaunched,
        values: [],
      });
    }
    buckets.get(key).values.push(mrrCents);
  }

  for (const s of catalog.startups) {
    if (!s || typeof s !== "object") continue;
    const category = (typeof s.category === "string" && s.category.trim()) || "uncategorized";
    // TrustMRR returns monetary fields as dollars-with-decimals, not cents.
    // Convert to integer cents here so the estimator's percentile output is
    // consistent with the overlay schema (see scripts/_trustmrr.mjs).
    const mrrDollars = s.revenue?.mrr;
    if (
      typeof mrrDollars !== "number" ||
      !Number.isFinite(mrrDollars) ||
      mrrDollars <= 0
    ) {
      // Skip zero-MRR startups from benchmarks too — their percentiles would
      // skew the distribution and mislead the estimator.
      continue;
    }
    const mrrCents = Math.round(mrrDollars * 100);
    const fullName = slugToFullName.get(s.slug);
    const stars = fullName ? starsByFullName.get(fullName) : null;
    const band = bandFor(stars);
    const starBand = band ? band.label : "unmatched";
    const phLaunched = fullName ? phLaunchedFullNames.has(fullName) : false;
    push(category, starBand, phLaunched, mrrCents);
  }

  const serialized = [];
  for (const bucket of buckets.values()) {
    if (bucket.values.length < MIN_BUCKET_SIZE) continue;
    const sorted = [...bucket.values].sort((a, b) => a - b);
    serialized.push({
      category: bucket.category,
      starBand: bucket.starBand,
      phLaunched: bucket.phLaunched,
      n: bucket.values.length,
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
    });
  }

  serialized.sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    const ai = STAR_BANDS.findIndex((b2) => b2.label === a.starBand);
    const bi = STAR_BANDS.findIndex((b2) => b2.label === b.starBand);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return Number(b.phLaunched) - Number(a.phLaunched);
  });

  const out = {
    generatedAt: new Date().toISOString(),
    version: 1,
    totalStartups: catalog.startups.length,
    totalBuckets: serialized.length,
    minBucketSize: MIN_BUCKET_SIZE,
    starBands: STAR_BANDS.map((b) => b.label),
    buckets: serialized,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(
    `[benchmarks] wrote ${OUT_FILE} — ${serialized.length} populated bucket(s) from ${catalog.startups.length} startup(s)`,
  );
}

main().catch((err) => {
  console.error("[benchmarks] fatal:", err);
  process.exit(1);
});
