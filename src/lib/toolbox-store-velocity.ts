// TOOLBOX velocity read adapter — Phase A.2 (stars + fork velocity)
//
// Fetches `trending.github.stars.velocity` + `trending.github.fork.velocity`
// from TOOLBOX's /v1/signals/leaderboard, then merges per-repo into a
// `DeltasJson` shape keyed by OSS Insight repo_id (the same shape the
// legacy data-store returns). Reverse-joins TOOLBOX `target_identity`
// (a GitHub URL → owner/name) back to repo_id via `getFullNameToRepoId()`
// from `./trending.ts` — kept lockstep with the live trending cache.
//
// Returns null on any failure so the caller (refreshTrendingFromStore)
// can fall through to the legacy data-store deltas read.
//
// SEMANTIC NOTES:
//
// Earlier trade-offs (stubbed cold-start `age_seconds=0`, missing fork basis)
// were resolved upstream in 2026-05-13 dual-write changes (PR #1186):
// `_toolbox-ingest.mjs` now emits `delta_<win>_age_seconds`,
// `fork_delta_<win>_basis`, and `fork_delta_<win>_age_seconds`. This adapter
// reads those fields directly; `age_seconds` falls back to `0` only when
// the upstream cron hasn't refreshed yet (cold-start data still being
// populated) or when the basis isn't "cold-start" (no age field expected).
//
// `from_commit` and `from_ts` remain stubbed to `""` and `0` — the
// dual-write doesn't transmit them and no downstream consumer reads them
// (recon confirmed in `derived-repos.ts`'s `isRealDelta`).

import "server-only";

import type { DeltasJson, DeltaValue, RepoDeltaEntry } from "./trending";
import { getFullNameToRepoId } from "./trending";
import type { ToolboxEvent, ToolboxFetchOptions } from "./toolbox-store-common";
import {
  extractGithubFullName,
  fetchLeaderboardEvents,
  maxProducedAtMs,
} from "./toolbox-store-common";

export type { ToolboxFetchOptions };

const WINDOWS = ["1h", "24h", "7d", "30d"] as const;
type DeltaWindow = (typeof WINDOWS)[number];

function buildDeltaValue(
  value: unknown,
  basis: unknown,
  ageSeconds: unknown,
): DeltaValue {
  const basisStr = typeof basis === "string" ? basis : "no-history";
  const numValue = typeof value === "number" ? value : null;
  const numAge = typeof ageSeconds === "number" ? ageSeconds : 0;

  switch (basisStr) {
    case "exact":
    case "nearest":
      if (numValue === null) return { value: null, basis: "no-history" };
      return { value: numValue, basis: basisStr, from_commit: "", from_ts: 0 };
    case "cold-start":
      if (numValue === null) return { value: null, basis: "no-history" };
      // age_seconds now read from upstream (PR #1186). Falls back to 0
      // during the rollout window before the next velocity cron fires.
      return {
        value: numValue,
        basis: "cold-start",
        from_commit: "",
        from_ts: 0,
        age_seconds: numAge,
      };
    case "no-history":
    case "repo-not-tracked":
      return { value: null, basis: basisStr };
    default:
      return { value: null, basis: "no-history" };
  }
}

function noHistory(): DeltaValue {
  return { value: null, basis: "no-history" };
}

function createEmptyEntry(): RepoDeltaEntry {
  return {
    stars_now: 0,
    delta_1h: noHistory(),
    delta_24h: noHistory(),
    delta_7d: noHistory(),
    delta_30d: noHistory(),
  };
}

/**
 * Fetch the latest stars + fork velocity from TOOLBOX and merge into a
 * single `DeltasJson` keyed by OSS Insight repo_id. Returns null when
 * BOTH sub-fetches fail (single-side success is fine — adapter returns
 * a partial DeltasJson with only the side that came back).
 */
export async function fetchDeltasFromToolbox(
  opts: ToolboxFetchOptions,
): Promise<DeltasJson | null> {
  const [starsResp, forksResp] = await Promise.all([
    fetchLeaderboardEvents(opts, "trending.github.stars.velocity"),
    fetchLeaderboardEvents(opts, "trending.github.fork.velocity"),
  ]);
  if (!starsResp && !forksResp) return null;

  const reverseMap = getFullNameToRepoId();
  const repos: Record<string, RepoDeltaEntry> = {};
  const allEvents: ToolboxEvent[] = [
    ...(starsResp?.targets ?? []),
    ...(forksResp?.targets ?? []),
  ];

  function lookupRepoId(targetIdentity: string): string | null {
    const fullName = extractGithubFullName(targetIdentity);
    if (!fullName) return null;
    return reverseMap.get(fullName) ?? null;
  }

  // Merge stars side
  for (const ev of starsResp?.targets ?? []) {
    const repoId = lookupRepoId(ev.target_identity);
    if (!repoId) continue;
    const f = ev.fields;
    if (typeof f !== "object" || f === null) continue;

    const entry = repos[repoId] ?? createEmptyEntry();
    if (typeof f.stars_now === "number") entry.stars_now = f.stars_now;
    for (const win of WINDOWS) {
      entry[`delta_${win}` as `delta_${DeltaWindow}`] = buildDeltaValue(
        f[`delta_${win}`],
        f[`delta_${win}_basis`],
        f[`delta_${win}_age_seconds`],
      );
    }
    repos[repoId] = entry;
  }

  // Merge fork side. fork_delta_<win>_basis + fork_delta_<win>_age_seconds
  // are emitted by the dual-write as of PR #1186 (2026-05-13).
  for (const ev of forksResp?.targets ?? []) {
    const repoId = lookupRepoId(ev.target_identity);
    if (!repoId) continue;
    const f = ev.fields;
    if (typeof f !== "object" || f === null) continue;

    const entry = repos[repoId] ?? createEmptyEntry();
    if (typeof f.forks_now === "number") entry.forks_now = f.forks_now;
    for (const win of WINDOWS) {
      const valueKey = `fork_delta_${win}` as `fork_delta_${DeltaWindow}`;
      const basisKey = `fork_delta_${win}_basis`;
      const ageKey = `fork_delta_${win}_age_seconds`;
      entry[valueKey] = buildDeltaValue(f[valueKey], f[basisKey], f[ageKey]);
    }
    repos[repoId] = entry;
  }

  const latestMs = maxProducedAtMs(allEvents);
  return {
    computedAt:
      latestMs > 0 ? new Date(latestMs).toISOString() : new Date().toISOString(),
    // `windows` is recon-confirmed unused by all consumer paths
    // (derived-repos.ts reads only DeltaValue.value + .basis). Returning
    // empty object preserves the type contract.
    windows: {} as DeltasJson["windows"],
    coverage: undefined,
    repos,
  };
}
