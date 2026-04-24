// Outbound thread composers — pure functions that turn live data
// (derived repos, ideas) into ComposedPost arrays ready for an
// adapter. Pure so we can unit-test the formatting math without
// any I/O or env mocking.
//
// Length budgeting: Twitter shortens any URL to 23 chars + 1 space.
// We size text to fit in 280 - 24 = 256 chars when a URL is attached.
// The composer truncates titles before that limit; if a title still
// won't fit it gets a "…" suffix.
//
// Source-of-truth principle: every post links back to the canonical
// trendingrepo.com URL so growth from X funnels into the platform,
// not the other way around.

import type { Repo } from "@/lib/types";
import type { PublicIdea } from "@/lib/ideas";
import { absoluteUrl } from "@/lib/seo";

import type { ComposedPost } from "./types";

const TWEET_MAX = 280;
const URL_BUDGET = 24; // 23 chars Twitter t.co + 1 leading space

export interface DailyBreakoutsInput {
  /** Top breakouts of the last 24h. Composer takes up to 3. */
  breakouts: Repo[];
  /** Top idea of the last 7d. Optional — composer skips if missing. */
  topIdea: PublicIdea | null;
}

export interface WeeklyRecapInput {
  /** Top breakout of the week (highest cross-signal score). */
  topBreakout: Repo | null;
  /** Top idea of the week (highest hot-score). */
  topIdea: PublicIdea | null;
  /** Number of new ideas published this week, for the "ideas posted" line. */
  ideasPublishedThisWeek: number;
  /** Number of repos that fired 2+ channels this week. */
  breakoutsThisWeek: number;
}

// ---------------------------------------------------------------------------
// Length helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a string to `maxChars`, ellipsizing if it loses characters.
 * Uses the single-character ellipsis so every dropped char is replaced
 * with one (not three) — saves room.
 */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return text.slice(0, maxChars - 1).trimEnd() + "…";
}

/**
 * Effective length after Twitter's URL shortening. Used to verify a
 * post fits — bails the composer if not.
 */
export function effectiveLength(post: ComposedPost): number {
  return post.text.length + (post.url ? URL_BUDGET : 0);
}

// ---------------------------------------------------------------------------
// Daily breakouts thread
// ---------------------------------------------------------------------------

/**
 * Daily breakouts thread:
 *   [intro]   "🔥 Trending today across multiple signals: ..."
 *   [item 1]  "1/ owner/name +Δ stars in 24h — momentum"
 *   [item 2]  "2/ ..."
 *   [item 3]  "3/ ..."
 *   [idea]    "💡 Top idea: '...' — @handle"
 *
 * Returns at least the intro post; items + idea slot in only if
 * the input had data.
 */
export function composeDailyBreakouts(
  input: DailyBreakoutsInput,
  now: Date = new Date(),
): ComposedPost[] {
  const top = input.breakouts.slice(0, 3);
  const dateStr = now.toISOString().slice(0, 10);

  const posts: ComposedPost[] = [];

  // Intro — count of signals, link to /breakouts.
  const introBody =
    top.length > 0
      ? `🔥 Trending ${dateStr}: ${top.length} repo${top.length === 1 ? "" : "s"} firing across multiple signals. Thread ↓`
      : `🔥 Trending ${dateStr}: quiet day on the breakouts board. Watch this space.`;
  posts.push({
    kind: "daily_breakouts_intro",
    text: truncate(introBody, TWEET_MAX - URL_BUDGET),
    url: absoluteUrl("/breakouts"),
  });

  // Per-breakout items.
  top.forEach((repo, idx) => {
    posts.push({
      kind: "daily_breakouts_item",
      text: formatBreakoutLine(repo, idx + 1),
      url: absoluteUrl(`/repo/${repo.fullName}`),
    });
  });

  // Top idea spotlight.
  if (input.topIdea) {
    posts.push({
      kind: "daily_breakouts_idea_spotlight",
      text: formatIdeaSpotlight(input.topIdea),
      url: absoluteUrl(`/ideas/${input.topIdea.id}`),
    });
  }

  return posts;
}

function formatBreakoutLine(repo: Repo, position: number): string {
  const delta = repo.starsDelta24h;
  const deltaStr =
    delta >= 1000 ? `+${(delta / 1000).toFixed(1)}K` : `+${delta}`;
  // Channel firing count surfaces "this isn't just one source noise".
  const channels = repo.channelsFiring ?? 0;
  const channelHint = channels >= 2 ? ` (${channels} signals firing)` : "";
  // Compose ON the prefix that wraps to TWEET_MAX-URL_BUDGET.
  const prefix = `${position}/ ${repo.fullName} ${deltaStr} stars in 24h${channelHint}`;
  return truncate(prefix, TWEET_MAX - URL_BUDGET);
}

function formatIdeaSpotlight(idea: PublicIdea): string {
  // We don't include the body — pitch is already the "what" line.
  // Format: 💡 Top idea: "<title>" — @handle
  const handle = idea.authorHandle.replace(/^@+/, "");
  const head = `💡 Top idea: "`;
  const tail = `" — @${handle}`;
  const titleBudget = TWEET_MAX - URL_BUDGET - head.length - tail.length;
  return `${head}${truncate(idea.title, Math.max(8, titleBudget))}${tail}`;
}

// ---------------------------------------------------------------------------
// Weekly recap thread
// ---------------------------------------------------------------------------

/**
 * Friday evening recap. One intro post + a few summary lines. Designed
 * to be short — skimmable even if the reader missed every daily.
 */
export function composeWeeklyRecap(
  input: WeeklyRecapInput,
  now: Date = new Date(),
): ComposedPost[] {
  const week = isoWeekLabel(now);
  const posts: ComposedPost[] = [];

  posts.push({
    kind: "weekly_recap_intro",
    text: truncate(
      `📆 Week ${week} recap — ${input.breakoutsThisWeek} breakout${input.breakoutsThisWeek === 1 ? "" : "s"}, ${input.ideasPublishedThisWeek} new idea${input.ideasPublishedThisWeek === 1 ? "" : "s"}. Thread ↓`,
      TWEET_MAX - URL_BUDGET,
    ),
    url: absoluteUrl("/breakouts"),
  });

  if (input.topBreakout) {
    posts.push({
      kind: "weekly_recap_item",
      text: truncate(
        `🥇 Top breakout: ${input.topBreakout.fullName} (+${input.topBreakout.starsDelta7d} stars this week)`,
        TWEET_MAX - URL_BUDGET,
      ),
      url: absoluteUrl(`/repo/${input.topBreakout.fullName}`),
    });
  }

  if (input.topIdea) {
    posts.push({
      kind: "weekly_recap_item",
      text: formatIdeaSpotlight(input.topIdea),
      url: absoluteUrl(`/ideas/${input.topIdea.id}`),
    });
  }

  return posts;
}

/**
 * "Wnn" label for the current ISO week. Uses ISO 8601 week numbering
 * (Monday-start, week 1 contains the first Thursday of the year).
 */
export function isoWeekLabel(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((+d - +yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Idea-published single post
// ---------------------------------------------------------------------------

/**
 * Auto-post for a newly-published idea. One tweet, no thread. Caller
 * (the cron / hook) is responsible for rate-limiting (1/account/day).
 */
export function composeIdeaPublishedPost(idea: PublicIdea): ComposedPost {
  const handle = idea.authorHandle.replace(/^@+/, "");
  // Pitch lines are 20-280; with URL budget we have ~256 chars total.
  // Build "💡 New idea by @handle: <pitch>" and truncate the pitch.
  const head = `💡 New idea by @${handle}: `;
  const pitchBudget = TWEET_MAX - URL_BUDGET - head.length;
  return {
    kind: "idea_published",
    text: `${head}${truncate(idea.pitch, Math.max(20, pitchBudget))}`,
    url: absoluteUrl(`/ideas/${idea.id}`),
  };
}
