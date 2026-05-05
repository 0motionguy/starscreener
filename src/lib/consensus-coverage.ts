import {
  EXTERNAL_SOURCES,
  type ConsensusExternalSource,
} from "@/lib/consensus-trending";

export const CONSENSUS_MIN_ACTIVE_EXTERNAL_SOURCES = 5;
export const CONSENSUS_MIN_POOL_ITEMS = 40;

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
  for (const source of EXTERNAL_SOURCES) {
    const count = input.sourceStats[source]?.count ?? 0;
    if (count > 0) {
      activeSources += 1;
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

  return {
    starved: reasons.length > 0,
    activeSources,
    inactiveSources,
    reasons,
  };
}
