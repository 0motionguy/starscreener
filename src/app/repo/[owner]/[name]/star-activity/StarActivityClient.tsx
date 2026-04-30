"use client";

// Client wrapper for the single-repo Star Activity sub-route.
//
// Owns the mode/scale toggle state so the chart and ShareBar see the same
// source of truth. The page-level URL state is intentionally not updated on
// toggle changes because pushing a URL update would force a server re-render.

import { useMemo, useState } from "react";

import { CompareChart } from "@/components/compare/CompareChart";
import { ShareBar } from "@/components/share/ShareBar";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import {
  type StarActivityMode,
  type StarActivityPayload,
  type StarActivityScale,
} from "@/lib/star-activity";
import type { CsvSeries } from "@/lib/star-activity-url";
import type { Repo } from "@/lib/types";

interface Props {
  repo: Repo;
  payload: StarActivityPayload | null;
}

export function StarActivityClient({ repo, payload }: Props) {
  const [mode, setMode] = useState<StarActivityMode>("date");
  const [scale, setScale] = useState<StarActivityScale>("lin");

  const payloads = useMemo(
    () => (payload ? { [repo.fullName.toLowerCase()]: payload } : undefined),
    [payload, repo.fullName],
  );

  const csvSeries: CsvSeries[] = useMemo(
    () =>
      payload && payload.points.length > 0
        ? [
            {
              repoId: repo.fullName,
              points: payload.points.map((p) => ({ d: p.d, s: p.s })),
            },
          ]
        : [],
    [payload, repo.fullName],
  );

  const peakDelta = useMemo(() => {
    if (!payload) return 0;
    let max = 0;
    for (const p of payload.points) {
      if (p.delta > max) max = p.delta;
    }
    return max;
  }, [payload]);

  const since = payload?.points[0]?.d ?? null;
  const today = payload?.points[payload.points.length - 1]?.s ?? repo.stars;

  return (
    <div className="repo-detail-stack">
      <CompareChart
        repos={[repo]}
        payloads={payloads}
        mode={mode}
        scale={scale}
        onModeChange={setMode}
        onScaleChange={setScale}
      />

      <MetricGrid columns={4} className="kpi-band">
        <Metric label="Today" value={today.toLocaleString("en-US")} sub="stars" />
        <Metric
          label="Peak/day"
          value={`+${peakDelta.toLocaleString("en-US")}`}
          sub="daily max"
          tone="positive"
          pip
        />
        <Metric
          label="Momentum"
          value={repo.momentumScore.toFixed(2)}
          sub="terminal score"
          tone="accent"
        />
        <Metric label="Since" value={since ?? "-"} sub="first point" />
      </MetricGrid>

      <ShareBar
        state={{
          repos: [repo.fullName],
          mode,
          scale,
          legend: "tr",
        }}
        csvSeries={csvSeries}
      />
    </div>
  );
}
