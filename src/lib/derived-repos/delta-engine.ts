// Delta Engine — the single source-precedence resolver for star-growth
// deltas, shared by both delta-join paths in `derived-repos.ts` (the
// trending-aggregate loop and the registry loop).
//
// WHY this is one module: the homepage Top/Gainer/Trend tabs draw 24h/7d/30d
// deltas from FOUR partial sources that each fail independently. Before this,
// each loop wired its own precedence, which is how an api.ossinsight.io outage
// silently blanked every 7d/30d delta (the registry path had no GitHub-direct
// fallback). Centralising precedence here means one definition, one test.
//
// Sources per (repo, window):
//   oss  — OSS Insight live bucket (aggregate.hasXX). Intraday-fresh, but dies
//          whole when api.ossinsight.io 500s. Only the aggregate loop has it.
//   sa   — star-activity-derived (GitHub-direct, deep daily history). Survives
//          OSS Insight outages. AUTHORITATIVE for 7d/30d.
//   snap — snapshot-ring / TOOLBOX velocity (the `deltas` slug). Real only
//          within the ring's depth; 7d/30d there are almost always cold-start.
//
// Precedence:
//   24h    → oss → snap → sa   (preserve today's behavior; sa as extra net)
//   7d/30d → sa → oss → snap    (sa primary so they survive an OSS outage)
//
// `value`/`missing` gate the DISPLAY (real bases only — a cold-start renders
// "—"). `rank` feeds trendScore and tolerates a cold-start number so Gainer
// (trendScore24h) and Trend (trendScore30d) still order when display is "—".

import type { DeltaValue } from "../trending";
import type { SADeltaValue } from "../star-activity-deltas";

export type DeltaWindow = "24h" | "7d" | "30d";

export interface OssBucket {
  has: boolean;
  value: number;
}

export interface ResolvedDelta {
  /** Displayed delta — real sources only (0 when nothing real). */
  value: number;
  /** True when no real source exists → the UI shows "—". */
  missing: boolean;
  /** Ranking value for trendScore — tolerates a cold-start number. */
  rank: number;
}

/** A snapshot/TOOLBOX delta is "real" (shown) only when non-null and not cold-start. */
export function isRealSnap(d: DeltaValue | undefined): boolean {
  return !!d && d.value !== null && d.basis !== "cold-start";
}

/** Raw snapshot/TOOLBOX value for ranking — cold-start tolerated, null → 0. */
export function rawSnap(d: DeltaValue | undefined): number {
  return !d || d.value === null ? 0 : d.value;
}

/** A star-activity delta is "real" (shown) only when non-null and not cold-start. */
export function isRealSA(d: SADeltaValue | undefined): boolean {
  return !!d && d.value !== null && d.basis !== "cold-start";
}

/** Raw star-activity value for ranking — cold-start tolerated, null → 0. */
export function rawSA(d: SADeltaValue | undefined): number {
  return !d || d.value === null ? 0 : d.value;
}

/**
 * Resolve one (repo, window) delta from the available sources per the
 * precedence above. Pure — no IO, deterministic.
 */
export function resolveDelta(
  window: DeltaWindow,
  oss: OssBucket,
  sa: SADeltaValue | undefined,
  snap: DeltaValue | undefined,
): ResolvedDelta {
  const saReal = isRealSA(sa);
  const snapReal = isRealSnap(snap);

  if (window === "24h") {
    if (oss.has) return { value: oss.value, missing: false, rank: oss.value };
    if (snapReal) {
      const v = snap!.value as number;
      return { value: v, missing: false, rank: v };
    }
    if (saReal) {
      const v = sa!.value as number;
      return { value: v, missing: false, rank: v };
    }
    return { value: 0, missing: true, rank: rawSnap(snap) || rawSA(sa) };
  }

  // 7d / 30d — star-activity is the authoritative GitHub-direct source.
  if (saReal) {
    const v = sa!.value as number;
    return { value: v, missing: false, rank: v };
  }
  if (oss.has) return { value: oss.value, missing: false, rank: oss.value };
  if (snapReal) {
    const v = snap!.value as number;
    return { value: v, missing: false, rank: v };
  }
  return { value: 0, missing: true, rank: rawSA(sa) || rawSnap(snap) };
}
