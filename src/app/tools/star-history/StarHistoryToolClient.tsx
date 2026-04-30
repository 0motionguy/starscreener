"use client";

// /tools/star-history — client island.
//
// Wraps the existing CompareChart so the server page can hand it a top-N
// Repo[] and let users toggle theme/window/scale. ShareBar is plumbed with
// the same state so PNG / SVG / CSV / X / embed all reflect what's on
// screen.
//
// Intentionally thin — chart + share bar only. The server component owns
// the page chrome (PageHead, SectionHead, theme grid, embed snippet).

import { useMemo, useState } from "react";

import { CompareChart } from "@/components/compare/CompareChart";
import type { ChartTheme } from "@/components/compare/themes";
import { ShareBar } from "@/components/share/ShareBar";
import type {
  StarActivityMode,
  StarActivityScale,
} from "@/lib/star-activity";
import type { CsvSeries } from "@/lib/star-activity-url";
import type { Repo } from "@/lib/types";

interface Props {
  repos: Repo[];
}

export function StarHistoryToolClient({ repos }: Props) {
  const [mode, setMode] = useState<StarActivityMode>("date");
  const [scale, setScale] = useState<StarActivityScale>("lin");
  const [theme, setTheme] = useState<ChartTheme>("terminal");

  // CSV from sparkline data — best effort for the demo top-N. Real
  // payload-backed CSV happens on /repo/[owner]/[name]/star-activity.
  const csvSeries: CsvSeries[] = useMemo(() => {
    const today = new Date();
    return repos.map((repo) => {
      const points = repo.sparklineData.map((s, i) => {
        const daysAgo = repo.sparklineData.length - 1 - i;
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - daysAgo);
        return { d: d.toISOString().slice(0, 10), s };
      });
      return { repoId: repo.fullName, points };
    });
  }, [repos]);

  return (
    <div className="repo-detail-stack">
      <CompareChart
        repos={repos}
        mode={mode}
        scale={scale}
        theme={theme}
        onModeChange={setMode}
        onScaleChange={setScale}
        onThemeChange={setTheme}
      />

      <ShareBar
        state={{
          repos: repos.map((r) => r.fullName),
          mode,
          scale,
          legend: "tr",
        }}
        csvSeries={csvSeries}
      />
    </div>
  );
}
