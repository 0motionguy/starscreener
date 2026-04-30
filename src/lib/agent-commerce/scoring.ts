// Agent Commerce — composite scoring.
//
// Pure functions over AgentCommerceItem. Computed at write time by the
// collector; cached on item.scores. Never re-derived per render.
//
// Composite formula (from /agent-commerce plan section 6):
//   0.20 * githubVelocity
// + 0.20 * socialMentions
// + 0.15 * pricingClarity
// + 0.15 * apiClarity
// + 0.15 * aisoScore (null → neutral 50 prior)
// + 0.10 * portalReady
// + 0.05 * verifiedBoost
// - hypePenalty
//
// Half the weight is demonstrated agent-actionability (pricing + api +
// portal + AISO). One-third is real adoption (github + social). The
// rest is curation. Hype penalty kills the "vapor x402 token" pattern.

import type {
  AgentCommerceBadges,
  AgentCommerceItem,
  AgentCommerceLinks,
  AgentCommercePricing,
  AgentCommerceScores,
  AgentCommerceSourceRef,
} from "./types";

const WEIGHTS = {
  githubVelocity: 0.20,
  socialMentions: 0.20,
  pricingClarity: 0.15,
  apiClarity: 0.15,
  aisoScore: 0.15,
  portalReady: 0.10,
  verifiedBoost: 0.05,
} as const;

const NEUTRAL_AISO_PRIOR = 50;
const MAX_HYPE_PENALTY = 30;

export function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/**
 * GitHub velocity: log10-normalized stars-7d delta.
 * 0 stars/week → 0; ~10 → 50; ~100 → 75; ~1000 → 100.
 */
export function scoreGithubVelocity(stars7dDelta: number): number {
  if (!Number.isFinite(stars7dDelta) || stars7dDelta <= 0) return 0;
  const log = Math.log10(stars7dDelta + 1);
  return clamp01to100((log / 3) * 100);
}

/**
 * Social mentions: weighted log-scaled sum across HN/Reddit/Bluesky/X
 * over a 7-day window. Each source contributes its sum of signalScore,
 * then we log-normalize to compress runaway buzz.
 */
export function scoreSocialMentions(
  sources: AgentCommerceSourceRef[],
): number {
  const social = new Set<string>(["hn", "reddit", "bluesky"]);
  let total = 0;
  for (const ref of sources) {
    if (social.has(ref.source)) total += ref.signalScore;
  }
  if (total <= 0) return 0;
  const log = Math.log10(total + 1);
  return clamp01to100((log / 2.5) * 100);
}

/**
 * Pricing clarity:
 *  - 0   when type === "unknown"
 *  - 50  when type set but no value
 *  - 75  when type + value
 *  - 100 when type + value + currency + chain (full x402-style disclosure)
 */
export function scorePricingClarity(pricing: AgentCommercePricing): number {
  if (pricing.type === "unknown") return 0;
  let n = 50;
  if (pricing.value && pricing.value.length > 0) n = 75;
  if (n === 75 && pricing.currency && pricing.chains?.length) n = 100;
  return n;
}

/**
 * API clarity: presence of agent-actionable surfaces.
 * Each surface adds 25, capped at 100.
 *   github / docs / portalManifest / callEndpoint
 */
export function scoreApiClarity(links: AgentCommerceLinks): number {
  let n = 0;
  if (links.github) n += 25;
  if (links.docs) n += 25;
  if (links.portalManifest) n += 25;
  if (links.callEndpoint) n += 25;
  return clamp01to100(n);
}

/**
 * Hype penalty: kicks in when buzz > substance.
 * Triggers when socialMentions ≥ 60 AND githubVelocity ≤ 20 AND
 * pricingClarity ≤ 25. Scales with the gap.
 */
export function calcHypePenalty(parts: {
  githubVelocity: number;
  socialMentions: number;
  pricingClarity: number;
}): number {
  if (parts.socialMentions < 60) return 0;
  if (parts.githubVelocity > 20) return 0;
  if (parts.pricingClarity > 25) return 0;
  const gap = parts.socialMentions - parts.githubVelocity;
  const penalty = Math.min(MAX_HYPE_PENALTY, gap * 0.4);
  return Math.max(0, Math.round(penalty));
}

export function calcComposite(parts: {
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
  return clamp01to100(Math.round(raw - parts.hypePenalty));
}

/**
 * Full scoring pass — call this once per item at write time.
 * Inputs come from collector context (stars delta, raw mentions, etc.);
 * outputs are stored on item.scores so the UI never re-computes.
 */
export function scoreItem(input: {
  stars7dDelta: number;
  sources: AgentCommerceSourceRef[];
  pricing: AgentCommercePricing;
  links: AgentCommerceLinks;
  badges: AgentCommerceBadges;
  aisoScore: number | null;
}): AgentCommerceScores {
  const githubVelocity = scoreGithubVelocity(input.stars7dDelta);
  const socialMentions = scoreSocialMentions(input.sources);
  const pricingClarity = scorePricingClarity(input.pricing);
  const apiClarity = scoreApiClarity(input.links);
  const portalReady = input.badges.portalReady ? 100 : 0;
  const hypePenalty = calcHypePenalty({
    githubVelocity,
    socialMentions,
    pricingClarity,
  });
  const composite = calcComposite({
    githubVelocity,
    socialMentions,
    pricingClarity,
    apiClarity,
    aisoScore: input.aisoScore,
    portalReady,
    verified: input.badges.verified,
    hypePenalty,
  });

  return {
    composite,
    githubVelocity,
    socialMentions,
    pricingClarity,
    apiClarity,
    aisoScore: input.aisoScore,
    portalReady,
    hypePenalty,
  };
}

export function compareByComposite(
  a: AgentCommerceItem,
  b: AgentCommerceItem,
): number {
  return b.scores.composite - a.scores.composite;
}
