// Composite trending_score for a skills.sh row. Independent of the SQL
// trending_score() in supabase migrations because skills.sh has different
// fundamentals (install counts, not z-scored downloads) AND because we
// apply the AGNT-specific OpenClaw 1.20x boost here. The SQL recompute
// can ignore this score - the leaderboard JSON we publish to Redis ranks
// directly off this value.
//
//   composite = log1p(installs) * recency_decay(last_pushed, 30d-half-life)
//             + VELOCITY_WEIGHT * normalized_rank_delta
// then * OPENCLAW_BOOST iff agents.includes('openclaw')

import type { SkillRow } from './types.js';

export const OPENCLAW_BOOST = 1.20;
export const RECENCY_HALF_LIFE_DAYS = 30;
export const VELOCITY_WEIGHT = 0.25;

export function recencyDecay(lastPushed: Date | null | undefined, halfLifeDays = RECENCY_HALF_LIFE_DAYS): number {
  if (!lastPushed) return 1;
  const ageMs = Date.now() - lastPushed.getTime();
  if (ageMs <= 0) return 1;
  const ageDays = ageMs / 86_400_000;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

export function rankVelocity(
  rankAllTime: number | null | undefined,
  rank24h: number | null | undefined,
  maxRank: number,
): number {
  if (!rankAllTime || !rank24h || maxRank <= 0) return 0;
  // Positive when 24h rank is higher (smaller number) than all-time rank: rising.
  return (rankAllTime - rank24h) / maxRank;
}

export function openclawMultiplier(agents: ReadonlyArray<string>): number {
  return agents.includes('openclaw') ? OPENCLAW_BOOST : 1;
}

export interface CompositeInput {
  installs: number;
  agents: ReadonlyArray<string>;
  lastPushed: Date | null;
  rankAllTime: number | null;
  rank24h: number | null;
  maxRank: number;
}

export function compositeScore(x: CompositeInput): number {
  const installsTerm = Math.log1p(Math.max(0, x.installs));
  const recency = recencyDecay(x.lastPushed);
  const velocity = rankVelocity(x.rankAllTime, x.rank24h, x.maxRank);
  const base = installsTerm * recency + VELOCITY_WEIGHT * velocity;
  return Math.round(base * openclawMultiplier(x.agents) * 1000) / 1000;
}

export interface ScoredSkill extends SkillRow {
  trending_score: number;
  openclaw_compatible: boolean;
  velocity: number | null;
  last_pushed_at: string | null;
}

/** Convenience: score a SkillRow given a maxRank computed across the batch. */
export function scoreRow(row: SkillRow, maxRank: number, lastPushed: Date | null): ScoredSkill {
  const installs = row.installs ?? 0;
  const rankAllTime = row.view === 'all-time' ? row.rank : null;
  const rank24h = row.view === 'trending' ? row.rank : null;
  const trending_score = compositeScore({
    installs,
    agents: row.agents,
    lastPushed,
    rankAllTime,
    rank24h,
    maxRank,
  });
  const velocity = rankVelocity(rankAllTime, rank24h, maxRank);
  return {
    ...row,
    trending_score,
    openclaw_compatible: row.agents.includes('openclaw'),
    velocity: rankAllTime && rank24h ? velocity : null,
    last_pushed_at: lastPushed ? lastPushed.toISOString() : null,
  };
}
