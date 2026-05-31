// RepoKpiStrip — six KPI cells. Sparklines render ONLY when a REAL
// time-series is available (currently Stars, via star-activity). The other
// five cells show their real value + real delta with no sparkline, because
// the underlying time series doesn't exist on the data spine (no per-day
// forks / contributors / per-day velocity), or because the metric is a
// snapshot rather than a series (License, Stack).

import { Icon } from "@/lib/icons";

import type { RepoCommunityProfile } from "@/lib/repo-community-profile";
import type { StarActivityPayload } from "@/lib/star-activity-shared";
import type { Repo } from "@/lib/types";
import { formatVelocityPct } from "@/lib/velocity-pct";

import { RepoSparkline } from "@/components/trending/RepoSparkline";

const TrendUp = () => (
  <Icon
    name="chevron-up"
    size={11}
    style={{ display: "inline", verticalAlign: "-1px", marginRight: 2 }}
  />
);

interface RepoKpiStripProps {
  repo: Repo;
  starActivity?: StarActivityPayload | null;
  community?: RepoCommunityProfile | null;
}

function takeTail(series: number[] | undefined, n: number): number[] {
  if (!series || series.length === 0) return [];
  return series.length >= n ? series.slice(-n) : series;
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
      const p = formatVelocityPct(delta24, stars);
      if (p) return p;
    }
    const delta7 = repo.starsDelta7d ?? 0;
    if (delta7 > 0) {
      const p = formatVelocityPct(delta7, stars);
      if (p) return p;
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
          className={`stat-sub ${
            variant === "down"
              ? "down-text"
              : variant === "muted"
                ? "muted"
                : "up-text"
          }`}
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
      ) : (
        <div className="stat-spark-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}

export function RepoKpiStrip({
  repo,
  starActivity,
  community,
}: RepoKpiStripProps) {
  // ---- Stars: REAL series from star-activity (cumulative count per day).
  const starSeries = (() => {
    if (starActivity?.points && starActivity.points.length > 1) {
      return takeTail(
        starActivity.points.map((p) => p.s),
        14,
      );
    }
    return null;
  })();

  // ---- License: SPDX id when GitHub reports a license file, "—" otherwise.
  const license = community?.license ?? null;
  const licenseValue = license?.spdxId ?? "—";
  const licenseSub = license?.name ?? "no license file";

  // ---- Stack: top language from the community/languages bytes breakdown.
  const languages = community?.languages?.languages ?? [];
  const topLanguage = languages[0] ?? null;
  const stackValue = topLanguage?.name ?? "—";
  const stackSub = (() => {
    if (!topLanguage) return "not yet fetched";
    if (languages.length === 1) return "the only tracked language";
    return `${topLanguage.percent.toFixed(1)}% of codebase`;
  })();

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
          ) : (
            "stargazer pipeline live"
          )
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
        spark={null}
        variant="up"
      />
      <Cell
        label="License"
        value={licenseValue}
        sub={licenseSub}
        spark={null}
        variant={license ? "up" : "muted"}
      />
      <Cell
        label="Stack"
        value={stackValue}
        sub={stackSub}
        spark={null}
        variant={topLanguage ? "up" : "muted"}
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
        spark={null}
        variant="up"
      />
      <Cell
        label="Velocity"
        value={velocityLabel(repo)}
        sub={repo.movementStatus ? repo.movementStatus : "momentum score"}
        spark={null}
        variant="up"
      />
    </div>
  );
}

export const __internals = { formatBig };
