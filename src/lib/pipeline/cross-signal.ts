// Six-channel cross-signal fusion.
//
// Combines GitHub momentum classification + Reddit 48h trending velocity +
// HN front-page presence + Bluesky mentions + dev.to tutorials/writeups
// + Twitter/X 24h mention burst into a single score per repo. The premise:
// any one channel can be noise (a github star spike, a viral reddit post,
// a Show HN flash, a trending bsky post, a tutorial pumped by one author,
// a single influencer's tweet). Two channels lit at once = signal. Three
// or more = a real breakout. A 6/6 firing repo is rare and indicates the
// repo broke out across every social surface we track.
//
// Formula:
//   github  = movementStatus ∈ {breakout: 1.0, hot: 0.7, rising: 0.4, *: 0}
//   reddit  = min-max normalized sum of post.trendingScore over last 48h,
//             across the full repo corpus (so the top-velocity repo gets
//             1.0 and quiet repos get a fraction)
//   hn      = HN.everHitFrontPage ? 1.0
//             : HN.count7d >= 3   ? 0.7
//             : HN.count7d >= 1   ? 0.4
//             : 0
//   bluesky = BSKY.count7d >= 5   ? 1.0
//             : BSKY.count7d >= 2 ? 0.7
//             : BSKY.count7d >= 1 ? 0.4
//             : 0
//   devto   = DEVTO.count7d >= 3  ? 1.0
//             : DEVTO.count7d >= 2 ? 0.7
//             : DEVTO.count7d >= 1 ? 0.4
//             : 0
//   twitter = TW.mentionCount24h >= 10 ? 1.0
//             : TW.mentionCount24h >= 3 ? 0.7
//             : TW.mentionCount24h >= 1 ? 0.4
//             : 0
//   crossSignalScore = github + reddit + hn + bluesky + devto + twitter (range 0..6)
//   channelsFiring   = count of components > 0                          (range 0..6)
//
// Why Twitter thresholds are higher than Bluesky's: Twitter publishes
// orders of magnitude more posts on the same keywords, so one tweet
// is comparatively cheaper signal. We require ≥10 mentions in 24h to
// max the channel — comparable to a sustained author-diverse burst —
// versus Bluesky's ≥5 in 7d.
//
// Why dev.to thresholds are tighter than Bluesky's: dev.to publishes
// ~50-200 articles per AI tag per week vs. thousands of bsky posts on
// the same keywords. A single dev.to writeup is therefore worth more
// signal per unit, so we cap "saturation" at 3 mentions instead of 5.
//
// Two-pass: the reddit normalizer needs to see every repo's raw score
// before it can divide by the corpus max, so we compute raw scores in
// pass 1 and emit normalized output in pass 2.
//
// Edge case (cold start): when no repo has any reddit signal, maxReddit
// is 0. Don't divide by zero — emit 0 for every reddit_component instead.

import type { MovementStatus, Repo } from "../types";
import { getRedditMentions } from "../reddit-data";
import { getHnMentions } from "../hackernews";
import { getBlueskyMentions } from "../bluesky";
import { getDevtoMentions } from "../devto";
import { getTwitterSignalSync } from "../twitter/signal-data";

const REDDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function githubComponent(status: MovementStatus | undefined): number {
  if (status === "breakout") return 1.0;
  if (status === "hot") return 0.7;
  if (status === "rising") return 0.4;
  return 0;
}

function redditRawScore(fullName: string, nowMs: number): number {
  const m = getRedditMentions(fullName);
  if (!m) return 0;
  const cutoffSec = (nowMs - REDDIT_WINDOW_MS) / 1000;
  let sum = 0;
  for (const post of m.posts) {
    if (post.createdUtc < cutoffSec) continue;
    sum += post.trendingScore ?? 0;
  }
  return sum;
}

function hnComponent(fullName: string): number {
  const m = getHnMentions(fullName);
  if (!m) return 0;
  if (m.everHitFrontPage) return 1.0;
  if (m.count7d >= 3) return 0.7;
  if (m.count7d >= 1) return 0.4;
  return 0;
}

function blueskyComponent(fullName: string): number {
  const m = getBlueskyMentions(fullName);
  if (!m) return 0;
  if (m.count7d >= 5) return 1.0;
  if (m.count7d >= 2) return 0.7;
  if (m.count7d >= 1) return 0.4;
  return 0;
}

function devtoComponent(fullName: string): number {
  const m = getDevtoMentions(fullName);
  if (!m) return 0;
  if (m.count7d >= 3) return 1.0;
  if (m.count7d >= 2) return 0.7;
  if (m.count7d >= 1) return 0.4;
  return 0;
}

function twitterComponent(fullName: string): number {
  const s = getTwitterSignalSync(fullName);
  if (!s) return 0;
  const c = s.metrics.mentionCount24h ?? 0;
  if (c >= 10) return 1.0;
  if (c >= 3) return 0.7;
  if (c >= 1) return 0.4;
  return 0;
}

/**
 * Attach `crossSignalScore`, `channelsFiring`, and the `bluesky` rollup
 * to every repo.
 *
 * Two-pass internally: first compute raw reddit scores across the corpus
 * to find `maxReddit`, then normalize and fuse. Pure function over Repo[]
 * — safe to call from server-only code paths (consumes the lib/reddit +
 * lib/hackernews + lib/bluesky mentions JSON, which are already in the
 * build artifact).
 *
 * Exported for use by `getDerivedRepos()` and tests.
 */
export function attachCrossSignal(
  repos: Repo[],
  nowMs: number = Date.now(),
): Repo[] {
  const redditRaw = repos.map((r) => redditRawScore(r.fullName, nowMs));
  const maxReddit = Math.max(0, ...redditRaw);

  return repos.map((repo, i) => {
    const redditMention = getRedditMentions(repo.fullName);
    const gh = githubComponent(repo.movementStatus);
    const rd = maxReddit > 0 ? redditRaw[i] / maxReddit : 0;
    const hn = hnComponent(repo.fullName);
    const bs = blueskyComponent(repo.fullName);
    const dv = devtoComponent(repo.fullName);
    const tw = twitterComponent(repo.fullName);
    const score = gh + rd + hn + bs + dv + tw;
    const firing =
      (gh > 0 ? 1 : 0) +
      (rd > 0 ? 1 : 0) +
      (hn > 0 ? 1 : 0) +
      (bs > 0 ? 1 : 0) +
      (dv > 0 ? 1 : 0) +
      (tw > 0 ? 1 : 0);

    const bskyMention = getBlueskyMentions(repo.fullName);
    const bskyRollup = bskyMention
      ? {
          mentions7d: bskyMention.count7d,
          likes7d: bskyMention.likesSum7d,
          reposts7d: bskyMention.repostsSum7d,
          topPost: bskyMention.topPost
            ? {
                uri: bskyMention.topPost.uri,
                bskyUrl: bskyMention.topPost.bskyUrl,
                text: bskyMention.topPost.text,
                likes: bskyMention.topPost.likeCount,
                reposts: bskyMention.topPost.repostCount,
                author: bskyMention.topPost.author,
              }
            : undefined,
        }
      : null;

    const devtoMention = getDevtoMentions(repo.fullName);
    const devtoRollup = devtoMention
      ? {
          mentions7d: devtoMention.count7d,
          reactions7d: devtoMention.reactionsSum7d,
          comments7d: devtoMention.commentsSum7d,
          topArticle: devtoMention.topArticle
            ? {
                id: devtoMention.topArticle.id,
                title: devtoMention.topArticle.title,
                url: devtoMention.topArticle.url,
                author: devtoMention.topArticle.author,
                reactions: devtoMention.topArticle.reactions,
                comments: devtoMention.topArticle.comments,
                readingTime: devtoMention.topArticle.readingTime,
              }
            : undefined,
        }
      : null;

    const redditTopPost = redditMention?.posts
      .slice()
      .sort((a, b) => {
        const scoreDelta = (b.trendingScore ?? 0) - (a.trendingScore ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        return b.score - a.score;
      })[0];
    const redditRollup = redditMention
      ? {
          mentions7d: redditMention.count7d,
          upvotes7d: redditMention.upvotes7d,
          comments7d: redditMention.posts.reduce(
            (sum, post) => sum + Math.max(0, post.numComments ?? 0),
            0,
          ),
          topPost: redditTopPost
            ? {
                id: redditTopPost.id,
                title: redditTopPost.title,
                subreddit: redditTopPost.subreddit,
                permalink: redditTopPost.permalink,
                url: redditTopPost.url,
                score: redditTopPost.score,
                comments: redditTopPost.numComments,
              }
            : undefined,
        }
      : null;

    return {
      ...repo,
      crossSignalScore: Math.round(score * 100) / 100,
      channelsFiring: firing,
      // Precomputed per-channel state so the client-side ChannelDots
      // component never needs to import this module — avoids pulling the
      // per-source mention JSONs into the client bundle (finding #3).
      channelStatus: {
        github: gh > 0,
        reddit: rd > 0,
        hn: hn > 0,
        bluesky: bs > 0,
        devto: dv > 0,
        twitter: tw > 0,
      },
      reddit: redditRollup,
      bluesky: bskyRollup,
      devto: devtoRollup,
    };
  });
}

// ---------------------------------------------------------------------------
// Channel-level helpers (UI consumers — Cross-Signal Breakouts section,
// 4-dot indicator). Kept colocated so the same source of truth defines
// "what does each dot mean" across scoring + display.
// ---------------------------------------------------------------------------

export interface ChannelStatus {
  github: boolean;
  reddit: boolean;
  hn: boolean;
  bluesky: boolean;
  devto: boolean;
  twitter: boolean;
}

/** Minimal shape getChannelStatus needs — accepts a full Repo or any object
 * carrying just `fullName` + `movementStatus`. Lets sidebar/watchlist row
 * surfaces (SidebarWatchlistPreviewRepo etc.) call without constructing a
 * full Repo. */
export type ChannelStatusTarget = Pick<Repo, "fullName"> & {
  movementStatus: MovementStatus | undefined;
};

/**
 * Recompute per-channel boolean state for display. Used by the 5-dot
 * indicator. Mirrors the formula above so the indicator never disagrees
 * with the score (e.g. dots showing 2 lit but score implying 1).
 */
export function getChannelStatus(
  target: ChannelStatusTarget,
  nowMs: number = Date.now(),
): ChannelStatus {
  return {
    github: githubComponent(target.movementStatus) > 0,
    reddit: redditRawScore(target.fullName, nowMs) > 0,
    hn: hnComponent(target.fullName) > 0,
    bluesky: blueskyComponent(target.fullName) > 0,
    devto: devtoComponent(target.fullName) > 0,
    twitter: twitterComponent(target.fullName) > 0,
  };
}

// Re-exported for unit tests that want to verify individual components.
export const __test = {
  githubComponent,
  redditRawScore,
  hnComponent,
  blueskyComponent,
  devtoComponent,
  twitterComponent,
};
