import {
  EXTERNAL_SOURCES,
  type ConsensusExternalSource,
} from "@/lib/consensus-trending";

export const CONSENSUS_MIN_ACTIVE_EXTERNAL_SOURCES = 5;
export const CONSENSUS_MIN_POOL_ITEMS = 40;
export const CONSENSUS_REQUIRE_ALL_EXTERNAL_SOURCES = true;
export const CONSENSUS_MAX_SOURCE_SKEW_RATIO = 20;

export interface ConsensusCoverageInput {
  itemCount: number;
  sourceStats: Record<ConsensusExternalSource, { count: number; rows: number }>;
}

export interface ConsensusCoverage {
  starved: boolean;
  activeSources: number;
  inactiveSources: ConsensusExternalSource[];
  reasons: string[];
}

export function evaluateConsensusCoverage(
  input: ConsensusCoverageInput,
): ConsensusCoverage {
  const inactiveSources: ConsensusExternalSource[] = [];
  let activeSources = 0;
  const activeCounts: number[] = [];
  for (const source of EXTERNAL_SOURCES) {
    const count = input.sourceStats[source]?.count ?? 0;
    if (count > 0) {
      activeSources += 1;
      activeCounts.push(count);
      continue;
    }
    inactiveSources.push(source);
  }

  const reasons: string[] = [];
  if (activeSources < CONSENSUS_MIN_ACTIVE_EXTERNAL_SOURCES) {
    reasons.push(
      `active external sources ${activeSources}/8 below minimum ${CONSENSUS_MIN_ACTIVE_EXTERNAL_SOURCES}/8`,
    );
  }
  if (input.itemCount < CONSENSUS_MIN_POOL_ITEMS) {
    reasons.push(
      `pool size ${input.itemCount} below minimum ${CONSENSUS_MIN_POOL_ITEMS}`,
    );
  }
  if (CONSENSUS_REQUIRE_ALL_EXTERNAL_SOURCES && inactiveSources.length > 0) {
    reasons.push(`missing external sources: ${inactiveSources.join(",")}`);
  }
  if (activeCounts.length > 1) {
    const maxCount = Math.max(...activeCounts);
    const minCount = Math.min(...activeCounts);
    const skewRatio = minCount > 0 ? maxCount / minCount : Number.POSITIVE_INFINITY;
    if (skewRatio > CONSENSUS_MAX_SOURCE_SKEW_RATIO) {
      reasons.push(
        `source skew ${skewRatio.toFixed(1)}x exceeds ${CONSENSUS_MAX_SOURCE_SKEW_RATIO}x`,
      );
    }
  }

  return {
    starved: reasons.length > 0,
    activeSources,
    inactiveSources,
    reasons,
  };
}
