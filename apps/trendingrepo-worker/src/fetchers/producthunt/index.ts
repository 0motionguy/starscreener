// ProductHunt launches fetcher.
//
// Cron: 0 11,15,19,23 * * * (matches .github/workflows/scrape-producthunt.yml)
//
// Outputs:
//   - ss:data:v1:producthunt-launches  (last 7d, deduped, AI-flagged, enriched)

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { writeDataStore } from '../../lib/redis.js';
import {
  TOPICS,
  hasAiKeyword,
  extractGithubLink,
  extractXLink,
  daysBetween,
  resolveRedirect,
  discoverLinkedUrls,
  enrichWithGithub,
  pickGithubToken,
  loadProducthuntTokens,
  pickToken,
  phGraphQL,
  sleep,
} from '../../lib/sources/producthunt.js';
import { loadTrackedRepos } from '../../lib/util/tracked-repos.js';

const WINDOW_DAYS = 7;
const POSTS_PER_TOPIC = 50;
const BROAD_POSTS = 50;
const POLITE_PAUSE_MS = 1000;

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
  name?: string;
  username?: string;
  twitterUsername?: string;
  websiteUrl?: string;
}

interface PhPostNode {
  id?: string;
  name?: string;
  tagline?: string;
  description?: string;
  url?: string;
  votesCount?: number;
  commentsCount?: number;
  createdAt?: string;
  website?: string;
  thumbnail?: { url?: string };
  topics?: { edges?: Array<{ node?: { slug?: string; name?: string } }> };
  makers?: PhMaker[];
}

interface PhPostsEnvelope {
  posts?: { edges?: Array<{ node?: PhPostNode }> };
}

interface NormalizedLaunch {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  website: string | null;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  thumbnail: string | null;
  topics: string[];
  makers: Array<{
    name: string;
    username: string;
    twitterUsername: string | null;
    websiteUrl: string | null;
  }>;
  githubUrl: string | null;
  xUrl: string | null;
  linkedRepo: string | null;
  daysSinceLaunch: number;
  aiAdjacent?: boolean;
  githubRepo?: { stars: number; topics: string[]; readmeSnippet: string };
  tags?: string[];
}

function normalizePost(node: PhPostNode, tracked: Map<string, string>): NormalizedLaunch | null {
  if (!node || typeof node !== 'object') return null;
  if (!node.id || !node.createdAt) return null;

  const topics = (node.topics?.edges ?? [])
    .map((e) => e.node?.slug)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  const makers: NormalizedLaunch['makers'] = (Array.isArray(node.makers) ? node.makers : [])
    .map((m) => ({
      name: String(m?.name ?? ''),
      username: String(m?.username ?? ''),
      twitterUsername: m?.twitterUsername ? String(m.twitterUsername) : null,
      websiteUrl: m?.websiteUrl ? String(m.websiteUrl) : null,
    }))
    .filter((m) => m.name || m.username || m.twitterUsername || m.websiteUrl);

  const makerXUrl = ((): string | null => {
    const tw = makers.find((m) => m.twitterUsername)?.twitterUsername ?? null;
    if (!tw) return null;
    const handle = String(tw).replace(/^@+/, '').trim();
    return handle ? `https://x.com/${handle}` : null;
  })();

  const scanBlob = [
    node.website ?? '',
    node.description ?? '',
    ...makers.map((m) => m.websiteUrl ?? ''),
  ].join('\n');
  const ghMatch = extractGithubLink(scanBlob);
  const xUrl = extractXLink(scanBlob) ?? makerXUrl;
  let linkedRepo: string | null = null;
  if (ghMatch) {
    const lower = ghMatch.fullName.toLowerCase();
    if (tracked.has(lower)) linkedRepo = lower;
  }

  return {
    id: String(node.id),
    name: String(node.name ?? ''),
    tagline: String(node.tagline ?? ''),
    description: String(node.description ?? '').slice(0, 1000),
    url: String(node.url ?? ''),
    website: node.website ? String(node.website) : null,
    votesCount: Number.isFinite(node.votesCount) ? Number(node.votesCount) : 0,
    commentsCount: Number.isFinite(node.commentsCount) ? Number(node.commentsCount) : 0,
    createdAt: String(node.createdAt),
    thumbnail: node.thumbnail?.url ? String(node.thumbnail.url) : null,
    topics,
    makers,
    githubUrl: ghMatch?.url ?? null,
    xUrl,
    linkedRepo,
    daysSinceLaunch: daysBetween(node.createdAt),
  };
}

function isAiAdjacent(launch: NormalizedLaunch): boolean {
  if (!launch) return false;
  if (Array.isArray(launch.topics) && launch.topics.some((t) => AI_TOPIC_SLUGS.has(t))) {
    return true;
  }
  const blob = [
    launch.name ?? '',
    launch.tagline ?? '',
    launch.description ?? '',
    ...(Array.isArray(launch.topics) ? launch.topics : []),
  ].join(' ');
  return hasAiKeyword(blob);
}

const fetcher: Fetcher = {
  name: 'producthunt',
  schedule: '0 11,15,19,23 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    if (ctx.dryRun) {
      ctx.log.info('producthunt dry-run');
      return done(startedAt, 0, false);
    }

    const tokens = loadProducthuntTokens();
    if (tokens.length === 0) {
      ctx.log.warn('producthunt: no PRODUCTHUNT_TOKENS / PRODUCTHUNT_TOKEN set - skipping');
      return done(startedAt, 0, false);
    }
    ctx.log.info({ poolSize: tokens.length }, 'producthunt: token pool');

    const tracked = await loadTrackedRepos({ log: ctx.log });

    const postedAfter = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    const allNodes = new Map<string, PhPostNode>();
    let queryErrors = 0;

    for (const topic of TOPICS) {
      try {
        const token = pickToken(tokens);
        const data = await phGraphQL<PhPostsEnvelope>(
          POSTS_QUERY,
          { topic, first: POSTS_PER_TOPIC, postedAfter },
          { http: ctx.http, token },
        );
        const nodes = (data?.posts?.edges ?? []).map((e) => e.node).filter((n): n is PhPostNode => Boolean(n));
        for (const n of nodes) {
          if (n?.id && !allNodes.has(n.id)) allNodes.set(n.id, n);
        }
        ctx.log.debug({ topic, count: nodes.length, cumulative: allNodes.size }, 'producthunt topic');
      } catch (err) {
        queryErrors += 1;
        ctx.log.warn({ topic, err: (err as Error).message }, 'producthunt topic failed');
      }
      await sleep(POLITE_PAUSE_MS);
    }

    try {
      const token = pickToken(tokens);
      const broad = await phGraphQL<PhPostsEnvelope>(
        BROAD_QUERY,
        { first: BROAD_POSTS, postedAfter },
        { http: ctx.http, token },
      );
      const nodes = (broad?.posts?.edges ?? []).map((e) => e.node).filter((n): n is PhPostNode => Boolean(n));
      for (const n of nodes) {
        if (n?.id && !allNodes.has(n.id)) allNodes.set(n.id, n);
      }
      ctx.log.debug({ count: nodes.length, cumulative: allNodes.size }, 'producthunt broad');
    } catch (err) {
      queryErrors += 1;
      ctx.log.warn({ err: (err as Error).message }, 'producthunt broad failed');
    }

    if (allNodes.size === 0) {
      if (queryErrors >= TOPICS.length + 1) {
        ctx.log.warn('producthunt: all queries failed');
        return done(startedAt, 0, false);
      }
      ctx.log.warn('producthunt: zero posts returned');
    }

    const launches: NormalizedLaunch[] = [];
    for (const n of allNodes.values()) {
      const norm = normalizePost(n, tracked);
      if (!norm) continue;
      norm.aiAdjacent = isAiAdjacent(norm);
      launches.push(norm);
    }

    // Redirect resolution.
    let resolvedCount = 0;
    const RESOLVE_BATCH = 6;
    for (let i = 0; i < launches.length; i += RESOLVE_BATCH) {
      const batch = launches.slice(i, i + RESOLVE_BATCH);
      await Promise.all(
        batch.map(async (l) => {
          if (!l.website) return;
          if (!l.website.includes('producthunt.com/r/')) return;
          const resolved = await resolveRedirect(l.website);
          if (resolved === null) return;
          if (resolved !== l.website) {
            l.website = resolved;
            resolvedCount += 1;
            if (!l.githubUrl) {
              const gh = extractGithubLink(resolved);
              if (gh) {
                l.githubUrl = gh.url;
                const lower = gh.fullName.toLowerCase();
                if (tracked.has(lower)) l.linkedRepo = lower;
              }
            }
            if (!l.xUrl) {
              const x = extractXLink(resolved);
              if (x) l.xUrl = x;
            }
          }
        }),
      );
    }
    ctx.log.debug({ resolved: resolvedCount, total: launches.length }, 'producthunt redirects');

    // Discovery pass.
    let discoveredGithubCount = 0;
    let discoveredXCount = 0;
    const DISCOVER_BATCH = 6;
    for (let i = 0; i < launches.length; i += DISCOVER_BATCH) {
      const batch = launches.slice(i, i + DISCOVER_BATCH);
      await Promise.all(
        batch.map(async (l) => {
          if (!l.website) return;
          if (l.githubUrl && l.xUrl) return;
          const discovered = await discoverLinkedUrls(l.website);
          if (!l.githubUrl && discovered.githubUrl) {
            l.githubUrl = discovered.githubUrl;
            discoveredGithubCount += 1;
            const lower = discovered.githubUrl
              .replace(/^https?:\/\/github\.com\//, '')
              .toLowerCase();
            if (tracked.has(lower)) l.linkedRepo = lower;
          }
          if (!l.xUrl && discovered.xUrl) {
            l.xUrl = discovered.xUrl;
            discoveredXCount += 1;
          }
        }),
      );
    }
    ctx.log.debug(
      { discoveredGithub: discoveredGithubCount, discoveredX: discoveredXCount },
      'producthunt link discovery',
    );

    // GitHub enrichment.
    const ghToken = pickGithubToken();
    let enrichedCount = 0;
    for (const l of launches) {
      if (!l.githubUrl) continue;
      const full = l.githubUrl.replace(/^https?:\/\/github\.com\//, '');
      const info = await enrichWithGithub(ctx.http, full, { token: ghToken });
      if (!info) continue;
      l.githubRepo = {
        stars: info.stars,
        topics: info.topics,
        readmeSnippet: info.readmeSnippet,
      };
      l.tags = info.tags;
      enrichedCount += 1;
    }
    ctx.log.debug({ enriched: enrichedCount }, 'producthunt github enrichment');

    launches.sort((a, b) => {
      if (a.aiAdjacent !== b.aiAdjacent) return a.aiAdjacent ? -1 : 1;
      if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
      return b.createdAt.localeCompare(a.createdAt);
    });

    const payload = {
      lastFetchedAt: new Date().toISOString(),
      windowDays: WINDOW_DAYS,
      launches,
    };

    const result = await writeDataStore('producthunt-launches', payload);
    ctx.log.info(
      {
        launches: launches.length,
        ai: launches.filter((l) => l.aiAdjacent).length,
        withGh: launches.filter((l) => l.githubUrl).length,
        linked: launches.filter((l) => l.linkedRepo).length,
        enriched: enrichedCount,
        redis: result.source,
      },
      'producthunt published',
    );
    return done(startedAt, launches.length, result.source === 'redis');
  },
};

export default fetcher;

function done(startedAt: string, items: number, redisPublished: boolean): RunResult {
  return {
    fetcher: 'producthunt',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors: [],
  };
}
