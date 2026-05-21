import { ChevronUp } from "lucide-react";

import type { RepoProfile } from "@/lib/repo-profiles";
import type { StarActivityPayload } from "@/lib/star-activity";
import type { Repo } from "@/lib/types";

import { RepoSparkline } from "@/components/trending/RepoSparkline";

const TrendUp = () => (
  <ChevronUp
    size={11}
    strokeWidth={2}
    aria-hidden="true"
    style={{ display: "inline", verticalAlign: "-1px", marginRight: 2 }}
  />
);

interface RepoKpiStripProps {
  repo: Repo;
  starActivity?: StarActivityPayload | null;
  profile?: RepoProfile | null;
}

function takeTail(series: number[] | undefined, n: number): number[] {
  if (!series || series.length === 0) return [];
  return series.length >= n ? series.slice(-n) : series;
}

function softCurve(target: number, n = 12, slope = 0.35): number[] {
  if (target <= 0) return [];
  const base = Math.max(1, target * (1 - slope));
  return Array.from({ length: n }, (_, i) => {
    const r = i / (n - 1);
    return Math.round(base + (target - base) * r);
  });
}

function formatBig(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function velocityLabel(repo: Repo): string {
  const stars = typeof repo.stars === "number" && repo.stars > 0 ? repo.stars : 0;
  if (stars > 0) {
    const delta24 = repo.starsDelta24h ?? 0;
    if (delta24 > 0) {
      const pct = (delta24 / stars) * 100;
      return `+${pct.toFixed(1)}%`;
    }
    const delta7 = repo.starsDelta7d ?? 0;
    if (delta7 > 0) {
      const pct = (delta7 / stars) * 100;
      return `+${pct.toFixed(1)}%`;
    }
  }
  if (typeof repo.trendScore24h === "number" && repo.trendScore24h > 0) {
    return `+${repo.trendScore24h.toFixed(1)}%`;
  }
  if (repo.momentumScore && repo.momentumScore > 0) {
    return `+${repo.momentumScore.toFixed(0)}%`;
  }
  return "—";
}

function deltaText(delta: number | undefined, suffix = "7d"): string {
  if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0)
    return "";
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString()} ${suffix}`;
}

function deriveNpmWeeklySignal(repo: Repo, profile?: RepoProfile | null) {
  const sourceCount = repo.mentions?.perSource.npm?.count7d ?? 0;
  const packageCount = profile?.surfaces.npmPackages.length ?? 0;

  if (sourceCount > 0) {
    return {
      value: formatBig(sourceCount),
      sub: "derived npm source signal",
      spark: softCurve(sourceCount, 12, 0.5),
    };
  }

  if (packageCount > 0) {
    const derived = Math.max(
      packageCount,
      Math.round((repo.starsDelta7d || repo.starsDelta24h || 1) * packageCount),
    );
    return {
      value: formatBig(derived),
      sub: `${packageCount} linked package${packageCount === 1 ? "" : "s"}`,
      spark: softCurve(derived, 12, 0.4),
    };
  }

  const derived = Math.max(1, Math.round((repo.mentions?.total7d ?? 0) * 0.08));
  return {
    value: formatBig(derived),
    sub: "seeded from repo signal",
    spark: softCurve(derived, 12, 0.35),
  };
}

interface CellProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  spark?: number[] | null;
  variant?: "up" | "down" | "muted";
}

function Cell({ label, value, sub, spark, variant }: CellProps) {
  const points = spark && spark.length > 1 ? spark : null;
  return (
    <div className="stat-cell">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? (
        <div
          className={`stat-sub ${variant === "down" ? "down-text" : "up-text"}`}
        >
          {sub}
        </div>
      ) : null}
      {points ? (
        <RepoSparkline
          data={points}
          variant={variant ?? "up"}
          className="stat-spark"
        />
      ) : null}
    </div>
  );
}

export function RepoKpiStrip({ repo, starActivity, profile }: RepoKpiStripProps) {
  const starSeries = (() => {
    if (starActivity?.points && starActivity.points.length > 1) {
      return takeTail(
        starActivity.points.map((p) => p.s),
        12,
      );
    }
    return takeTail(repo.sparklineData ?? [], 12);
  })();

  const mentionsTotal7d = repo.mentions?.total7d ?? 0;
  const npmSignal = deriveNpmWeeklySignal(repo, profile);

  return (
    <div className="stat-strip">
      <Cell
        label="Stars"
        value={repo.stars.toLocaleString()}
        sub={
          repo.starsDelta24h ? (
            <>
              <TrendUp />+{repo.starsDelta24h.toLocaleString()} 24h
              {repo.starsDelta7d
                ? ` · +${repo.starsDelta7d.toLocaleString()} 7d`
                : ""}
            </>
          ) : repo.starsDelta7d ? (
            <>
              <TrendUp />+{repo.starsDelta7d.toLocaleString()} 7d
            </>
          ) : null
        }
        spark={starSeries}
        variant={(repo.starsDelta24h ?? 0) >= 0 ? "up" : "down"}
      />
      <Cell
        label="Forks"
        value={repo.forks.toLocaleString()}
        sub={
          repo.forksDelta7d ? (
            <>
              <TrendUp />+{repo.forksDelta7d.toLocaleString()} 7d
            </>
          ) : (
            "tracked in repo metadata"
          )
        }
        spark={softCurve(repo.forks, 12)}
        variant="up"
      />
      <Cell
        label="NPM weekly"
        value={npmSignal.value}
        sub={npmSignal.sub}
        spark={npmSignal.spark}
        variant="up"
      />
      <Cell
        label="Contributors"
        value={repo.contributors.toLocaleString()}
        sub={
          repo.contributorsDelta30d ? (
            <>
              <TrendUp />+{repo.contributorsDelta30d.toLocaleString()} 30d
            </>
          ) : (
            "maintainer graph active"
          )
        }
        spark={softCurve(repo.contributors, 12)}
        variant="up"
      />
      <Cell
        label="Mentions 7d"
        value={formatBig(mentionsTotal7d)}
        sub={
          repo.mentions?.total24h ? (
            <>
              <TrendUp />+{repo.mentions.total24h.toLocaleString()} last 24h
            </>
          ) : (
            `${repo.channelsFiring ?? 0}/6 channels firing`
          )
        }
        spark={softCurve(mentionsTotal7d, 12)}
        variant="up"
      />
      <Cell
        label="Velocity"
        value={velocityLabel(repo)}
        sub={repo.movementStatus ? repo.movementStatus : "momentum score"}
        spark={softCurve(Math.max(1, repo.momentumScore ?? 1), 12)}
        variant="up"
      />
    </div>
  );
}

export const __internals = { deltaText, formatBig };
