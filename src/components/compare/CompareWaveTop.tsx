"use client";

import { useEffect, useMemo, useState } from "react";

import { CompareChart } from "./CompareChart";
import { CompareSelector } from "./CompareSelector";
import { CompareStatStrip } from "./CompareStatStrip";
import { CompareSharePanel } from "./CompareSharePanel";
import { StarterPackRow } from "./StarterPackRow";
// Inline minimal Repo stub so we don't drag node:fs/node:path from
// @/lib/collections into this client component. Mirrors buildCuratedStub
// shape for the no-data case the chart already handles.
function buildLightStub(fullName: string): Repo {
  const [owner, name] = fullName.split("/");
  return {
    id: fullName.toLowerCase().replace("/", "--"),
    fullName,
    name: name ?? fullName,
    owner: owner ?? "",
    ownerAvatarUrl: "",
    description: "",
    url: `https://github.com/${fullName}`,
    language: null,
    topics: [],
    categoryId: "",
    stars: 0,
    forks: 0,
    contributors: 0,
    openIssues: 0,
    lastCommitAt: "",
    lastReleaseAt: null,
    lastReleaseTag: null,
    createdAt: "",
    starsDelta24h: 0,
    starsDelta7d: 0,
    starsDelta30d: 0,
    forksDelta7d: 0,
    contributorsDelta30d: 0,
    hasMovementData: false,
    starsDelta24hMissing: true,
    starsDelta7dMissing: true,
    starsDelta30dMissing: true,
    forksDelta7dMissing: true,
    contributorsDelta30dMissing: true,
    momentumScore: 0,
    movementStatus: "stable",
    rank: 0,
    categoryRank: 0,
    sparklineData: [],
    socialBuzzScore: 0,
    mentionCount24h: 0,
  };
}
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
  const router = useRouter();
  const pathname = usePathname();

  // Star History parity: render the chart for ANY selected repos, even ones
  // not in our local trending feed. If `/api/repos?ids=` didn't return a
  // hit (e.g. `facebook/react` isn't tracked), synthesize a curated stub
  // so the chart line still renders from `payloads` (when present) or the
  // sparkline placeholder. Without this the chart silently disappears for
  // any URL like `?repos=facebook/react,vercel/next.js`.
  const reposByIdLower = useMemo(() => {
    const m = new Map<string, Repo>();
    for (const r of repos) m.set(r.id.toLowerCase(), r);
    return m;
  }, [repos]);

  const displayRepos = useMemo<Repo[]>(
    () =>
      repoIds.map(
        (id) =>
          reposByIdLower.get(id.toLowerCase()) ??
          buildLightStub(compareIdToFallbackFullName(id)),
      ),
    [repoIds, reposByIdLower],
  );

  const fullNames = useMemo(
    () => resolveCompareFullNames(repoIds, displayRepos),
    [repoIds, displayRepos],
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

  // Star History parity: keep `?repos=owner/name,owner/name` in sync with
  // the picker so a copy-pasted URL reproduces the selection. Uses
  // router.replace so the back button doesn't accumulate history entries
  // for every pill add/remove. Only writes once we've resolved fullNames
  // (the stub fallback ensures that's the same instant the store changes).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname) return;
    const params = new URLSearchParams(window.location.search);
    const next = fullNames.join(",");
    const current = params.get("repos") ?? "";
    if (next === current) return;
    if (next) params.set("repos", next);
    else params.delete("repos");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [fullNames, pathname, router]);

  function handleStarterPick(fullNamesPicked: string[]) {
    setRepos(fullNamesPicked.map(fullNameToCompareId));
  }

  const hasSelection = repoIds.length > 0;

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
                repos={displayRepos}
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
