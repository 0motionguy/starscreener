"use client";

// Client wrapper for the single-repo Star Activity sub-route.
//
// Owns the mode/scale toggle state so the chart and the ShareBar see the
// same source of truth. The page-level URL state is intentionally NOT
// updated on toggle changes — the user can copy the link to share whatever
// state the chart is currently in via the Copy Link button. (Wiring URL
// pushState here would force a server re-render on every toggle which
// makes the chart feel sluggish.)

import { useMemo, useState } from "react";

import { CompareChart } from "@/components/compare/CompareChart";
import { ShareBar } from "@/components/share/ShareBar";
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
    () =>
      payload
        ? { [repo.fullName.toLowerCase()]: payload }
        : undefined,
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
    <div className="flex flex-col gap-4">
      <CompareChart
        repos={[repo]}
        payloads={payloads}
        mode={mode}
        scale={scale}
        onModeChange={setMode}
        onScaleChange={setScale}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Today" value={today.toLocaleString("en-US")} />
        <Stat label="Peak/day" value={`+${peakDelta.toLocaleString("en-US")}`} />
        <Stat label="Momentum" value={repo.momentumScore.toFixed(2)} />
        <Stat label="Since" value={since ?? "—"} />
      </div>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border-primary bg-bg-secondary px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-base font-mono font-semibold text-text-primary">
        {value}
      </div>
    </div>
  );
}
