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
//   not yet wired (no per-repo attribution data flow):
//     producthunt — surfaced via repo.producthunt; not summed here yet
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
  };
}

interface BucketIndex {
  perRepo: Map<string, RepoMentionsPerSource>;
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

function hfIndex(nowMs: number): BucketIndex {
  // HF entries don't expose a stable `linkedRepo` mapping in the bundled
  // file, so we attribute by HF id (`owner/name`) matching the GitHub
  // `owner/name` directly — weak but the only honest signal cold-path can
  // rely on without the cross-domain join. Repos that ship under the same
  // org/name on both surfaces (huggingface/transformers ↔ github
  // huggingface/transformers, ggerganov/llama.cpp ↔ ggerganov/llama-cpp)
  // pick this up; everything else stays at 0.
  const file = getHfTrendingFile();
  const models = file?.models ?? [];
  if (_hfIndex && _hfIndex.token === models) return _hfIndex.index;
  const index = buildBucketIndex(
    models,
    (m) => (m.id ? m.id.toLowerCase() : null),
    (m) => m.lastModified ?? m.createdAt ?? null,
    nowMs,
  );
  _hfIndex = { token: models, index };
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
  const index = buildBucketIndex(
    fanout,
    (r) => r.key,
    (r) => r.ts,
    nowMs,
  );
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

    const npmEntry = npm.perRepo.get(lowerFull);
    if (npmEntry) perSource.npm = npmEntry;

    const hfEntry = hf.perRepo.get(lowerFull);
    if (hfEntry) perSource.huggingface = hfEntry;

    const arxivEntry = arxiv.perRepo.get(lowerFull);
    if (arxivEntry) perSource.arxiv = arxivEntry;

    let total24h = 0;
    let total7d = 0;
    for (const v of Object.values(perSource)) {
      total24h += v.count24h;
      total7d += v.count7d;
    }

    const rollup: RepoMentionsRollup = { total24h, total7d, perSource };
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
}
