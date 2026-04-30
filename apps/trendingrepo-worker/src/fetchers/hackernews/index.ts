// HackerNews fetcher (Firebase top + Algolia search).
//
// Cron: 10 * * * * (no dedicated workflow; matches the existing stub schedule
// and stays well under HN's 5K/hr budget).
//
// Outputs:
//   - ss:data:v1:hackernews-trending       (velocity-scored stories last 72h)
//   - ss:data:v1:hackernews-repo-mentions  (repo-linked stories last 7d)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import {
  fetchTopStoryIds,
  fetchItemsBatched,
  searchAlgoliaStories,
  type HnFirebaseItem,
  type HnAlgoliaHit,
} from '../../lib/sources/hackernews.js';
import { classifyPost } from '../../lib/util/classify-post.js';
import { extractAllRepoMentions } from '../../lib/util/github-repo-links.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';

const TRENDING_WINDOW_HOURS = 72;
const MENTIONS_WINDOW_DAYS = 7;
const TRENDING_WINDOW_SECONDS = TRENDING_WINDOW_HOURS * 60 * 60;
const MENTIONS_WINDOW_SECONDS = MENTIONS_WINDOW_DAYS * 24 * 60 * 60;
const TOPSTORIES_FETCH_CAP = 500;
const FRONT_PAGE_CUTOFF = 30;
const STORY_TEXT_MAX_CHARS = 500;

interface NormalizedStory {
  id: number;
  title: string;
  url: string;
  by: string;
  score: number;
  descendants: number;
  createdUtc: number;
  ageHours: number;
  velocity: number;
  trendingScore: number;
  everHitFrontPage: boolean;
  content_tags: string[];
  value_score: number;
  storyText: string;
  linkedRepos: Array<{ fullName: string; matchType: 'url'; confidence: number }>;
}

function computeVelocityFields(score: number, createdUtc: number, nowSec: number): {
  ageHours: number;
  velocity: number;
  logMagnitude: number;
} {
  const ageSec = Math.max(0, nowSec - createdUtc);
  const ageHours = Math.max(0.5, ageSec / 3600);
  const velocity = score / ageHours;
  const logMagnitude = Math.log10(Math.max(1, score));
  return {
    ageHours: Math.round(ageHours * 100) / 100,
    velocity: Math.round(velocity * 100) / 100,
    logMagnitude,
  };
}

function computeTrendingScore(
  score: number,
  createdUtc: number,
  descendants: number,
  nowSec: number,
): number {
  const { velocity, logMagnitude } = computeVelocityFields(score, createdUtc, nowSec);
  const commentBoost = 1 + (Number.isFinite(descendants) ? descendants : 0) / 10;
  return Math.round(velocity * logMagnitude * commentBoost * 100) / 100;
}

function stripStoryText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const noTags = raw.replace(/<[^>]+>/g, ' ');
  const decoded = noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
  return decoded.replace(/\s+/g, ' ').trim().slice(0, STORY_TEXT_MAX_CHARS);
}

function normalizeFirebaseItem(
  item: HnFirebaseItem,
  tracked: Map<string, string>,
  nowSec: number,
): NormalizedStory | null {
  if (!item || item.type !== 'story') return null;
  if (item.dead || item.deleted) return null;
  if (typeof item.time !== 'number') return null;
  const id = Number(item.id);
  if (!Number.isFinite(id) || id <= 0) return null;

  const title = String(item.title ?? '');
  const url = String(item.url ?? '');
  const storyText = String(item.text ?? '');
  const score = Number.isFinite(item.score) ? Number(item.score) : 0;
  const descendants = Number.isFinite(item.descendants) ? Number(item.descendants) : 0;

  const { ageHours, velocity } = computeVelocityFields(score, item.time, nowSec);
  const trendingScore = computeTrendingScore(score, item.time, descendants, nowSec);

  const textBlob = `${title}\n${url}\n${storyText}`;
  const linkedLower = extractAllRepoMentions(textBlob, tracked.size > 0 ? tracked : null);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: 'url' as const,
    confidence: 1.0,
  }));

  const classification = classifyPost({
    title,
    selftext: storyText,
    url,
    platform: 'hn',
  });

  return {
    id,
    title: title.slice(0, 300),
    url,
    by: String(item.by ?? ''),
    score,
    descendants,
    createdUtc: item.time,
    ageHours,
    velocity,
    trendingScore,
    everHitFrontPage: false,
    content_tags: classification.content_tags,
    value_score: classification.value_score,
    storyText: stripStoryText(storyText),
    linkedRepos,
  };
}

function normalizeAlgoliaHit(
  hit: HnAlgoliaHit,
  tracked: Map<string, string>,
  nowSec: number,
): NormalizedStory | null {
  if (!hit || typeof hit !== 'object') return null;
  const id = Number(hit.objectID);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (typeof hit.created_at_i !== 'number') return null;

  const title = String(hit.title ?? '');
  const url = String(hit.url ?? '');
  const storyText = String(hit.story_text ?? '');
  const score = Number.isFinite(hit.points) ? Number(hit.points) : 0;
  const descendants = Number.isFinite(hit.num_comments) ? Number(hit.num_comments) : 0;

  const { ageHours, velocity } = computeVelocityFields(score, hit.created_at_i, nowSec);
  const trendingScore = computeTrendingScore(score, hit.created_at_i, descendants, nowSec);

  const textBlob = `${title}\n${url}\n${storyText}`;
  const linkedLower = extractAllRepoMentions(textBlob, tracked.size > 0 ? tracked : null);
  const linkedRepos = Array.from(linkedLower, (lower) => ({
    fullName: tracked.get(lower) ?? lower,
    matchType: 'url' as const,
    confidence: 1.0,
  }));

  const classification = classifyPost({
    title,
    selftext: storyText,
    url,
    platform: 'hn',
  });

  return {
    id,
    title: title.slice(0, 300),
    url,
    by: String(hit.author ?? ''),
    score,
    descendants,
    createdUtc: hit.created_at_i,
    ageHours,
    velocity,
    trendingScore,
    everHitFrontPage: false,
    content_tags: classification.content_tags,
    value_score: classification.value_score,
    storyText: stripStoryText(storyText),
    linkedRepos,
  };
}

const fetcher: Fetcher = {
  name: 'hackernews',
  schedule: '10 * * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('hackernews dry-run');
      return done(startedAt, 0, false);
    }

    const tracked = await loadTrackedRepos({ log: ctx.log });
    if (tracked.size === 0) {
      ctx.log.warn('hackernews: tracked repos map empty - mentions buckets will be empty');
    }

    const fetchedAt = new Date().toISOString();
    const nowSec = Math.floor(Date.now() / 1000);
    const trendingCutoff = nowSec - TRENDING_WINDOW_SECONDS;
    const mentionsCutoff = nowSec - MENTIONS_WINDOW_SECONDS;

    // Firebase top stories.
    const topIds = await fetchTopStoryIds(ctx.http);
    const cappedIds = topIds.slice(0, TOPSTORIES_FETCH_CAP);
    const frontPageIdSet = new Set(cappedIds.slice(0, FRONT_PAGE_CUTOFF));
    ctx.log.info({ topIds: topIds.length, capped: cappedIds.length }, 'hackernews topstories');

    const { items: rawItems, errors: fbErrors } = await fetchItemsBatched(ctx.http, cappedIds);
    ctx.log.info({ items: rawItems.length, errors: fbErrors }, 'hackernews firebase items');

    const trendingStories: NormalizedStory[] = [];
    for (const item of rawItems) {
      const n = normalizeFirebaseItem(item, tracked, nowSec);
      if (!n) continue;
      if (n.createdUtc < trendingCutoff) continue;
      n.everHitFrontPage = frontPageIdSet.has(n.id);
      trendingStories.push(n);
    }

    // Algolia repo-mentions search (last 7d).
    const algoliaHits = await searchAlgoliaStories({
      http: ctx.http,
      query: 'github.com',
      since: mentionsCutoff,
    });
    ctx.log.info({ hits: algoliaHits.length }, 'hackernews algolia hits');

    const algoliaStories: NormalizedStory[] = [];
    for (const hit of algoliaHits) {
      const n = normalizeAlgoliaHit(hit, tracked, nowSec);
      if (!n) continue;
      if (n.createdUtc < mentionsCutoff) continue;
      if (frontPageIdSet.has(n.id)) n.everHitFrontPage = true;
      algoliaStories.push(n);
    }

    // Merge for trending output.
    const trendingById = new Map<number, NormalizedStory>();
    for (const s of trendingStories) trendingById.set(s.id, s);
    for (const s of algoliaStories) {
      if (s.createdUtc < trendingCutoff) continue;
      if (!trendingById.has(s.id)) trendingById.set(s.id, s);
    }
    const trendingMerged = Array.from(trendingById.values()).sort(
      (a, b) => b.trendingScore - a.trendingScore,
    );

    // Mentions map.
    const mentionsById = new Map<number, NormalizedStory>();
    const addToMentions = (s: NormalizedStory): void => {
      if (!s.linkedRepos || s.linkedRepos.length === 0) return;
      if (s.createdUtc < mentionsCutoff) return;
      const existing = mentionsById.get(s.id);
      if (!existing || s.score >= existing.score) {
        mentionsById.set(s.id, s);
      }
    };
    for (const s of trendingMerged) addToMentions(s);
    for (const s of algoliaStories) addToMentions(s);

    interface MentionBucket {
      count7d: number;
      scoreSum7d: number;
      topStory: unknown;
      everHitFrontPage: boolean;
      stories: NormalizedStory[];
    }
    const mentions: Record<string, MentionBucket> = {};
    const leaderboardMap = new Map<string, { fullName: string; count7d: number; scoreSum7d: number }>();

    for (const story of mentionsById.values()) {
      for (const repo of story.linkedRepos) {
        const full = repo.fullName;
        let bucket = mentions[full];
        if (!bucket) {
          bucket = {
            count7d: 0,
            scoreSum7d: 0,
            topStory: null,
            everHitFrontPage: false,
            stories: [],
          };
          mentions[full] = bucket;
        }
        bucket.count7d += 1;
        bucket.scoreSum7d += story.score;
        bucket.stories.push(story);
        if (story.everHitFrontPage) bucket.everHitFrontPage = true;

        const lb = leaderboardMap.get(full) ?? { fullName: full, count7d: 0, scoreSum7d: 0 };
        lb.count7d += 1;
        lb.scoreSum7d += story.score;
        leaderboardMap.set(full, lb);
      }
    }

    for (const bucket of Object.values(mentions)) {
      bucket.stories.sort((a, b) => b.score - a.score);
      const top = bucket.stories[0];
      if (top) {
        bucket.topStory = {
          id: top.id,
          title: top.title,
          score: top.score,
          url: top.url,
          hoursSincePosted: top.ageHours,
        };
      }
    }

    const leaderboard = Array.from(leaderboardMap.values()).sort((a, b) => {
      if (b.scoreSum7d !== a.scoreSum7d) return b.scoreSum7d - a.scoreSum7d;
      if (b.count7d !== a.count7d) return b.count7d - a.count7d;
      return a.fullName.localeCompare(b.fullName);
    });

    const trendingPayload = {
      fetchedAt,
      windowHours: TRENDING_WINDOW_HOURS,
      scannedTotal: rawItems.length + algoliaHits.length,
      firebaseCount: rawItems.length,
      algoliaCount: algoliaHits.length,
      stories: trendingMerged,
    };
    const mentionsPayload = {
      fetchedAt,
      windowDays: MENTIONS_WINDOW_DAYS,
      scannedAlgoliaHits: algoliaHits.length,
      scannedFirebaseItems: rawItems.length,
      mentions,
      leaderboard,
    };

    const trendingResult = await writeDataStore('hackernews-trending', trendingPayload);
    const mentionsResult = await writeDataStore('hackernews-repo-mentions', mentionsPayload);

    const itemsSeen = rawItems.length + algoliaHits.length;
    ctx.log.info(
      {
        trending: trendingMerged.length,
        mentions: Object.keys(mentions).length,
        trendingRedis: trendingResult.source,
        mentionsRedis: mentionsResult.source,
      },
      'hackernews published',
    );
    return done(
      startedAt,
      itemsSeen,
      trendingResult.source === 'redis' || mentionsResult.source === 'redis',
    );
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'hackernews',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
