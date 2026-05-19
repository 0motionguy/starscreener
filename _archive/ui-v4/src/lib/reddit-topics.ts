// Topic extraction for the /reddit/trending mindshare map.
//
// Hand-rolled n-gram frequency weighting over post titles. No TF-IDF, no
// deps. Stopword list covers standard English (~60) + domain-noise words
// that appear in every AI sub ("ai", "chatgpt", "claude", "question",
// "help") so the extracted phrases are distinctive.
//
// Pipeline:
//   1. Tokenize title (lowercase, strip non-alphanum except hyphens)
//   2. Filter stopwords + domain-noise
//   3. Generate 1-gram, 2-gram, 3-gram per title
//   4. Aggregate across posts — sum upvotes + trendingScore per phrase
//   5. Drop phrases below min-count
//   6. Longer-n-gram preference: subtract a longer-phrase's contribution
//      from its constituent shorter phrases so "claude code" and "claude"
//      don't both scream — specific wins
//   7. Return top N by trendingScoreSum

import type { BaselineTier } from "./reddit-baselines";
import type { RedditAllPost } from "./reddit-all";

export interface Topic {
  phrase: string;
  postIds: string[];
  upvotesSum: number;
  trendingScoreSum: number;
  count: number;
  topPostId: string;
  /** Tier of the top-scoring post in the topic — drives bubble color. */
  tier: BaselineTier;
  /** Most-represented subreddit in the topic cluster. */
  dominantSub: string;
}

export interface ExtractTopicsOptions {
  /** Minimum distinct posts containing phrase to qualify. Default 3. */
  minCount?: number;
  /** Max topics to return after ranking. Default 60. */
  maxTopics?: number;
  /** Additional stopwords on top of the built-in list. */
  extraStopwords?: Iterable<string>;
}

// ---------------------------------------------------------------------------
// Stopwords
// ---------------------------------------------------------------------------

const ENGLISH_STOPWORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of",
  "to", "in", "on", "at", "by", "with", "as", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "should", "can", "could", "may", "might", "must", "shall",
  "i", "you", "he", "she", "it", "we", "they", "them", "us", "my", "your",
  "his", "her", "its", "our", "their", "this", "that", "these", "those",
  "what", "which", "who", "whom", "when", "where", "why", "how",
  "just", "so", "very", "too", "about", "into", "over", "under", "out",
  "up", "down", "off", "not", "no", "yes", "all", "any", "some", "one",
  "two", "three", "first", "last", "new", "old", "good", "bad", "best",
  "get", "got", "make", "made", "use", "used", "using", "go", "going",
  "am", "me", "lets", "let",
]);

// Words that appear in every AI-adjacent post and would dominate every
// bubble — distinctiveness demands we drop them.
const DOMAIN_NOISE = new Set<string>([
  "ai", "gpt", "llm", "llms", "model", "models", "chatgpt",
  "help", "question", "post", "thread", "share",
  "need", "want", "looking", "please", "pls", "thanks",
  "anyone", "someone", "anybody", "somebody",
  "like", "think", "thinks", "thought", "know", "knows",
  "build", "built", "building", "make", "making",
  "day", "week", "month", "today", "now", "soon",
  "work", "works", "working", "worked",
  "thing", "things", "stuff", "way", "ways", "time", "times",
]);

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

function tokenize(title: string, stopwords: Set<string>): string[] {
  // Keep alphanumerics and hyphens; everything else is a separator.
  const raw = title.toLowerCase().replace(/[^a-z0-9\- ]+/g, " ");
  const words = raw.split(/\s+/).filter(Boolean);
  return words.filter(
    (w) => w.length >= 2 && !stopwords.has(w) && !/^\d+$/.test(w),
  );
}

function ngrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i += 1) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface Accum {
  phrase: string;
  length: number; // n-gram length (1, 2, 3)
  postIds: Set<string>;
  upvotesSum: number;
  trendingScoreSum: number;
  topPostId: string;
  topPostScore: number;
  topPostTier: BaselineTier;
  subCounts: Map<string, number>;
}

function tierOf(post: RedditAllPost): BaselineTier {
  return post.baselineTier ?? "no-baseline";
}

function accumulate(
  posts: RedditAllPost[],
  stopwords: Set<string>,
): Map<string, Accum> {
  const accum = new Map<string, Accum>();

  for (const p of posts) {
    const tokens = tokenize(p.title ?? "", stopwords);
    if (tokens.length === 0) continue;
    // Unique phrases per post (across 1/2/3-grams) — a phrase appearing
    // twice in one title shouldn't double-count.
    const seen = new Set<string>();
    for (const n of [3, 2, 1]) {
      for (const phrase of ngrams(tokens, n)) {
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        const row = accum.get(phrase) ?? {
          phrase,
          length: n,
          postIds: new Set<string>(),
          upvotesSum: 0,
          trendingScoreSum: 0,
          topPostId: p.id,
          topPostScore: -Infinity,
          topPostTier: "no-baseline",
          subCounts: new Map<string, number>(),
        };
        row.postIds.add(p.id);
        row.upvotesSum += p.score ?? 0;
        row.trendingScoreSum += p.trendingScore ?? 0;
        if ((p.score ?? 0) > row.topPostScore) {
          row.topPostScore = p.score ?? 0;
          row.topPostId = p.id;
          row.topPostTier = tierOf(p);
        }
        const sub = p.subreddit || "";
        row.subCounts.set(sub, (row.subCounts.get(sub) ?? 0) + 1);
        accum.set(phrase, row);
      }
    }
  }

  return accum;
}

// ---------------------------------------------------------------------------
// Longer-n-gram dedup
// ---------------------------------------------------------------------------

/**
 * For every kept longer phrase X (n ≥ 2), subtract X's post-set from every
 * shorter phrase Y that is a substring of X. This prevents "claude" from
 * dominating when "claude code" is already a cell.
 *
 * Concretely: we loop phrases by length desc; each phrase claims its posts,
 * and shorter sub-phrases lose those posts from their accum stats.
 */
function dedupeByLength(
  accum: Map<string, Accum>,
  minCount: number,
): Accum[] {
  // Materialize + sort by length desc, breaking ties by trendingScoreSum desc.
  const rows = Array.from(accum.values()).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b.trendingScoreSum - a.trendingScoreSum;
  });

  const claimedByLonger = new Map<string, Set<string>>(); // phrase → postIds claimed
  const kept: Accum[] = [];

  for (const row of rows) {
    // Effective post set = row.postIds minus what longer phrases already claimed
    const claimed = claimedByLonger.get(row.phrase) ?? new Set<string>();
    const effective = new Set<string>();
    for (const id of row.postIds) if (!claimed.has(id)) effective.add(id);
    if (effective.size < minCount) continue;

    // Recompute row stats from the effective post set. We do this by iterating
    // posts — but we don't have direct post lookup here. Instead we scale
    // proportionally: if 30% of original postIds remain, keep 30% of sums.
    // This is an approximation but for ranking purposes it's sufficient —
    // exact recomputation would require threading the posts array through.
    const scale = effective.size / row.postIds.size;
    kept.push({
      ...row,
      postIds: effective,
      upvotesSum: row.upvotesSum * scale,
      trendingScoreSum: row.trendingScoreSum * scale,
    });

    // Mark these posts as claimed for all sub-phrases of this one.
    if (row.length >= 2) {
      const tokens = row.phrase.split(" ");
      const subPhrases: string[] = [];
      for (let n = row.length - 1; n >= 1; n -= 1) {
        for (let i = 0; i <= tokens.length - n; i += 1) {
          subPhrases.push(tokens.slice(i, i + n).join(" "));
        }
      }
      for (const sub of subPhrases) {
        const set = claimedByLonger.get(sub) ?? new Set<string>();
        for (const id of effective) set.add(id);
        claimedByLonger.set(sub, set);
      }
    }
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractTopics(
  posts: RedditAllPost[],
  opts: ExtractTopicsOptions = {},
): Topic[] {
  const minCount = opts.minCount ?? 3;
  const maxTopics = opts.maxTopics ?? 60;

  const stopwords = new Set<string>(ENGLISH_STOPWORDS);
  for (const w of DOMAIN_NOISE) stopwords.add(w);
  if (opts.extraStopwords) {
    for (const w of opts.extraStopwords) stopwords.add(w);
  }

  const accum = accumulate(posts, stopwords);
  const deduped = dedupeByLength(accum, minCount);

  deduped.sort((a, b) => b.trendingScoreSum - a.trendingScoreSum);

  const top = deduped.slice(0, maxTopics);

  return top.map((row) => {
    let dominantSub = "";
    let dominantCount = 0;
    for (const [sub, count] of row.subCounts) {
      if (count > dominantCount) {
        dominantCount = count;
        dominantSub = sub;
      }
    }
    return {
      phrase: row.phrase,
      postIds: Array.from(row.postIds),
      upvotesSum: Math.round(row.upvotesSum),
      trendingScoreSum: Math.round(row.trendingScoreSum * 100) / 100,
      count: row.postIds.size,
      topPostId: row.topPostId,
      tier: row.topPostTier,
      dominantSub,
    };
  });
}
