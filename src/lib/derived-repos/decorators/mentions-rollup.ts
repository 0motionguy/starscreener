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
//     npm, huggingface, arxiv, producthunt
//
// The decorator is pure + memoizes the npm/hf/arxiv index by data-version
// so it pays the bucketization cost once per cold-Lambda warm.

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
import { getHfTrendingFile } from "../../huggingface";
import { getArxivRecentFile } from "../../arxiv";
import { getAllPhLaunches } from "../../producthunt";
import { getFundingEventsForRepo } from "../../funding/repo-events";
import { getCrossSourceDetail } from "../../cross-source-mentions";

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
    producthunt: { count24h: 0, count7d: 0 },
    funding:     { count24h: 0, count7d: 0 },
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
let _phIndex: { token: unknown; index: BucketIndex } | null = null;

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

function hfIndex(nowMs: number): BucketIndex {
  // HF entries don't expose a stable `linkedRepo` mapping in the bundled
  // file, so we attribute by HF id (`owner/name`) matching the GitHub
  // `owner/name` directly. That's a low recall signal — HF orgs (deepseek-ai,
  // openai, mistralai) often differ from the GitHub org publishing the
  // canonical SDK. We layer a NAME-only fallback (last path segment) so a
  // GitHub repo `huggingface/transformers` can pick up HF model counts even
  // when the model id is `bert-base-uncased` style. Ambiguous names —
  // those that fan across multiple HF orgs in the bucket — are dropped from
  // the fallback to keep false-positives off.
  const file = getHfTrendingFile();
  const models = file?.models ?? [];
  if (_hfIndex && _hfIndex.token === models) return _hfIndex.index;
  const base = buildBucketIndex(
    models,
    (m) => (m.id ? m.id.toLowerCase() : null),
    (m) => m.lastModified ?? m.createdAt ?? null,
    nowMs,
  );
  const index: BucketIndex = {
    perRepo: base.perRepo,
    byName: buildNameOnlyFallback(base.perRepo),
  };
  _hfIndex = { token: models, index };
  return index;
}

function phIndex(nowMs: number): BucketIndex {
  // ProductHunt launches come tagged with linkedRepo (owner/name) when the
  // scraper resolved a github URL; un-resolved launches still ship in the
  // file but skip here. Bucket by createdAt — a launch is one mention.
  const launches = getAllPhLaunches();
  if (_phIndex && _phIndex.token === launches) return _phIndex.index;
  const index = buildBucketIndex(
    launches,
    (l) => (l.linkedRepo ? l.linkedRepo.toLowerCase() : null),
    (l) => l.createdAt,
    nowMs,
  );
  _phIndex = { token: launches, index };
  return index;
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

export function decorateWithMentionsRollup(repos: Repo[]): Repo[] {
  const nowMs = Date.now();
  const npm = npmIndex(nowMs);
  const hf = hfIndex(nowMs);
  const arxiv = arxivIndex(nowMs);
  const ph = phIndex(nowMs);

  return repos.map((r) => {
    const perSource = emptyPerSource();
    const lowerFull = r.fullName.toLowerCase();

    // Twitter — 24h only (the signal store carries no 7d count). Treat
    // the 24h number as both the 24h and 7d slot so total7d at least
    // covers what we know. If/when the Twitter signal exposes 7d, swap.
    const tw = getTwitterSignalSync(r.fullName);
    if (tw) {
      const x = tw.metrics.mentionCount24h ?? 0;
      perSource.twitter = { count24h: x, count7d: x };
    }

    const rd = getRedditMentions(r.fullName);
    if (rd) {
      perSource.reddit = {
        count24h: rd.count24h ?? 0,
        count7d: rd.count7d ?? 0,
      };
    }

    const hn = getHnMentions(r.fullName);
    if (hn) {
      perSource.hackernews = {
        count24h: hn.count24h ?? 0,
        count7d: hn.count7d ?? 0,
      };
    }

    const bs = getBlueskyMentions(r.fullName);
    if (bs) {
      perSource.bluesky = {
        count24h: bs.count24h ?? 0,
        count7d: bs.count7d ?? 0,
      };
    }

    const dv = getDevtoMentions(r.fullName);
    if (dv) {
      perSource.devto = {
        count24h: dv.count24h ?? 0,
        count7d: dv.count7d ?? 0,
      };
    }

    const lb = getLobstersMentions(r.fullName);
    if (lb) {
      perSource.lobsters = {
        count24h: lb.count24h ?? 0,
        count7d: lb.count7d ?? 0,
      };
    }

    const lowerName = r.name.toLowerCase();

    const npmEntry = npm.perRepo.get(lowerFull);
    if (npmEntry) perSource.npm = npmEntry;

    // HF + arXiv: try full owner/name first, then fall back to repo NAME
    // alone when the (precomputed, ambiguity-free) name index has a hit.
    // This recovers attribution for cases where HF orgs / arXiv link slugs
    // diverge from the GitHub org but the project name matches.
    const hfEntry =
      hf.perRepo.get(lowerFull) ?? hf.byName?.get(lowerName) ?? null;
    if (hfEntry) perSource.huggingface = hfEntry;

    const arxivEntry =
      arxiv.perRepo.get(lowerFull) ?? arxiv.byName?.get(lowerName) ?? null;
    if (arxivEntry) perSource.arxiv = arxivEntry;

    const phEntry = ph.perRepo.get(lowerFull);
    if (phEntry) perSource.producthunt = phEntry;

    // Funding events are joined to repos via the curated alias registry
    // (data/funding-aliases.json). The matcher is memoized internally so
    // calling it once per repo per render is cheap. Each event's
    // publishedAt is bucketed into the 24h / 7d windows.
    const fundingEvents = getFundingEventsForRepo(r.fullName);
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
      perSource.funding = { count24h: f24, count7d: f7 };
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
    const detail = getCrossSourceDetail(r.fullName);
    if (detail?.perSource) {
      for (const [channel, bucket] of Object.entries(detail.perSource)) {
        if (!bucket || channel === "tavily") continue;
        const c = channel as Exclude<typeof channel, "tavily"> & SocialPlatform;
        const sweep7d = bucket.count7d ?? 0;
        if (sweep7d > (perSource[c]?.count7d ?? 0)) {
          perSource[c] = {
            count24h: perSource[c]?.count24h ?? 0,
            count7d: sweep7d,
          };
        }
      }
    }

    let total24h = 0;
    let total7d = 0;
    for (const v of Object.values(perSource)) {
      total24h += v.count24h;
      total7d += v.count7d;
    }

    const rollup: RepoMentionsRollup = detail
      ? { total24h, total7d, perSource, detail }
      : { total24h, total7d, perSource };

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
  _phIndex = null;
}
