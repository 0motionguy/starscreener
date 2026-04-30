"use client";

// /compare wave-top section (W3.L) — the redesigned headline:
// search + tab toggles + COMPARING pills + STARTER PACKS + chart + stat strip
// + right-rail SHARE panel. Sits above the existing CompareProfileGrid /
// CompareClient sections which stay as deeper-dive surfaces.
//
// State source of truth: Zustand `useCompareStore` (already persisted across
// sessions, already used by the rest of the page). We layer chart-only UI
// state (metric / window / mode / scale / theme) as local component state.
//
// Data: payloads fetched client-side from /api/compare/payloads (Redis
// lookup). Repo metadata for fullName/stars/delta24h/rank fetched in-line
// via the same useCompareRepos pattern CompareClient already uses below.

import { useEffect, useMemo, useState } from "react";

import { CompareChart } from "./CompareChart";
import { CompareSelector } from "./CompareSelector";
import { CompareStatStrip } from "./CompareStatStrip";
import { CompareSharePanel } from "./CompareSharePanel";
import { StarterPackRow } from "./StarterPackRow";
import { useCompareStore } from "@/lib/store";
import {
  compareIdToFallbackFullName,
  resolveCompareFullNames,
} from "@/lib/compare-selection";
import type { Repo } from "@/lib/types";
import type {
  StarActivityMetric,
  StarActivityMode,
  StarActivityPayload,
  StarActivityScale,
  StarActivityWindow,
} from "@/lib/star-activity";
import type { ChartTheme } from "./themes";

interface PayloadRow {
  fullName: string;
  payload: StarActivityPayload | null;
}

interface ApiPayloadsResponse {
  ok: boolean;
  rows?: PayloadRow[];
}

interface UseCompareReposResult {
  repos: Repo[];
  isLoading: boolean;
}

/**
 * Hydrate an `ordered Repo[]` from the cart store via the same /api/repos
 * lookup CompareClient does. Lifted here to keep the wave section
 * self-contained without taking a hard dep on CompareClient internals.
 */
function useCompareRepos(repoIds: string[]): UseCompareReposResult {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (repoIds.length === 0) {
      setRepos([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const idsParam = encodeURIComponent(repoIds.join(","));
        const res = await fetch(`/api/repos?ids=${idsParam}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        setRepos(Array.isArray(data.repos) ? data.repos : []);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare-wave] /api/repos failed", err);
        setRepos([]);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [repoIds]);

  return { repos, isLoading };
}

/** Same pattern, but for star-activity payloads keyed by fullName. */
function useStarActivityPayloads(
  fullNames: string[],
): Record<string, StarActivityPayload> {
  const [byFullName, setByFullName] = useState<
    Record<string, StarActivityPayload>
  >({});

  useEffect(() => {
    if (fullNames.length === 0) {
      setByFullName({});
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const param = encodeURIComponent(fullNames.join(","));
        const res = await fetch(`/api/compare/payloads?repos=${param}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as ApiPayloadsResponse;
        const map: Record<string, StarActivityPayload> = {};
        for (const row of data.rows ?? []) {
          if (row.payload) map[row.fullName.toLowerCase()] = row.payload;
        }
        setByFullName(map);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[compare-wave] /api/compare/payloads failed", err);
      }
    })();
    return () => controller.abort();
  }, [fullNames]);

  return byFullName;
}

/**
 * Convert "owner/name" → "owner--name" for the compare store, which
 * persists slug-style IDs. The starter-pack picker hands fullNames, so
 * we normalize before pushing to the store.
 */
function fullNameToCompareId(fullName: string): string {
  return fullName.replace("/", "--");
}

/** Mindshare % per repo at the latest snapshot — for the stat strip. */
function buildMindsharePctByFullName(
  payloads: Record<string, StarActivityPayload>,
): Record<string, number> {
  let total = 0;
  const latestByFullName: Record<string, number> = {};
  for (const [key, p] of Object.entries(payloads)) {
    const last = p.points[p.points.length - 1];
    if (!last) continue;
    latestByFullName[key] = last.s;
    total += last.s;
  }
  if (total === 0) return {};
  const out: Record<string, number> = {};
  for (const [key, latest] of Object.entries(latestByFullName)) {
    out[key] = (latest / total) * 100;
  }
  return out;
}

export function CompareWaveTop() {
  const repoIds = useCompareStore((s) => s.repos);
  const setRepos = useCompareStore((s) => s.setRepos);

  const { repos } = useCompareRepos(repoIds);

  // For the payloads fetch we need owner/name slugs. Prefer the live Repo[]
  // (preserves casing); fall back to compareIdToFallbackFullName if the
  // /api/repos response hasn't landed yet.
  const fullNames = useMemo(
    () => resolveCompareFullNames(repoIds, repos),
    [repoIds, repos],
  );
  const payloads = useStarActivityPayloads(fullNames);
  const mindsharePctByFullName = useMemo(
    () => buildMindsharePctByFullName(payloads),
    [payloads],
  );

  // Chart-only UI state. Parallel to URL state — could be lifted later;
  // for v1 the user changes via toggles and copies the link from the
  // share panel which serializes everything as querystring.
  const [metric, setMetric] = useState<StarActivityMetric>("stars");
  const [chartWindow, setChartWindow] = useState<StarActivityWindow>("all");
  const [mode, setMode] = useState<StarActivityMode>("date");
  const [scale, setScale] = useState<StarActivityScale>("lin");
  const [theme, setTheme] = useState<ChartTheme>("terminal");

  const shareState = {
    repos: fullNames,
    metric,
    window: chartWindow,
    mode,
    scale,
    theme,
  };

  function handleStarterPick(fullNamesPicked: string[]) {
    const ids = fullNamesPicked.map(fullNameToCompareId);
    setRepos(ids);
  }

  return (
    <section
      aria-label="Star history chart"
      className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-4"
    >
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {`// STAR HISTORY · CHART · ${repoIds.length} SERIES`}
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-up inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-up"
          />
          Live
        </span>
      </div>

      {/* Search + COMPARING pills (CompareSelector) */}
      <CompareSelector />

      {/* Starter pack chip row */}
      <div className="mt-3">
        <StarterPackRow onPick={handleStarterPick} />
      </div>

      {/* Chart + share panel side-by-side on desktop, stacked on mobile */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="min-w-0">
          {repos.length > 0 ? (
            <>
              <CompareChart
                repos={repos}
                payloads={payloads}
                metric={metric}
                window={chartWindow}
                mode={mode}
                scale={scale}
                theme={theme}
                onMetricChange={setMetric}
                onWindowChange={setChartWindow}
                onModeChange={setMode}
                onScaleChange={setScale}
                onThemeChange={setTheme}
              />
              <div className="mt-3">
                <CompareStatStrip
                  repos={repos}
                  mindsharePctByFullName={mindsharePctByFullName}
                />
              </div>
            </>
          ) : (
            <div className="rounded-card border border-border-primary bg-bg-secondary px-4 py-10 text-center text-sm font-mono text-text-tertiary">
              {"// pick a starter pack or search above to begin"}
            </div>
          )}
        </div>
        <CompareSharePanel state={shareState} />
      </div>
    </section>
  );
}
