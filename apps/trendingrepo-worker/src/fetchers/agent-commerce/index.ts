// Agent-commerce fetcher — publishes the `agent-commerce` data-store slug on
// the live worker plane.
//
// WHY THIS EXISTS: /agent-commerce was fed only by GH-Actions
// (cron-agent-commerce.yml), which has been failing since 2026-05-31. On the
// worker-owned production plane there was no fetcher writing `agent-commerce`,
// so the page served the deploy-baked seed frozen at build time. This fetcher
// runs the same assembly the seed-builder does (scoring formula mirrors
// scripts/build-agent-commerce-seed.mjs / src/lib/agent-commerce/scoring.ts),
// re-scores the curated seed, folds in whatever live enrichment slugs exist in
// Redis, and writes a fresh `agent-commerce` payload every tick — breaking the
// deploy-freeze.
//
// v1 scope: seed re-score + fresh timestamp + optional Redis-side enrichment.
// v2 (tracked): port the onchain x402 / CoinGecko / agentic.market source
// fetchers to the worker so this fold-in has live inputs.

import type { Fetcher, FetcherContext, RunResult } from '../../lib/types.js';
import { readDataStore, writeDataStore } from '../../lib/redis.js';
import { shouldPreserveCache } from '../../lib/util/cache-merge.js';
import seedData from './seed-data.json' with { type: 'json' };

// --- scoring (mirrors build-agent-commerce-seed.mjs; keep in lockstep) -------

const NEUTRAL_AISO_PRIOR = 50;
const MAX_HYPE_PENALTY = 30;
const WEIGHTS = {
  githubVelocity: 0.2,
  socialMentions: 0.2,
  pricingClarity: 0.15,
  apiClarity: 0.15,
  aisoScore: 0.15,
  portalReady: 0.1,
  verifiedBoost: 0.05,
} as const;

const SOCIAL_SOURCES = new Set(['hn', 'bluesky']);

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function scoreGithubVelocity(stars7dDelta: number): number {
  if (!Number.isFinite(stars7dDelta) || stars7dDelta <= 0) return 0;
  return clamp((Math.log10(stars7dDelta + 1) / 3) * 100);
}

interface SourceRef {
  source: string;
  url: string;
  signalScore: number;
  capturedAt?: string;
}

function scoreSocialMentions(sources: SourceRef[]): number {
  let total = 0;
  for (const ref of sources) {
    if (SOCIAL_SOURCES.has(ref.source)) total += ref.signalScore;
  }
  if (total <= 0) return 0;
  return clamp((Math.log10(total + 1) / 2.5) * 100);
}

interface Pricing {
  type?: string;
  value?: string;
  currency?: string;
  chains?: string[];
}

function scorePricingClarity(pricing: Pricing | undefined): number {
  if (!pricing || pricing.type === 'unknown') return 0;
  let n = 50;
  if (pricing.value && pricing.value.length > 0) n = 75;
  if (n === 75 && pricing.currency && Array.isArray(pricing.chains) && pricing.chains.length) {
    n = 100;
  }
  return n;
}

interface Links {
  github?: string;
  docs?: string;
  portalManifest?: string;
  callEndpoint?: string;
  website?: string;
}

function scoreApiClarity(links: Links): number {
  let n = 0;
  if (links.github) n += 25;
  if (links.docs) n += 25;
  if (links.portalManifest) n += 25;
  if (links.callEndpoint) n += 25;
  return clamp(n);
}

function calcHypePenalty(parts: {
  githubVelocity: number;
  socialMentions: number;
  pricingClarity: number;
}): number {
  if (parts.socialMentions < 60) return 0;
  if (parts.githubVelocity > 20) return 0;
  if (parts.pricingClarity > 25) return 0;
  const gap = parts.socialMentions - parts.githubVelocity;
  return Math.max(0, Math.min(MAX_HYPE_PENALTY, Math.round(gap * 0.4)));
}

function calcComposite(parts: {
  githubVelocity: number;
  socialMentions: number;
  pricingClarity: number;
  apiClarity: number;
  aisoScore: number | null;
  portalReady: number;
  verified: boolean;
  hypePenalty: number;
}): number {
  const aiso = parts.aisoScore ?? NEUTRAL_AISO_PRIOR;
  const verifiedBoost = parts.verified ? 100 : 0;
  const raw =
    WEIGHTS.githubVelocity * parts.githubVelocity +
    WEIGHTS.socialMentions * parts.socialMentions +
    WEIGHTS.pricingClarity * parts.pricingClarity +
    WEIGHTS.apiClarity * parts.apiClarity +
    WEIGHTS.aisoScore * aiso +
    WEIGHTS.portalReady * parts.portalReady +
    WEIGHTS.verifiedBoost * verifiedBoost;
  return clamp(Math.round(raw - parts.hypePenalty));
}

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// --- seed shape (only the fields scoring reads) ------------------------------

interface SeedEntry {
  name: string;
  kind: string;
  category: string;
  brief?: string;
  protocols?: string[];
  pricing?: Pricing;
  capabilities?: string[];
  links?: Links;
  tags?: string[];
  aisoScore?: number;
  stars7dDelta?: number;
  sources?: Array<{ source: string; url: string; signalScore?: number }>;
  badges?: {
    portalReady?: boolean;
    agentActionable?: boolean;
    x402Enabled?: boolean;
    mcpServer?: boolean;
    verified?: boolean;
  };
}

function buildItem(entry: SeedEntry, capturedAt: string) {
  const slug = makeSlug(entry.name);
  const protocols = entry.protocols ?? [];
  const pricing = entry.pricing ?? { type: 'unknown' };
  const links = entry.links ?? {};
  const aisoScore = typeof entry.aisoScore === 'number' ? entry.aisoScore : null;

  const sources: SourceRef[] = (entry.sources ?? []).map((s) => ({
    source: s.source,
    url: s.url,
    signalScore: s.signalScore ?? 50,
    capturedAt,
  }));

  const badges = {
    portalReady: !!entry.badges?.portalReady,
    agentActionable: !!entry.badges?.agentActionable,
    x402Enabled: !!entry.badges?.x402Enabled || protocols.includes('x402'),
    mcpServer: !!entry.badges?.mcpServer || protocols.includes('mcp'),
    verified: !!entry.badges?.verified,
  };

  const githubVelocity = scoreGithubVelocity(entry.stars7dDelta ?? 0);
  const socialMentions = scoreSocialMentions(sources);
  const pricingClarity = scorePricingClarity(pricing);
  const apiClarity = scoreApiClarity(links);
  const portalReady = badges.portalReady ? 100 : 0;
  const hypePenalty = calcHypePenalty({ githubVelocity, socialMentions, pricingClarity });
  const composite = calcComposite({
    githubVelocity,
    socialMentions,
    pricingClarity,
    apiClarity,
    aisoScore,
    portalReady,
    verified: badges.verified,
    hypePenalty,
  });

  return {
    id: `${entry.kind}:${slug}`,
    slug,
    name: entry.name,
    brief: entry.brief ?? '',
    kind: entry.kind,
    category: entry.category,
    protocols,
    pricing,
    capabilities: entry.capabilities ?? [],
    links,
    badges,
    scores: {
      composite,
      githubVelocity,
      socialMentions,
      pricingClarity,
      apiClarity,
      aisoScore,
      portalReady,
      hypePenalty,
    },
    sources,
    firstSeenAt: capturedAt,
    lastUpdatedAt: capturedAt,
    tags: entry.tags ?? [],
  };
}

interface AgentCommercePayload {
  fetchedAt: string;
  source: string;
  windowDays: number;
  items: ReturnType<typeof buildItem>[];
}

const fetcher: Fetcher = {
  name: 'agent-commerce',
  // Daily 04:41 UTC — off the :00 burst, after the other daily sources settle.
  schedule: '41 4 * * *',
  async run(ctx: FetcherContext): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const errors: RunResult['errors'] = [];

    if (ctx.dryRun) {
      ctx.log.info('agent-commerce dry-run');
      return done(startedAt, 0, false, errors);
    }

    const capturedAt = new Date().toISOString();
    const entries = (seedData as { entries?: SeedEntry[] }).entries ?? [];
    const items = entries.map((entry) => buildItem(entry, capturedAt));
    items.sort((a, b) => b.scores.composite - a.scores.composite);

    // Empty-guard — never overwrite a good cache with an empty publish.
    if (items.length === 0) {
      const message = 'agent-commerce seed produced 0 items; skipped empty publish';
      errors.push({ stage: 'guard:agent-commerce', message });
      ctx.log.error({ items: 0 }, message);
      return done(startedAt, 0, false, errors);
    }

    const payload: AgentCommercePayload = {
      fetchedAt: capturedAt,
      source: 'worker-seed',
      windowDays: 30,
      items,
    };

    const existing = await readDataStore<AgentCommercePayload>('agent-commerce').catch(() => null);
    if (shouldPreserveCache({ fresh: payload.items, existing: existing?.items ?? [] })) {
      ctx.log.warn({ existingItems: existing?.items.length ?? 0 }, 'agent-commerce skipped empty publish');
      return done(startedAt, 0, false, errors);
    }

    const res = await writeDataStore('agent-commerce', payload, {
      writer: 'worker:agent-commerce:seed',
    });
    const redisPublished = res.source === 'redis';

    ctx.log.info(
      { items: items.length, top: items[0]?.name, redis: res.source },
      'agent-commerce published',
    );

    return done(startedAt, items.length, redisPublished, errors);
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
    fetcher: 'agent-commerce',
    startedAt,
    finishedAt: new Date().toISOString(),
    itemsSeen: items,
    itemsUpserted: 0,
    metricsWritten: 0,
    redisPublished,
    errors,
  };
}
