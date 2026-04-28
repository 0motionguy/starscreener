#!/usr/bin/env node
// Backfill homepageUrl / topics / description onto reconciler-produced stubs
// in `data/repo-metadata.json`.
//
// Context
// -------
// `scripts/reconcile-repo-stores.mjs` (wave 4) folds every pipeline repo from
// `.data/repos.jsonl` into `data/repo-metadata.json` as a minimal stub tagged
// `source: "pipeline-jsonl-stub"`. Those stubs carry `homepageUrl: null` so
// they never contribute to the funding matcher's 1.00-confidence domain band
// — killing recall for brands like Hugging Face or Vercel even when the
// domain would otherwise have resolved.
//
// This script hydrates stubs from cached sources without forcing a live
// scrape. Three sources, in priority order:
//
//   1. `data/repo-profiles.json` — the AISO-gated profile snapshot. Its
//      `websiteUrl` field is resolved from GitHub's `homepage` field and
//      tagged `websiteSource: "github_homepage"`. Only 76 trending repos
//      are profiled today, so intersection with the 302 stubs is narrow,
//      but it's the canonical cached homepage source when populated.
//   2. Non-stub items in `repo-metadata.json` itself — the scraper's
//      hydration may contain entries that share a fullName with a pipeline
//      stub (unusual, but guarded for).
//   3. `.data/repos.jsonl` — the pipeline `Repo` store. Carries
//      `description` + `topics` (NO `homepageUrl` — the Repo type omits
//      it). Used purely as a fallback for description / topics when the
//      stub's fields are empty.
//
// Reality check: repos.jsonl does NOT actually store homepageUrl (the
// `Repo` shape in src/lib/types.ts has no such field), so the cached-only
// path can enrich description + topics but cannot fill homepageUrl for
// most stubs. For that, pass `--live` to let the script call the same
// resolver the app uses at request time (src/lib/github-repo-homepage.ts).
// This is gated behind an explicit flag so the default run is side-effect
// free.
//
// Behavior
// --------
//   - Only mutates items where `source === "pipeline-jsonl-stub"`.
//   - Adds `homepageUrl` when a cached source has a non-null value AND the
//     stub's `homepageUrl` is still null.
//   - Adds `description` from repos.jsonl when the stub's description is
//     empty (reconciler already seeds this in most cases).
//   - Adds `topics` from repos.jsonl when the stub's topics array is empty
//     (likewise).
//   - Stamps `enrichedAt` (ISO) on every stub the script visited — this
//     lets re-runs be incremental: skip stubs whose enrichedAt is newer
//     than both source files' mtime.
//   - Never touches non-stub entries.
//   - Idempotent: when nothing changed AND every stub is already current,
//     the file is not rewritten.
//
// Run:
//   node scripts/enrich-stub-metadata.mjs              # cached-only
//   node scripts/enrich-stub-metadata.mjs --live       # + live GitHub calls
//   node scripts/enrich-stub-metadata.mjs --live --limit 50  # cap API calls
//
// Env:
//   GITHUB_TOKEN — used for live lookups to raise the rate-limit ceiling.
//   TRENDINGREPO_GITHUB_HOMEPAGE_LOOKUP=false — hard-disables live lookups.
//   STARSCREENER_GITHUB_HOMEPAGE_LOOKUP=false — legacy alias, still honored.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Brand-migration shim: prefer the new TRENDINGREPO_* env name, fall back
// to the legacy STARSCREENER_*. Inlined (no warn) because this is a CI
// script — deprecation chatter belongs in the app's boot path.
const readEnv = (newName, oldName) =>
  process.env[newName] ?? process.env[oldName];
import { fileURLToPath } from "node:url";

// Lazy, side-effect-free env loader. Only touches process.env when --live
// mode needs GITHUB_TOKEN — the cached path stays dep-free.
async function loadEnvForLive() {
  try {
    const mod = await import("@next/env");
    const loader = mod?.default?.loadEnvConfig ?? mod?.loadEnvConfig;
    if (typeof loader === "function") loader(process.cwd());
  } catch {
    // @next/env not available — fine, operator sets GITHUB_TOKEN manually.
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const METADATA_FILE = resolve(ROOT, "data", "repo-metadata.json");
const PROFILES_FILE = resolve(ROOT, "data", "repo-profiles.json");
const JSONL_FILE = resolve(ROOT, ".data", "repos.jsonl");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { live: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--live") {
      out.live = true;
    } else if (token === "--limit") {
      const next = argv[++i];
      const parsed = Number.parseInt(next ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) out.limit = parsed;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadMetadata(path) {
  if (!existsSync(path)) {
    throw new Error(`repo-metadata.json not found at ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`repo-metadata.json is not a JSON object: ${path}`);
  }
  if (!Array.isArray(parsed.items)) parsed.items = [];
  return parsed;
}

function loadProfileWebsites(path) {
  // Returns a Map<lowercase fullName, websiteUrl> of non-null entries.
  const out = new Map();
  if (!existsSync(path)) return out;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return out;
  }
  const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
  for (const p of profiles) {
    if (!p || typeof p.fullName !== "string") continue;
    const site = typeof p.websiteUrl === "string" ? p.websiteUrl.trim() : "";
    if (!site) continue;
    if (!/^https?:\/\//i.test(site)) continue;
    out.set(p.fullName.toLowerCase(), site);
  }
  return out;
}

function loadNonStubHomepages(metadata) {
  // Returns Map<lowercase fullName, homepageUrl> from already-scraped items.
  // Guards the "a fullName was in both sets" edge case.
  const out = new Map();
  for (const item of metadata.items ?? []) {
    if (!item || item.source === "pipeline-jsonl-stub") continue;
    if (typeof item.fullName !== "string") continue;
    const hp = typeof item.homepageUrl === "string" ? item.homepageUrl.trim() : "";
    if (!hp) continue;
    if (!/^https?:\/\//i.test(hp)) continue;
    out.set(item.fullName.toLowerCase(), hp);
  }
  return out;
}

function loadJsonlRecords(path) {
  // Returns Map<lowercase fullName, { description, topics }> for every row.
  const out = new Map();
  if (!existsSync(path)) return out;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!record || typeof record.fullName !== "string") continue;
    const key = record.fullName.toLowerCase();
    const description =
      typeof record.description === "string" ? record.description : "";
    const topics = Array.isArray(record.topics)
      ? record.topics.filter((t) => typeof t === "string" && t.trim().length > 0)
      : [];
    out.set(key, { description, topics });
  }
  return out;
}

function maxSourceMtimeMs(...paths) {
  let max = 0;
  for (const p of paths) {
    try {
      const stat = statSync(p);
      if (stat.mtimeMs > max) max = stat.mtimeMs;
    } catch {
      // Missing source — treat as epoch-0 for mtime purposes.
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Live lookup — uses the same resolver the app uses at request time.
// ---------------------------------------------------------------------------

function cleanHomepage(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (/github\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function liveLookupHomepage(fullName) {
  if (
    readEnv(
      "TRENDINGREPO_GITHUB_HOMEPAGE_LOOKUP",
      "STARSCREENER_GITHUB_HOMEPAGE_LOOKUP",
    ) === "false"
  )
    return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return null;
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers,
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const raw = await response.json();
    return cleanHomepage(raw?.homepage);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single stub in-place using data from the cached sources.
 * Returns flags describing what changed.
 */
function enrichStubFromCache(stub, websites, nonStubHomes, jsonlRecords) {
  const key =
    typeof stub.fullName === "string" ? stub.fullName.toLowerCase() : null;
  const out = { filledHomepage: false, filledTopics: false, filledDescription: false };
  if (!key) return out;

  if (!stub.homepageUrl) {
    const cached = websites.get(key) ?? nonStubHomes.get(key) ?? null;
    if (cached) {
      stub.homepageUrl = cached;
      out.filledHomepage = true;
    }
  }

  const record = jsonlRecords.get(key);
  if (record) {
    if (
      (!Array.isArray(stub.topics) || stub.topics.length === 0) &&
      record.topics.length > 0
    ) {
      stub.topics = record.topics.slice();
      out.filledTopics = true;
    }
    if (
      (typeof stub.description !== "string" || stub.description.trim().length === 0) &&
      record.description.trim().length > 0
    ) {
      stub.description = record.description;
      out.filledDescription = true;
    }
  }

  return out;
}

async function reconcile(metadata, websites, nonStubHomes, jsonlRecords, sourceMtimeMs, opts) {
  const stats = {
    stubCount: 0,
    enrichedCount: 0,
    filledHomepage: 0,
    filledHomepageLive: 0,
    filledTopics: 0,
    filledDescription: 0,
    missingHomepage: 0,
    skippedAlreadyCurrent: 0,
    liveCalls: 0,
  };
  const stampIso = new Date().toISOString();

  // First pass — cached enrichment.
  const needLive = [];
  for (const item of metadata.items) {
    if (!item || item.source !== "pipeline-jsonl-stub") continue;
    stats.stubCount++;

    const prevEnrichedAt =
      typeof item.enrichedAt === "string" ? Date.parse(item.enrichedAt) : NaN;
    if (
      Number.isFinite(prevEnrichedAt) &&
      sourceMtimeMs > 0 &&
      prevEnrichedAt >= sourceMtimeMs &&
      !opts.live
    ) {
      stats.skippedAlreadyCurrent++;
      if (!item.homepageUrl) stats.missingHomepage++;
      continue;
    }

    const delta = enrichStubFromCache(item, websites, nonStubHomes, jsonlRecords);
    if (delta.filledHomepage) stats.filledHomepage++;
    if (delta.filledTopics) stats.filledTopics++;
    if (delta.filledDescription) stats.filledDescription++;
    if (delta.filledHomepage || delta.filledTopics || delta.filledDescription) {
      stats.enrichedCount++;
    }
    item.enrichedAt = stampIso;

    if (!item.homepageUrl) {
      stats.missingHomepage++;
      if (opts.live && stats.liveCalls < opts.limit) {
        needLive.push(item);
      }
    }
  }

  // Second pass — live lookups, capped. Sequential so the GitHub rate
  // limit is respected; operator can cap further via --limit.
  if (opts.live && needLive.length > 0) {
    console.log(
      `[enrich-stub-metadata] live pass: ${Math.min(needLive.length, opts.limit)} stubs queued`,
    );
    for (const item of needLive) {
      if (stats.liveCalls >= opts.limit) break;
      stats.liveCalls++;
      const hp = await liveLookupHomepage(item.fullName);
      if (hp) {
        item.homepageUrl = hp;
        stats.filledHomepage++;
        stats.filledHomepageLive++;
        stats.enrichedCount++;
        stats.missingHomepage--;
      }
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.live) await loadEnvForLive();
  const metadata = loadMetadata(METADATA_FILE);
  const websites = loadProfileWebsites(PROFILES_FILE);
  const nonStubHomes = loadNonStubHomepages(metadata);
  const jsonlRecords = loadJsonlRecords(JSONL_FILE);
  const sourceMtime = maxSourceMtimeMs(PROFILES_FILE, JSONL_FILE);

  console.log(
    `[enrich-stub-metadata] repo-metadata items: ${metadata.items.length}`,
  );
  console.log(
    `[enrich-stub-metadata] profile websites available: ${websites.size}`,
  );
  console.log(
    `[enrich-stub-metadata] non-stub homepages available: ${nonStubHomes.size}`,
  );
  console.log(
    `[enrich-stub-metadata] jsonl records available: ${jsonlRecords.size}`,
  );
  console.log(
    `[enrich-stub-metadata] mode: ${opts.live ? `live (limit ${opts.limit === Infinity ? "∞" : opts.limit})` : "cached-only"}`,
  );

  const stats = await reconcile(
    metadata,
    websites,
    nonStubHomes,
    jsonlRecords,
    sourceMtime,
    opts,
  );

  const nothingChanged = stats.enrichedCount === 0 && !opts.live;
  // Even with no field fills, we want enrichedAt stamps persisted so future
  // runs can short-circuit. Only skip write when literally nothing moved
  // (cache-only rerun where every stub was already current).
  const everyStubCurrent =
    stats.skippedAlreadyCurrent === stats.stubCount && stats.stubCount > 0;

  if (everyStubCurrent && nothingChanged) {
    console.log(
      `[enrich-stub-metadata] no changes — ${stats.stubCount} stubs, all already current ` +
        `(${stats.missingHomepage} still missing homepageUrl)`,
    );
    return;
  }

  const nextRaw = `${JSON.stringify(metadata, null, 2)}\n`;
  writeFileSync(METADATA_FILE, nextRaw);

  const livePart = opts.live ? ` (${stats.filledHomepageLive} via live API, ${stats.liveCalls} calls)` : "";
  console.log(
    `[enrich-stub-metadata] enriched ${stats.enrichedCount} of ${stats.stubCount} stubs ` +
      `(+${stats.filledHomepage} homepageUrl${livePart}, +${stats.filledTopics} topics, ` +
      `+${stats.filledDescription} description; ${stats.missingHomepage} still missing ` +
      `homepageUrl — source repo didn't have one; ${stats.skippedAlreadyCurrent} skipped as current)`,
  );
}

main().catch((err) => {
  console.error("[enrich-stub-metadata] failed:", err);
  process.exit(1);
});
