"use client";

import { useEffect, useMemo, useState } from "react";

import { CompareChart } from "./CompareChart";
import { CompareSelector } from "./CompareSelector";
import { CompareStatStrip } from "./CompareStatStrip";
import { CompareSharePanel } from "./CompareSharePanel";
import { StarterPackRow } from "./StarterPackRow";
import { useCompareStore } from "@/lib/store";
import { resolveCompareFullNames } from "@/lib/compare-selection";
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

function fullNameToCompareId(fullName: string): string {
  return fullName.replace("/", "--");
}

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

  const fullNames = useMemo(
    () => resolveCompareFullNames(repoIds, repos),
    [repoIds, repos],
  );
  const payloads = useStarActivityPayloads(fullNames);
  const mindsharePctByFullName = useMemo(
    () => buildMindsharePctByFullName(payloads),
    [payloads],
  );

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
    setRepos(fullNamesPicked.map(fullNameToCompareId));
  }

  return (
    <section aria-label="Star history chart" className="tool-workbench compare-wave">
      <div className="panel compare-control-panel">
        <div className="panel-head">
          <span className="key">{`// STAR HISTORY / CHART / ${repoIds.length} SERIES`}</span>
          <span className="right">
            <span className="live">Live</span>
          </span>
        </div>
        <div className="panel-body compare-control-body">
          <CompareSelector />
          <StarterPackRow onPick={handleStarterPick} />
        </div>
      </div>

      <div className="compare-work-grid">
        <div className="compare-chart-stack">
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
              <CompareStatStrip
                repos={repos}
                mindsharePctByFullName={mindsharePctByFullName}
              />
            </>
          ) : (
            <div className="compare-empty-chart">
              {"// pick a starter pack or search above to begin"}
            </div>
          )}
        </div>
        <CompareSharePanel state={shareState} />
      </div>
    </section>
  );
}
