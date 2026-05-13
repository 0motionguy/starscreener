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
// SEMANTIC TRADE-OFFS WORTH KNOWING:
//
// 1. **Cold-start `age_seconds` stub**. The dual-write in trendingrepo's
//    `scripts/_toolbox-ingest.mjs` doesn't transmit `age_seconds` (or
//    `from_commit` / `from_ts`). The local `DeltaValue` discriminated
//    union requires `age_seconds: number` on the cold-start variant.
//    This adapter stubs `age_seconds: 0` / `from_commit: ""` / `from_ts: 0`.
//    Runtime semantic is preserved — `derived-repos.ts`'s `isRealDelta`
//    helper (which only reads `.value` + `.basis`) correctly returns
//    `false` for cold-start, so consumers fall back to alternative
//    sources. The lost metadata (commit hash, exact timestamp, age) is
//    not consumed downstream by any path observed during recon. If a
//    consumer starts reading `age_seconds` later, the stubbed `0` will
//    underrepresent the actual age. Upstream fix: extend the dual-write
//    to emit `age_seconds` for cold-start basis (and ideally `from_ts`
//    for all variants).
//
// 2. **Fork basis is LOST in transit**. The dual-write at lines 580-596
//    of `_toolbox-ingest.mjs` sends fork deltas as just `fork_delta_<win>`
//    (the value) — it does NOT send a corresponding `fork_delta_<win>_basis`
//    field, unlike the stars side. This adapter therefore receives no
//    basis for fork deltas and treats them as `basis: "no-history"`
//    (which makes `isRealDelta` return false → consumers fall back).
//    Upstream fix: add `pushNormalized(forkNormalized, \`fork_delta_${win}_basis\`, d.basis, 1.0)`
//    in the dual-write.

import "server-only";

import type { DeltasJson, DeltaValue, RepoDeltaEntry } from "./trending";
import { getFullNameToRepoId } from "./trending";

const DEFAULT_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 8_000;

interface ToolboxEvent {
  target_id: string;
  target_kind: string;
  target_identity: string;
  scan_id: string;
  run_id: string;
  signal_type: string;
  produced_at: string;
  fields: Record<string, unknown>;
}

interface ToolboxLeaderboardResponse {
  count: number;
  targets: ToolboxEvent[];
}

export interface ToolboxFetchOptions {
  apiUrl: string;
  apiKey: string;
  limit?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function extractGithubFullName(targetIdentity: string): string | null {
  try {
    const url = new URL(targetIdentity);
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

async function fetchLeaderboardEvents(
  opts: ToolboxFetchOptions,
  signalType: string,
): Promise<ToolboxLeaderboardResponse | null> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  const base = opts.apiUrl.replace(/\/+$/, "");
  const url = `${base}/v1/signals/leaderboard?type=${encodeURIComponent(signalType)}&limit=${limit}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        accept: "application/json",
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ToolboxLeaderboardResponse;
    if (!body || !Array.isArray(body.targets)) return null;
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const WINDOWS = ["1h", "24h", "7d", "30d"] as const;
type DeltaWindow = (typeof WINDOWS)[number];

function buildDeltaValue(value: unknown, basis: unknown): DeltaValue {
  const basisStr = typeof basis === "string" ? basis : "no-history";
  const numValue = typeof value === "number" ? value : null;

  switch (basisStr) {
    case "exact":
    case "nearest":
      if (numValue === null) return { value: null, basis: "no-history" };
      return { value: numValue, basis: basisStr, from_commit: "", from_ts: 0 };
    case "cold-start":
      if (numValue === null) return { value: null, basis: "no-history" };
      // age_seconds stubbed to 0. See file header trade-off note (1).
      return {
        value: numValue,
        basis: "cold-start",
        from_commit: "",
        from_ts: 0,
        age_seconds: 0,
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

function maxProducedAtMs(events: ToolboxEvent[]): number {
  let max = 0;
  for (const ev of events) {
    const t = Date.parse(ev.produced_at);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
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
      );
    }
    repos[repoId] = entry;
  }

  // Merge fork side. See file header trade-off note (2): the dual-write
  // doesn't send fork basis strings, so all fork deltas come through as
  // basis: "no-history" via buildDeltaValue's default-case.
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
      entry[valueKey] = buildDeltaValue(f[valueKey], f[basisKey]);
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
