export type FreshnessHealth = "ok" | "advisory" | "stale";

export type FreshnessSourceStatus = "GREEN" | "YELLOW" | "RED" | "DEAD";

export interface FreshnessSourceState {
  status: FreshnessSourceStatus;
  blocking: boolean;
}

// `health` distinguishes the three operator-meaningful states the gate can be
// in: `ok` (everything GREEN), `advisory` (only non-blocking sources have
// degraded), and `stale` (at least one blocking source has degraded).
export function deriveHealth(
  sources: ReadonlyArray<FreshnessSourceState>,
): FreshnessHealth {
  let advisoryDegraded = false;
  for (const source of sources) {
    if (source.status === "GREEN") continue;
    if (source.blocking) return "stale";
    advisoryDegraded = true;
  }
  return advisoryDegraded ? "advisory" : "ok";
}
