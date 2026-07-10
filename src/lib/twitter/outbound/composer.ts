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

/**
 * Item cap for the daily thread. 1 intro + 10 items + 1 idea = 12
 * posts/day, which stays under the ~17/day free-tier write ceiling
 * even with the Friday recap and one idea auto-post on top.
 */
export const MAX_DAILY_ITEMS = 10;

export interface DailyBreakoutsInput {
  /** Top breakouts of the last 24h. Composer takes up to MAX_DAILY_ITEMS. */
  breakouts: Repo[];
  /** Top idea of the last 7d. Optional — composer skips if missing. */
  topIdea: PublicIdea | null;
  /**
   * Vertical spotlights (Wave 6 distribution) — the funding + models
   * verticals ride the daily thread on alternating days. Both optional;
   * the composer picks ONE per day (even day-of-month → funding, odd →
   * models, falling back to whichever is present) and skips Fridays
   * entirely so the daily+weekly total stays under the ~17-posts/day
   * free-tier write ceiling.
   */
  fundingHighlight?: FundingHighlight | null;
  modelHighlight?: ModelHighlight | null;
}

export interface FundingHighlight {
  companyName: string;
  /** Pre-formatted, e.g. "$95M". */
  amountDisplay: string;
  /** e.g. "series-c" | "seed" | "undisclosed". */
  roundType: string;
}

export interface ModelHighlight {
  name: string;
  provider: string;
  /** USD per million input tokens. */
  inputPricePerMillion: number;
  /** Context window in tokens. */
  contextLength: number;
}

/** Item cap for the weekly recap thread — short and skimmable. */
export const MAX_WEEKLY_ITEMS = 3;

export interface WeeklyRecapInput {
  /** Top breakouts of the week. Composer takes up to MAX_WEEKLY_ITEMS. */
  topBreakouts: Repo[];
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
 *   [intro]   "🔥 Top 10 trending repos 2026-07-09 ..."
 *   [item 1]  "1/ owner/name +Δ stars in 24h (k signals firing) — description"
 *   ...
 *   [item 10] "10/ ..."
 *   [idea]    "💡 Top idea: '...' — @handle"
 *
 * Returns at least the intro post; items + idea slot in only if
 * the input had data. Every repo item carries its canonical
 * trendingrepo.com URL — no repo appears without its link.
 */
export function composeDailyBreakouts(
  input: DailyBreakoutsInput,
  now: Date = new Date(),
): ComposedPost[] {
  const top = input.breakouts.slice(0, MAX_DAILY_ITEMS);
  const dateStr = now.toISOString().slice(0, 10);

  const posts: ComposedPost[] = [];

  // Intro — count of repos, link to /breakouts.
  const introBody =
    top.length > 0
      ? `🔥 Top ${top.length} trending repo${top.length === 1 ? "" : "s"} ${dateStr} — ranked by stars + social signals. Thread ↓`
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

  // Vertical spotlight — see DailyBreakoutsInput docs for the rotation +
  // Friday-skip rationale.
  const vertical = pickVerticalSpotlight(input, now);
  if (vertical) posts.push(vertical);

  return posts;
}

function pickVerticalSpotlight(
  input: DailyBreakoutsInput,
  now: Date,
): ComposedPost | null {
  if (now.getUTCDay() === 5) return null; // Friday — recap day, budget cap
  const funding = input.fundingHighlight ?? null;
  const model = input.modelHighlight ?? null;
  if (!funding && !model) return null;

  const preferFunding = now.getUTCDate() % 2 === 0;
  const pick = preferFunding ? (funding ?? model) : (model ?? funding);

  if (pick === funding && funding) {
    const round =
      funding.roundType && funding.roundType !== "undisclosed"
        ? ` ${funding.roundType.replace(/-/g, " ").toUpperCase()}`
        : "";
    const body = `💰 Funding radar: ${funding.companyName} raised ${funding.amountDisplay}${round}. Full AI funding feed ↓`;
    return {
      kind: "daily_breakouts_vertical_spotlight",
      text: truncate(body, TWEET_MAX - URL_BUDGET),
      url: absoluteUrl("/funding"),
    };
  }
  if (pick === model && model) {
    const ctx =
      model.contextLength >= 1_000_000
        ? `${Math.round(model.contextLength / 1_000_000)}M`
        : `${Math.round(model.contextLength / 1_000)}K`;
    const price =
      model.inputPricePerMillion > 0
        ? `$${model.inputPricePerMillion.toFixed(2)}/M input`
        : "free";
    const body = `🧠 Model value pick: ${model.name} (${model.provider}) — ${ctx} context at ${price}. Full leaderboard ↓`;
    return {
      kind: "daily_breakouts_vertical_spotlight",
      text: truncate(body, TWEET_MAX - URL_BUDGET),
      url: absoluteUrl("/models"),
    };
  }
  return null;
}

function formatBreakoutLine(repo: Repo, position: number): string {
  const delta = repo.starsDelta24h;
  const deltaStr =
    delta >= 1000 ? `+${(delta / 1000).toFixed(1)}K` : `+${delta}`;
  // A multi-signal repo can headline with a flat star delta — skip the
  // "+0 stars" segment rather than advertise no movement.
  const deltaHint = delta > 0 ? ` ${deltaStr} stars in 24h` : "";
  // Channel firing count surfaces "this isn't just one source noise".
  const channels = repo.channelsFiring ?? 0;
  const channelHint = channels >= 2 ? ` (${channels} signals firing)` : "";
  const prefix = `${position}/ ${repo.fullName}${deltaHint}${channelHint}`;
  // One-line description gives the reader a reason to click; it soaks
  // up whatever budget the stats left over.
  const description = repo.description?.trim() ?? "";
  const body = description ? `${prefix} — ${description}` : prefix;
  return truncate(body, TWEET_MAX - URL_BUDGET);
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

  const medals = ["🥇", "🥈", "🥉"];
  input.topBreakouts.slice(0, MAX_WEEKLY_ITEMS).forEach((repo, idx) => {
    const delta = repo.starsDelta7d ?? 0;
    const deltaStr =
      delta >= 1000 ? `+${(delta / 1000).toFixed(1)}K` : `+${delta}`;
    const deltaHint = delta > 0 ? ` (${deltaStr} stars this week)` : "";
    const prefix = `${medals[idx] ?? `${idx + 1}.`} ${repo.fullName}${deltaHint}`;
    const description = repo.description?.trim() ?? "";
    const body = description ? `${prefix} — ${description}` : prefix;
    posts.push({
      kind: "weekly_recap_item",
      text: truncate(body, TWEET_MAX - URL_BUDGET),
      url: absoluteUrl(`/repo/${repo.fullName}`),
    });
  });

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
