// ProductHunt launches fetcher.
//
// Ports the active GitHub Actions collector into the HOSTUP worker plane so
// producthunt-launches is refreshed from the same Redis writer as the app.
// Uses the shared ProductHunt helper module for token loading, GraphQL,
// redirect discovery, GitHub enrichment, and AI-adjacent classification.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { mergeAndCap } from '../../lib/util/cache-merge.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';
import {
  TOPICS,
  daysBetween,
  discoverLinkedUrls,
  enrichWithGithub,
  extractGithubLink,
  extractXLink,
  hasAiKeyword,
  loadProducthuntTokens,
  phGraphQL,
  pickGithubToken,
  pickToken,
  resolveRedirect,
  sleep,
} from '../../lib/sources/producthunt.js';

const WINDOW_DAYS = 7;
const POSTS_PER_TOPIC = 50;
const BROAD_POSTS = 50;
const POLITE_PAUSE_MS = 1000;
const RESOLVE_BATCH = 6;
const DISCOVER_BATCH = 6;
const KEEP_LAUNCHES = 50;

const AI_TOPIC_SLUGS = new Set(['artificial-intelligence', 'chatbots']);

const POSTS_QUERY = `
  query TopicPosts($topic: String!, $first: Int!, $postedAfter: DateTime) {
    posts(first: $first, order: RANKING, topic: $topic, postedAfter: $postedAfter) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          votesCount
          commentsCount
          createdAt
          website
          thumbnail { url }
          topics(first: 8) { edges { node { slug name } } }
          makers { name username twitterUsername websiteUrl }
        }
      }
    }
  }
`;

const BROAD_QUERY = `
  query BroadPosts($first: Int!, $postedAfter: DateTime) {
    posts(first: $first, order: RANKING, postedAfter: $postedAfter) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          votesCount
          commentsCount
          createdAt
          website
          thumbnail { url }
          topics(first: 8) { edges { node { slug name } } }
          makers { name username twitterUsername websiteUrl }
        }
      }
    }
  }
`;

interface PhMaker {
  name: string;
  username: string;
  twitterUsername: string | null;
  websiteUrl: string | null;
}

interface PhLaunch {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  website: string | null;
  xUrl?: string | null;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnail: string | null;
  topics: string[];
  makers: PhMaker[];
  githubUrl: string | null;
  linkedRepo: string | null;
  daysSinceLaunch: number;
  aiAdjacent?: boolean;
  tags?: string[];
  githubRepo?: {
    stars: number;
    topics: string[];
    readmeSnippet: string;
  };
}

interface PhPayload {
  lastFetchedAt: string;
  windowDays: number;
  launches: PhLaunch[];
}

interface PhTopicEdge {
  node?: { slug?: unknown };
}

interface PhPostNode {
  id?: unknown;
  name?: unknown;
  tagline?: unknown;
  description?: unknown;
  url?: unknown;
  votesCount?: unknown;
  commentsCount?: unknown;
  createdAt?: unknown;
  website?: unknown;
  thumbnail?: { url?: unknown } | null;
  topics?: { edges?: PhTopicEdge[] };
  makers?: Array<{
    name?: unknown;
    username?: unknown;
    twitterUsername?: unknown;
    websiteUrl?: unknown;
  }>;
}

interface PhPostsResponse {
  posts?: {
    edges?: Array<{ node?: PhPostNode | null }>;
  };
}

function nodeList(data: PhPostsResponse | null | undefined): PhPostNode[] {
  return (data?.posts?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is PhPostNode => Boolean(node));
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizePost(
  node: PhPostNode,
  tracked: Map<string, string>,
): PhLaunch | null {
  if (!node || typeof node !== 'object') return null;
  if (!node.id || !node.createdAt) return null;

  const topics = (node.topics?.edges ?? [])
    .map((edge) => edge.node?.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);

  const makers = (Array.isArray(node.makers) ? node.makers : [])
    .map((maker) => ({
      name: String(maker?.name ?? ''),
      username: String(maker?.username ?? ''),
      twitterUsername: maker?.twitterUsername ? String(maker.twitterUsername) : null,
      websiteUrl: maker?.websiteUrl ? String(maker.websiteUrl) : null,
    }))
    .filter((maker) => maker.name || maker.username || maker.twitterUsername || maker.websiteUrl);

  const makerXUrl = (() => {
    const twitterUsername = makers.find((maker) => maker.twitterUsername)?.twitterUsername;
    if (!twitterUsername) return null;
    const handle = String(twitterUsername).replace(/^@+/, '').trim();
    return handle ? `https://x.com/${handle}` : null;
  })();

  const scanBlob = [
    node.website ?? '',
    node.description ?? '',
    ...makers.map((maker) => maker.websiteUrl ?? ''),
  ].join('\n');
  const ghMatch = extractGithubLink(scanBlob);
  const xUrl = extractXLink(scanBlob) ?? makerXUrl;
  let linkedRepo: string | null = null;
  if (ghMatch) {
    const lower = ghMatch.fullName.toLowerCase();
    if (tracked.has(lower)) linkedRepo = tracked.get(lower) ?? lower;
  }

  return {
    id: String(node.id),
    name: String(node.name ?? ''),
    tagline: String(node.tagline ?? ''),
    description: String(node.description ?? '').slice(0, 1000),
    url: String(node.url ?? ''),
    website: node.website ? String(node.website) : null,
    votesCount: numeric(node.votesCount),
    commentsCount: numeric(node.commentsCount),
    createdAt: String(node.createdAt),
    thumbnail: node.thumbnail?.url ? String(node.thumbnail.url) : null,
    topics,
    makers,
    githubUrl: ghMatch?.url ?? null,
    xUrl,
    linkedRepo,
    daysSinceLaunch: daysBetween(String(node.createdAt)),
  };
}

function isAiAdjacent(launch: PhLaunch): boolean {
  if (launch.topics.some((topic) => AI_TOPIC_SLUGS.has(topic))) return true;
  const blob = [
    launch.name,
    launch.tagline,
    launch.description,
    ...launch.topics,
  ].join(' ');
  return hasAiKeyword(blob);
}

function fullNameFromGithubUrl(url: string): string | null {
  const prefix = /^https?:\/\/github\.com\//i;
  if (!prefix.test(url)) return null;
  const fullName = url.replace(prefix, '').split(/[?#]/, 1)[0] ?? '';
  const [owner, repo] = fullName.split('/', 2);
  return owner && repo ? `${owner}/${repo}`.toLowerCase() : null;
}

function compareLaunches(a: PhLaunch, b: PhLaunch): number {
  if (a.aiAdjacent !== b.aiAdjacent) return a.aiAdjacent ? -1 : 1;
  if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
  const bTime = Date.parse(b.createdAt);
  const aTime = Date.parse(a.createdAt);
  return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
}

async function fetchTopicPosts(
  ctx: FetcherContext,
  token: string,
  topic: string,
  postedAfter: string,
): Promise<PhPostNode[]> {
  const data = await phGraphQL<PhPostsResponse>(
    POSTS_QUERY,
    { topic, first: POSTS_PER_TOPIC, postedAfter },
    { http: ctx.http, token },
  );
  return nodeList(data);
}

async function fetchBroadPosts(
  ctx: FetcherContext,
  token: string,
  postedAfter: string,
): Promise<PhPostNode[]> {
  const data = await phGraphQL<PhPostsResponse>(
    BROAD_QUERY,
    { first: BROAD_POSTS, postedAfter },
    { http: ctx.http, token },
  );
  return nodeList(data);
}

const fetcher: Fetcher = {
  name: 'producthunt',
  schedule: '8 11,15,19,23 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('producthunt dry-run');
      return done(startedAt, 0, false, errors);
    }

    const tokens = loadProducthuntTokens();
    if (tokens.length === 0) {
      const message = 'PRODUCTHUNT_TOKENS / PRODUCTHUNT_TOKEN not set';
      ctx.log.warn(message);
      errors.push({ stage: 'config', message });
      return done(startedAt, 0, false, errors);
    }
    const token = pickToken(tokens);
    ctx.log.info({ tokenPoolSize: tokens.length }, 'producthunt: starting');

    const tracked = await loadTrackedRepos({ log: ctx.log });
    const postedAfter = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const allNodes = new Map<string, PhPostNode>();
    let queryErrors = 0;

    for (const topic of TOPICS) {
      try {
        const nodes = await fetchTopicPosts(ctx, token, topic, postedAfter);
        for (const node of nodes) {
          if (node.id) allNodes.set(String(node.id), node);
        }
        ctx.log.debug({ topic, posts: nodes.length, unique: allNodes.size }, 'producthunt topic fetched');
      } catch (err) {
        queryErrors += 1;
        const message = (err as Error).message;
        errors.push({ stage: `topic:${topic}`, message });
        ctx.log.warn({ topic, err: message }, 'producthunt topic failed');
      }
      await sleep(POLITE_PAUSE_MS);
    }

    try {
      const nodes = await fetchBroadPosts(ctx, token, postedAfter);
      for (const node of nodes) {
        if (node.id) allNodes.set(String(node.id), node);
      }
      ctx.log.debug({ posts: nodes.length, unique: allNodes.size }, 'producthunt broad fetched');
    } catch (err) {
      queryErrors += 1;
      const message = (err as Error).message;
      errors.push({ stage: 'broad', message });
      ctx.log.warn({ err: message }, 'producthunt broad query failed');
    }

    if (allNodes.size === 0 && queryErrors >= TOPICS.length + 1) {
      const message = 'all ProductHunt queries failed';
      ctx.log.error(message);
      errors.push({ stage: 'queries', message });
      return done(startedAt, 0, false, errors);
    }

    const launches: PhLaunch[] = [];
    for (const node of allNodes.values()) {
      const normalized = normalizePost(node, tracked);
      if (!normalized) continue;
      normalized.aiAdjacent = isAiAdjacent(normalized);
      launches.push(normalized);
    }

    for (let i = 0; i < launches.length; i += RESOLVE_BATCH) {
      const batch = launches.slice(i, i + RESOLVE_BATCH);
      await Promise.all(
        batch.map(async (launch) => {
          if (!launch.website?.includes('producthunt.com/r/')) return;
          const resolved = await resolveRedirect(launch.website);
          if (!resolved || resolved === launch.website) return;
          launch.website = resolved;
          if (!launch.githubUrl) {
            const gh = extractGithubLink(resolved);
            if (gh) {
              launch.githubUrl = gh.url;
              const lower = gh.fullName.toLowerCase();
              if (tracked.has(lower)) launch.linkedRepo = tracked.get(lower) ?? lower;
            }
          }
          if (!launch.xUrl) {
            launch.xUrl = extractXLink(resolved);
          }
        }),
      );
    }

    for (let i = 0; i < launches.length; i += DISCOVER_BATCH) {
      const batch = launches.slice(i, i + DISCOVER_BATCH);
      await Promise.all(
        batch.map(async (launch) => {
          if (!launch.website || (launch.githubUrl && launch.xUrl)) return;
          const discovered = await discoverLinkedUrls(launch.website);
          if (!launch.githubUrl && discovered.githubUrl) {
            launch.githubUrl = discovered.githubUrl;
            const lower = fullNameFromGithubUrl(discovered.githubUrl);
            if (lower && tracked.has(lower)) launch.linkedRepo = tracked.get(lower) ?? lower;
          }
          if (!launch.xUrl && discovered.xUrl) {
            launch.xUrl = discovered.xUrl;
          }
        }),
      );
    }

    const githubToken = pickGithubToken();
    let enriched = 0;
    for (const launch of launches) {
      if (!launch.githubUrl) continue;
      const fullName = fullNameFromGithubUrl(launch.githubUrl);
      if (!fullName) continue;
      const info = await enrichWithGithub(ctx.http, fullName, { token: githubToken });
      if (!info) continue;
      launch.githubRepo = {
        stars: info.stars,
        topics: info.topics,
        readmeSnippet: info.readmeSnippet,
      };
      launch.tags = info.tags;
      enriched += 1;
    }

    launches.sort(compareLaunches);

    const existing = await readDataStore<PhPayload>('producthunt-launches').catch(() => null);
    const mergedLaunches = mergeAndCap<PhLaunch>({
      existing: existing?.launches ?? [],
      fresh: launches,
      key: (launch) => launch.id,
      compare: compareLaunches,
      max: KEEP_LAUNCHES,
    });
    const payload: PhPayload = {
      lastFetchedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      launches: mergedLaunches,
    };

    const result = await writeDataStore('producthunt-launches', payload);
    ctx.log.info(
      {
        fetched: launches.length,
        merged: mergedLaunches.length,
        enriched,
        aiAdjacent: launches.filter((launch) => launch.aiAdjacent).length,
        redis: result.source,
      },
      'producthunt published',
    );

    return done(startedAt, launches.length, result.source === 'redis', errors);
  },
};

export default fetcher;

function done(
  startedAt: string,
  items: number,
  redisPublished: boolean,
  errors: RunResult['errors'],
): RunResult {
  return {
    fetcher: 'producthunt',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
