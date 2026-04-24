// Shared TrustMRR helpers for scripts.
//
// Covers:
//  - paginated catalog fetch (paced to stay well under 20 req/min)
//  - URL normalization for website ↔ repo.homepage matching
//  - match pass that produces RevenueOverlay rows from the cached catalog +
//    current trending feed
//
// Kept as plain .mjs (no TypeScript) so it drops straight into the existing
// scripts/* pipeline alongside _fetch-json.mjs.

import { fetchJsonWithRetry, sleep } from "./_fetch-json.mjs";

export const TRUSTMRR_BASE_URL = "https://trustmrr.com/api/v1";
export const TRUSTMRR_PAGE_SIZE = 50; // docs say max 50
export const TRUSTMRR_PAGE_INTERVAL_MS = 3_500; // 20 req/min = one every 3s; headroom
export const TRUSTMRR_MAX_PAGES = 200; // safety cap (≤10,000 startups)

function authHeaders(apiKey) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    // Generic UA — no product-specific identifier. Identification happens
    // via the bearer token; a descriptive UA here would tie public site
    // traffic to this sync in server-side access logs for no benefit.
    "User-Agent": "Mozilla/5.0 (compatible)",
  };
}

/**
 * Paginate the TrustMRR /startups catalog. Returns all startups across pages.
 * Stops when the API reports hasMore: false, hits the safety cap, or throws
 * on a non-retryable HTTP error. Uses the shared fetchJsonWithRetry for 429
 * and 5xx backoff.
 */
export async function fetchAllStartups({
  apiKey,
  baseUrl = TRUSTMRR_BASE_URL,
  pageSize = TRUSTMRR_PAGE_SIZE,
  intervalMs = TRUSTMRR_PAGE_INTERVAL_MS,
  maxPages = TRUSTMRR_MAX_PAGES,
  onPage,
} = {}) {
  if (!apiKey) {
    throw new Error("fetchAllStartups: apiKey is required");
  }
  const headers = authHeaders(apiKey);
  const collected = [];
  let page = 1;
  let total = null;

  while (page <= maxPages) {
    const url = `${baseUrl}/startups?page=${page}&limit=${pageSize}&sort=revenue-desc`;
    // fetchJsonWithRetry handles 408/429/5xx with Retry-After.
    const body = await fetchJsonWithRetry(url, {
      headers,
      attempts: 4,
      retryDelayMs: 2_000,
      timeoutMs: 20_000,
    });
    const rows = Array.isArray(body?.data) ? body.data : [];
    total = body?.meta?.total ?? total ?? null;
    collected.push(...rows);
    if (typeof onPage === "function") {
      onPage({ page, pageSize, received: rows.length, total });
    }
    const hasMore = Boolean(body?.meta?.hasMore) && rows.length > 0;
    if (!hasMore) break;
    page += 1;
    // Pace to stay well under the 20 req/min per-key ceiling.
    await sleep(intervalMs);
  }

  return { startups: collected, total: total ?? collected.length, pages: page };
}

/**
 * Hosts where the path is load-bearing — i.e., the hostname alone is shared
 * across thousands of unrelated products (social profiles, link shorteners,
 * notebook hosts, app-store pages, etc.). For these, a host-only match would
 * produce garbage: e.g. `t.me/ProjectA` matching `t.me/ProjectB`, or
 * `huggingface.co/spaces/UserA/X` matching `huggingface.co/spaces/UserB/Y`.
 * We require an exact-normalized match on these hosts and skip the host-only
 * fallback entirely.
 */
export const PATH_SENSITIVE_HOSTS = new Set([
  // social
  "x.com",
  "twitter.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
  "threads.net",
  "mastodon.social",
  "bsky.app",
  // code / source
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "sourceforge.net",
  // ML / notebooks
  "huggingface.co",
  "kaggle.com",
  "colab.research.google.com",
  // messaging / community
  "t.me",
  "telegram.me",
  "discord.com",
  "discord.gg",
  "whatsapp.com",
  // publishing
  "medium.com",
  "substack.com",
  "dev.to",
  "hashnode.com",
  "notion.so",
  "notion.site",
  // app stores + extension stores
  "apps.apple.com",
  "itunes.apple.com",
  "play.google.com",
  "chromewebstore.google.com",
  "microsoftedge.microsoft.com",
  // link shorteners / multi-link pages
  "linktr.ee",
  "bit.ly",
  "tinyurl.com",
  "beacons.ai",
  "bio.link",
]);

/**
 * Normalize a URL for match comparison. Lowercased origin+path, no protocol,
 * no "www.", no trailing slash, UTM params stripped. Returns null for
 * unparsable input.
 */
export function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${path}`;
}

/**
 * Host-only projection of a normalized URL (for the second match pass).
 * Returns null for path-sensitive hosts so the caller skips the loose pass
 * and falls back to exact-match only.
 */
export function normalizeHost(raw) {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  const slash = normalized.indexOf("/");
  const host = slash === -1 ? normalized : normalized.slice(0, slash);
  if (PATH_SENSITIVE_HOSTS.has(host)) return null;
  return host;
}

/**
 * Build overlay rows. Two-pass exact-then-host matching, with manual overrides
 * applied last (they always win). Returns an overlay keyed by fullName.
 *
 * @param {Array} startups         TrustMRR startup records
 * @param {Array} repos            Trending repos (need fullName + homepage)
 * @param {Object} manualMatches   { [fullName]: trustmrrSlug }
 * @param {string} generatedAt     ISO timestamp for the overlay
 */
export function buildOverlays({
  startups,
  repos,
  manualMatches = {},
  generatedAt,
}) {
  const byExact = new Map();
  const byHost = new Map();
  const bySlug = new Map();

  for (const s of startups) {
    if (!s || typeof s.slug !== "string") continue;
    bySlug.set(s.slug, s);
    // Skip zero-MRR startups from the automatic match indexes — a verified-
    // revenue card displaying "$0 MRR" is worse than no card. Manual overrides
    // via data/revenue-manual-matches.json can still surface them if needed.
    const mrr = s?.revenue?.mrr;
    if (typeof mrr !== "number" || mrr <= 0) continue;
    const exact = normalizeUrl(s.website);
    const host = normalizeHost(s.website);
    if (exact && !byExact.has(exact)) byExact.set(exact, s);
    if (host && !byHost.has(host)) byHost.set(host, s);
  }

  const overlays = {};
  const seenSlugs = new Set();

  // Pass 1 + 2: website-based matches.
  for (const repo of repos) {
    if (!repo || typeof repo.fullName !== "string") continue;
    const homepage = repo.homepage ?? repo.websiteUrl ?? null;
    if (!homepage) continue;
    const exact = normalizeUrl(homepage);
    const host = normalizeHost(homepage);
    let match = null;
    let confidence = null;
    if (exact && byExact.has(exact)) {
      match = byExact.get(exact);
      confidence = "exact";
    } else if (host && byHost.has(host)) {
      match = byHost.get(host);
      confidence = "host";
    }
    if (match && !seenSlugs.has(match.slug)) {
      overlays[repo.fullName] = toOverlay(repo.fullName, match, confidence, generatedAt);
      seenSlugs.add(match.slug);
    }
  }

  // Pass 3: manual overrides always win.
  for (const [fullName, slug] of Object.entries(manualMatches)) {
    if (!slug) continue;
    const match = bySlug.get(slug);
    if (!match) continue;
    overlays[fullName] = toOverlay(fullName, match, "manual", generatedAt);
  }

  return overlays;
}

// Convert TrustMRR dollars-with-decimals to integer cents. Their API returns
// monetary fields as dollar amounts (e.g. `revenue.mrr: 97045.17` = $97,045.17),
// despite some early documentation calling them cents. Verified against known
// live rows (Stan ~$3.5M/mo, TrimRx ~$335K/mo) after the 2026-04-24 sync.
function dollarsToCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function toOverlay(fullName, s, matchConfidence, generatedAt) {
  return {
    tier: "verified_trustmrr",
    fullName,
    trustmrrSlug: s.slug,
    mrrCents: dollarsToCents(s.revenue?.mrr),
    last30DaysCents: dollarsToCents(s.revenue?.last30Days),
    totalCents: dollarsToCents(s.revenue?.total),
    // growthMRR30d arrives as a percent directly — range seen on live data
    // spans -100 (revenue dropped to zero) to ~17k (brand-new launches).
    // Pass through unchanged; display rounds to 1 decimal.
    growthMrr30d:
      typeof s.growthMRR30d === "number" && Number.isFinite(s.growthMRR30d)
        ? s.growthMRR30d
        : null,
    customers: typeof s.customers === "number" ? s.customers : null,
    activeSubscriptions:
      typeof s.activeSubscriptions === "number" ? s.activeSubscriptions : null,
    paymentProvider: s.paymentProvider ?? null,
    category: s.category ?? null,
    asOf: generatedAt,
    matchConfidence,
    // Canonical public URL for a TrustMRR startup is /startup/<slug>. The
    // /s/<slug> short-alias was used historically but is not the shape the
    // catalog emits, so we standardize on /startup/ everywhere. If this
    // module and src/lib/trustmrr-url.ts diverge, update both.
    sourceUrl: `https://trustmrr.com/startup/${s.slug}`,
  };
}

// ---------------------------------------------------------------------------
// Workflow mode selector
// ---------------------------------------------------------------------------
//
// Exported as a pure function so .github/workflows/sync-trustmrr.yml and its
// test can share the same decision. The workflow currently inlines the case
// statement — if that ever drifts, the test against this helper catches it.
//
// Contract, to keep the comments in the YAML honest:
//   - workflow_dispatch: honor the input ("full" or "incremental"); default
//     falls back to "incremental" if the input is missing/unknown.
//   - schedule @ 02: full catalog sweep (≈130 API req).
//   - schedule any other hour: incremental (zero external API req).
//
// If you change this, update the block comment on the `on.schedule` keys
// and the "Decide mode" step in sync-trustmrr.yml together.

export function selectTrustmrrSyncMode({
  eventName,
  hourUtc,
  dispatchInput,
} = {}) {
  if (eventName === "workflow_dispatch") {
    if (dispatchInput === "full" || dispatchInput === "incremental") {
      return dispatchInput;
    }
    return "incremental";
  }
  // schedule, cron_parent_workflow, etc — hour-driven.
  return hourUtc === 2 ? "full" : "incremental";
}
