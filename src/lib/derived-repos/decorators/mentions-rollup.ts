// Unified mention rollup decorator.
//
// Lifts per-source 24h / 7d mention counts from every loader the project
// already exposes onto `repo.mentions`, plus a sums-everything `total24h` /
// `total7d`. Replaces the Twitter-only path that decorateWithTwitter used
// to take through `repo.mentionCount24h` — that field is still set here
// (= mentions.total24h) for back-compat with scoring + the existing UI.
//
// Source coverage:
//   ready (sync getter, count24h + count7d already enriched at load time):
//     twitter, reddit, hackernews, bluesky, devto, lobsters
//   read-from-data-file (we walk the bundled JSON, attribute by linked-repo
//   field, and bucket by timestamp into 24h / 7d windows):
//     npm, huggingface, arxiv
//
// The decorator is pure + memoizes the npm/hf/arxiv index by data-version
// so it pays the bucketization cost once per cold-Lambda warm.
//
// ---------------------------------------------------------------------------
// LIFETIME (`count`) aggregation — added 2026-05-21 per operator request:
// "Mentions should pile up LIFETIME, not per 24h/7d/30d. Treat the bundled
// scraper data as the source of truth for cumulative counts." UI's
// `sourceCount()` in MentionSourcePips reads `channel.count ??
// max(count24h, count7d)`, so populating `count` per source surfaces
// lifetime numbers without touching the rendering path.
//
// Per-source lifetime formula (no time gate — ALL captured rows count):
//   hackernews:  mentions[full].stories.length        (all-time stories about repo)
//   bluesky:     mentions[full].posts.length          (all-time bsky posts)
//   devto:       mentions[full].articles.length       (all-time dev.to articles)
//   lobsters:    mentions[full].stories.length        (resolver fans linkedRepos out)
//   twitter:     items.find(fullName === key).mentions (already lifetime in actor output)
//   npm:         count of npm packages with linkedRepo === full
//   huggingface: count of HF models whose id === full (+ unambiguous name fallback)
//   arxiv:       count of papers whose linkedRepos[].fullName === full (+ name fallback)
//   funding:     count of funding events resolved to this repo (no time gate)
//   reddit:      0 — reddit-mentions.json is currently empty (OAuth blocker)
//
// count24h / count7d math is preserved verbatim — scoring relies on it.
// ---------------------------------------------------------------------------

import type {
  Repo,
  RepoMentionsRollup,
  RepoMentionsPerSource,
  SocialPlatform,
} from "../../types";
import { getTwitterSignalSync } from "../../twitter";
import { getRedditMentions } from "../../reddit-data";
import { getHnMentions } from "../../hackernews";
import { getBlueskyMentions } from "../../bluesky";
import { getDevtoMentions } from "../../devto";
import { getLobstersMentions } from "../../lobsters";
import { getNpmPackages } from "../../npm";
// HuggingFace stripped 2026-05-24 per operator refocus; HF mention buckets
// always return zero. Import preserved only as a marker for grep.
// (was: import { getHfTrendingFile } from "../../huggingface")
import { getArxivRecentFile } from "../../arxiv";
import { getFundingEventsForRepo } from "../../funding/repo-events";
import { getCrossSourceDetail } from "../../cross-source-mentions";
import { getRepoMentionsLedger } from "../../mentions-ledger";

// ---------------------------------------------------------------------------
// Lifetime aggregation — all-time mention counts from the bundled scraper
// data with NO time gate. See header comment for per-source formulas.
// ---------------------------------------------------------------------------

/**
 * Generic lifetime counter: walks a row iterable and increments a per-key
 * tally for every row whose key is non-null. No timestamp gate (deliberate —
 * lifetime = every row the scraper ever captured for that repo).
 */
function buildLifetimeIndex<T>(
  rows: Iterable<T>,
  getKey: (row: T) => string | null,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/**
 * Memoized lifetime indexes for the linked-repo-fanout sources (npm, HF,
 * arXiv). Each indexed by data identity so the lifetime walk pays its cost
 * once per cold Lambda. HF + arXiv carry an unambiguous NAME-only fallback
 * (same dedup strategy as the 24h/7d BucketIndex) so a GitHub repo whose
 * owner differs from the HF/arXiv slug can still pick up lifetime hits when
 * the trailing name segment is unique.
 */
interface LifetimeIndex {
  byFull: Map<string, number>;
  byName?: Map<string, number>;
}

let _npmLifetime: { token: unknown; index: LifetimeIndex } | null = null;
let _hfLifetime: { token: unknown; index: LifetimeIndex } | null = null;
let _arxivLifetime: { token: unknown; index: LifetimeIndex } | null = null;

function buildLifetimeNameFallback(
  byFull: Map<string, number>,
): Map<string, number> {
  const fullsByName = new Map<string, Set<string>>();
  for (const full of byFull.keys()) {
    const slash = full.lastIndexOf("/");
    const name = slash >= 0 ? full.slice(slash + 1) : full;
    if (!name) continue;
    let set = fullsByName.get(name);
    if (!set) {
      set = new Set();
      fullsByName.set(name, set);
    }
    set.add(full);
  }
  const byName = new Map<string, number>();
  for (const [name, set] of fullsByName) {
    if (set.size !== 1) continue;
    const onlyFull = set.values().next().value as string;
    const v = byFull.get(onlyFull);
    if (v !== undefined) byName.set(name, v);
  }
  return byName;
}

function npmLifetimeIndex(): LifetimeIndex {
  const packages = getNpmPackages();
  if (_npmLifetime && _npmLifetime.token === packages) return _npmLifetime.index;
  const byFull = buildLifetimeIndex(
    packages,
    (p) => (p.linkedRepo ? p.linkedRepo.toLowerCase() : null),
  );
  const index: LifetimeIndex = { byFull };
  _npmLifetime = { token: packages, index };
  return index;
}

function hfLifetimeIndex(): LifetimeIndex {
  // HuggingFace data source stripped 2026-05-24 per operator refocus.
  return { byFull: new Map(), byName: new Map() };
}

function arxivLifetimeIndex(): LifetimeIndex {
  const file = getArxivRecentFile();
  const papers = file?.papers ?? [];
  if (_arxivLifetime && _arxivLifetime.token === papers) return _arxivLifetime.index;
  // Fan out (paper, repo) pairs the same way the bucketed index does so a
  // paper that cites N tracked repos contributes 1 lifetime mention each.
  const fanout: Array<{ key: string }> = [];
  for (const p of papers) {
    if (!Array.isArray(p.linkedRepos)) continue;
    for (const link of p.linkedRepos) {
      if (!link?.fullName) continue;
      fanout.push({ key: link.fullName.toLowerCase() });
    }
  }
  const byFull = buildLifetimeIndex(fanout, (r) => r.key);
  const index: LifetimeIndex = {
    byFull,
    byName: buildLifetimeNameFallback(byFull),
  };
  _arxivLifetime = { token: papers, index };
  return index;
}

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_24H_MS = 24 * HOUR_MS;
const WINDOW_7D_MS = 7 * 24 * HOUR_MS;

function emptyPerSource(): Record<SocialPlatform, RepoMentionsPerSource> {
  return {
    twitter:     { count24h: 0, count7d: 0 },
    reddit:      { count24h: 0, count7d: 0 },
    hackernews:  { count24h: 0, count7d: 0 },
    bluesky:     { count24h: 0, count7d: 0 },
    devto:       { count24h: 0, count7d: 0 },
    lobsters:    { count24h: 0, count7d: 0 },
    npm:         { count24h: 0, count7d: 0 },
    huggingface: { count24h: 0, count7d: 0 },
    arxiv:       { count24h: 0, count7d: 0 },
    github:      { count24h: 0, count7d: 0 },
    funding:     { count24h: 0, count7d: 0 },
    tavily:      { count24h: 0, count7d: 0 },
  };
}

interface BucketIndex {
  perRepo: Map<string, RepoMentionsPerSource>;
  /**
   * Optional secondary index keyed by repo NAME only (last path segment of
   * fullName). Used as fallback when sources can't reliably attribute by
   * full owner/name — HF model orgs frequently don't match GitHub orgs
   * (`microsoft-research/transformers` HF id ≠ `huggingface/transformers`
   * GH repo). The decorator only consults this when the primary lookup
   * misses, so common-case full-match repos still win without ambiguity.
   *
   * `byName` is built unique: any name whose entries fan across multiple
   * full-name keys is dropped, since a name-only hit there would risk
   * false-positive attribution (two repos called "agent" each get the
   * other's mentions).
   */
  byName?: Map<string, RepoMentionsPerSource>;
}

function buildBucketIndex<T>(
  rows: Iterable<T>,
  getKey: (row: T) => string | null,
  getTimestamp: (row: T) => string | null | undefined,
  nowMs: number,
): BucketIndex {
  const perRepo = new Map<string, RepoMentionsPerSource>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    const ts = getTimestamp(row);
    if (!ts) continue;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) continue;
    const age = nowMs - ms;
    if (age < 0 || age > WINDOW_7D_MS) continue;
    let entry = perRepo.get(key);
    if (!entry) {
      entry = { count24h: 0, count7d: 0 };
      perRepo.set(key, entry);
    }
    entry.count7d += 1;
    if (age <= WINDOW_24H_MS) entry.count24h += 1;
  }
  return { perRepo };
}

/**
 * Build a name-only fallback index from a per-fullName index. Drops names
 * whose mentions span multiple distinct fullNames (ambiguous → unsafe to
 * attribute). The returned map is keyed by the lowercase last path segment
 * of the source key (e.g. "transformers" from "huggingface/transformers").
 */
function buildNameOnlyFallback(
  perRepo: Map<string, RepoMentionsPerSource>,
): Map<string, RepoMentionsPerSource> {
  // First pass: count distinct fullNames per name.
  const fullNamesByName = new Map<string, Set<string>>();
  for (const fullKey of perRepo.keys()) {
    const slash = fullKey.lastIndexOf("/");
    const name = slash >= 0 ? fullKey.slice(slash + 1) : fullKey;
    if (!name) continue;
    let set = fullNamesByName.get(name);
    if (!set) {
      set = new Set();
      fullNamesByName.set(name, set);
    }
    set.add(fullKey);
  }
  // Second pass: only emit name → entry when unambiguous (one fullName per name).
  const byName = new Map<string, RepoMentionsPerSource>();
  for (const [name, set] of fullNamesByName) {
    if (set.size !== 1) continue;
    const onlyFull = set.values().next().value as string;
    const entry = perRepo.get(onlyFull);
    if (entry) byName.set(name, entry);
  }
  return byName;
}

// ---------------------------------------------------------------------------
// NPM / HF / arXiv index — built once per cold start (memoized by file
// reference identity). Each index keys per-repo counts by lowercase
// `owner/name` so the per-repo decorator step is O(1) per repo.
// ---------------------------------------------------------------------------

let _npmIndex: { token: unknown; index: BucketIndex } | null = null;
let _hfIndex: { token: unknown; index: BucketIndex } | null = null;
let _arxivIndex: { token: unknown; index: BucketIndex } | null = null;

function npmIndex(nowMs: number): BucketIndex {
  const packages = getNpmPackages();
  if (_npmIndex && _npmIndex.token === packages) return _npmIndex.index;
  const index = buildBucketIndex(
    packages,
    (p) => (p.linkedRepo ? p.linkedRepo.toLowerCase() : null),
    (p) => p.publishedAt,
    nowMs,
  );
  _npmIndex = { token: packages, index };
  return index;
}

function hfIndex(_nowMs: number): BucketIndex {
  // HuggingFace data source stripped 2026-05-24 per operator refocus. Stub
  // returns an empty bucket so consumers downstream still resolve to
  // count24h=0 / count7d=0 / count=0 without a TypeError.
  return { perRepo: new Map(), byName: new Map() };
}

function arxivIndex(nowMs: number): BucketIndex {
  const file = getArxivRecentFile();
  const papers = file?.papers ?? [];
  if (_arxivIndex && _arxivIndex.token === papers) return _arxivIndex.index;
  // Each paper can cite multiple repos (paper.linkedRepos[]). Fan out one
  // bucket-row per (paper, repo) pair so a paper that cites N tracked
  // repos contributes 1 mention to each.
  const fanout: Array<{ key: string; ts: string }> = [];
  for (const p of papers) {
    if (!p.publishedAt) continue;
    if (!Array.isArray(p.linkedRepos)) continue;
    for (const link of p.linkedRepos) {
      if (!link?.fullName) continue;
      fanout.push({ key: link.fullName.toLowerCase(), ts: p.publishedAt });
    }
  }
  const base = buildBucketIndex(
    fanout,
    (r) => r.key,
    (r) => r.ts,
    nowMs,
  );
  // Name-only fallback for arXiv too — papers that cite "transformers" but
  // attribute it to the wrong owner/name slug should still credit
  // `huggingface/transformers` when the name is unambiguous. Same dedup
  // strategy as hfIndex.
  const index: BucketIndex = {
    perRepo: base.perRepo,
    byName: buildNameOnlyFallback(base.perRepo),
  };
  _arxivIndex = { token: papers, index };
  return index;
}

// ---------------------------------------------------------------------------
// Decorator
// ---------------------------------------------------------------------------

export function decorateWithMentionsRollup(
  repos: Repo[],
  getKey: (r: Repo) => string = (r) => r.fullName,
): Repo[] {
  const nowMs = Date.now();
  const npm = npmIndex(nowMs);
  const hf = hfIndex(nowMs);
  const arxiv = arxivIndex(nowMs);
  const npmLife = npmLifetimeIndex();
  const hfLife = hfLifetimeIndex();
  const arxivLife = arxivLifetimeIndex();

  return repos.map((r) => {
    const perSource = emptyPerSource();
    const key = getKey(r);
    const lowerFull = key.toLowerCase();

    // Twitter — 24h only (the signal store carries no 7d count). Treat
    // the 24h number as both the 24h and 7d slot so total7d at least
    // covers what we know. If/when the Twitter signal exposes 7d, swap.
    // Lifetime: the Apify actor's `mentions` field IS the all-time
    // cumulative tally — populate `count` from the same number.
    const tw = getTwitterSignalSync(key);
    if (tw) {
      const x = tw.metrics.mentionCount24h ?? 0;
      perSource.twitter = { count24h: x, count7d: x, count: x };
    }

    const rd = getRedditMentions(key);
    if (rd) {
      // Reddit lifetime stays 0 — reddit-mentions.json `mentions: {}` is
      // empty pending OAuth fix. Wiring it would lie about coverage.
      perSource.reddit = {
        count24h: rd.count24h ?? 0,
        count7d: rd.count7d ?? 0,
      };
    }

    const hn = getHnMentions(key);
    if (hn) {
      perSource.hackernews = {
        count24h: hn.count24h ?? 0,
        count7d: hn.count7d ?? 0,
        count: hn.stories?.length ?? 0,
      };
    }

    const bs = getBlueskyMentions(key);
    if (bs) {
      perSource.bluesky = {
        count24h: bs.count24h ?? 0,
        count7d: bs.count7d ?? 0,
        count: bs.posts?.length ?? 0,
      };
    }

    const dv = getDevtoMentions(key);
    if (dv) {
      perSource.devto = {
        count24h: dv.count24h ?? 0,
        count7d: dv.count7d ?? 0,
        count: dv.articles?.length ?? 0,
      };
    }

    const lb = getLobstersMentions(key);
    if (lb) {
      perSource.lobsters = {
        count24h: lb.count24h ?? 0,
        count7d: lb.count7d ?? 0,
        count: lb.stories?.length ?? 0,
      };
    }

    // Name fallback derived from the resolved key so non-repo entities
    // (e.g. HF model ids) participate in the byName index too.
    const slash = lowerFull.lastIndexOf("/");
    const lowerName = slash >= 0 ? lowerFull.slice(slash + 1) : lowerFull;

    const npmEntry = npm.perRepo.get(lowerFull);
    const npmLifeCount = npmLife.byFull.get(lowerFull);
    if (npmEntry || npmLifeCount) {
      perSource.npm = {
        count24h: npmEntry?.count24h ?? 0,
        count7d: npmEntry?.count7d ?? 0,
        count: npmLifeCount ?? 0,
      };
    }

    // HF + arXiv: try full owner/name first, then fall back to repo NAME
    // alone when the (precomputed, ambiguity-free) name index has a hit.
    // This recovers attribution for cases where HF orgs / arXiv link slugs
    // diverge from the GitHub org but the project name matches.
    const hfEntry =
      hf.perRepo.get(lowerFull) ?? hf.byName?.get(lowerName) ?? null;
    const hfLifeCount =
      hfLife.byFull.get(lowerFull) ?? hfLife.byName?.get(lowerName);
    if (hfEntry || hfLifeCount) {
      perSource.huggingface = {
        count24h: hfEntry?.count24h ?? 0,
        count7d: hfEntry?.count7d ?? 0,
        count: hfLifeCount ?? 0,
      };
    }

    const arxivEntry =
      arxiv.perRepo.get(lowerFull) ?? arxiv.byName?.get(lowerName) ?? null;
    const arxivLifeCount =
      arxivLife.byFull.get(lowerFull) ?? arxivLife.byName?.get(lowerName);
    if (arxivEntry || arxivLifeCount) {
      perSource.arxiv = {
        count24h: arxivEntry?.count24h ?? 0,
        count7d: arxivEntry?.count7d ?? 0,
        count: arxivLifeCount ?? 0,
      };
    }

    // Funding events are joined to repos via the curated alias registry
    // (data/funding-aliases.json). The matcher is memoized internally so
    // calling it once per repo per render is cheap. Each event's
    // publishedAt is bucketed into the 24h / 7d windows; lifetime count
    // is the total number of matched events with no time gate.
    const fundingEvents = getFundingEventsForRepo(key);
    if (fundingEvents.length > 0) {
      let f24 = 0;
      let f7 = 0;
      for (const ev of fundingEvents) {
        const ms = Date.parse(ev.signal.publishedAt);
        if (!Number.isFinite(ms)) continue;
        const age = nowMs - ms;
        if (age < 0 || age > WINDOW_7D_MS) continue;
        f7 += 1;
        if (age <= WINDOW_24H_MS) f24 += 1;
      }
      perSource.funding = {
        count24h: f24,
        count7d: f7,
        count: fundingEvents.length,
      };
    }

    // Attach cross-source-sweep detail if available, AND boost the per-source
    // 7d counts using sweep data when it's higher. The sweep is repo-first
    // (per-channel query for THIS repo) where the source-first loaders are
    // source-first (scan the channel feed, attribute to whatever appears) —
    // they catch different things and the sweep typically finds 5-10x more.
    // Taking max() per channel lets the UI (CompletenessStrip, LiveTopTable
    // chips, /githubrepo channel pills) reflect the broader coverage without
    // changing any consumer code. count24h is left untouched because the
    // sweep records 7d events only.
    const detail = getCrossSourceDetail(key);
    if (detail?.perSource) {
      for (const [channel, bucket] of Object.entries(detail.perSource)) {
        if (!bucket) continue;
        const c = channel as SocialPlatform;
        const cur = perSource[c] ?? { count24h: 0, count7d: 0 };
        const sweep7d = bucket.count7d ?? 0;
        // countLifetime is the sweep's monotonic never-drops tally; it carries
        // lifetime for twitter/tavily that the ledger doesn't track.
        const sweepLife = bucket.countLifetime ?? sweep7d;
        perSource[c] = {
          count24h: cur.count24h,
          count7d: Math.max(cur.count7d, sweep7d),
          count: Math.max(cur.count ?? 0, sweepLife),
        };
      }
    }

    // Mentions ledger — authoritative LIFETIME counts for the 5 SADD-deduped
    // source channels (hackernews/reddit/bluesky/devto/lobsters). These never
    // drop (unlike the 7d-windowed bundled `.length`), so they win the lifetime
    // `count`. count24h/count7d are left untouched (scoring depends on them).
    const ledger = getRepoMentionsLedger(key);
    if (ledger?.perSource) {
      for (const [src, n] of Object.entries(ledger.perSource)) {
        const c = src as SocialPlatform;
        const cur = perSource[c] ?? { count24h: 0, count7d: 0 };
        perSource[c] = { ...cur, count: Math.max(cur.count ?? 0, n ?? 0) };
      }
    }

    let total24h = 0;
    let total7d = 0;
    let total = 0;
    for (const v of Object.values(perSource)) {
      total24h += v.count24h;
      total7d += v.count7d;
      total += v.count ?? 0;
    }

    const rollup: RepoMentionsRollup = detail
      ? { total24h, total7d, total, perSource, detail }
      : { total24h, total7d, total, perSource };

    return {
      ...r,
      mentions: rollup,
      mentionCount24h: total24h,
    };
  });
}

// Test-only memo reset.
export function __resetMentionsRollupMemoForTests(): void {
  _npmIndex = null;
  _hfIndex = null;
  _arxivIndex = null;
  _npmLifetime = null;
  _hfLifetime = null;
  _arxivLifetime = null;
}
