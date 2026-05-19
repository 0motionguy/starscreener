// RepoKpiStrip — 6-cell KPI band: Stars, Forks, NPM weekly, Contributors,
// Mentions 7d, Velocity. Each cell pins a 12-point sparkline bottom-right.
// shell.js renders the SVG inside .spark elements at mount.

import type { Repo } from "@/lib/types";
import type { StarActivityPayload } from "@/lib/star-activity";

import { RepoSparkline } from "@/components/trending/RepoSparkline";

interface RepoKpiStripProps {
  repo: Repo;
  starActivity?: StarActivityPayload | null;
}

/** Pull a tail of N values from a numeric series, falling back to a 0-pad. */
function takeTail(series: number[] | undefined, n: number): number[] {
  if (!series || series.length === 0) return [];
  if (series.length >= n) return series.slice(-n);
  return series;
}

/** Build a soft-curve series from a single value when no real series exists. */
function softCurve(target: number, n = 12): number[] {
  if (target <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = i / (n - 1);
    out.push(Math.round(target * (0.65 + 0.35 * r)));
  }
  return out;
}

function formatBig(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function deltaText(delta: number | undefined, suffix = "7d"): string {
  if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0)
    return "";
  const arrow = delta >= 0 ? "▲" : "▼";
  const cls = delta >= 0 ? "up-text" : "down-text";
  return `${arrow} ${delta > 0 ? "+" : ""}${delta.toLocaleString()} ${suffix} ${cls}`;
}

interface CellProps {
  label: string;
  value: string;
  sub?: string | null;
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

export function RepoKpiStrip({ repo, starActivity }: RepoKpiStripProps) {
  // 12-point cumulative-stars tail.
  const starSeries = (() => {
    if (starActivity?.points && starActivity.points.length > 1) {
      return takeTail(
        starActivity.points.map((p) => p.s),
        12,
      );
    }
    return takeTail(repo.sparklineData ?? [], 12);
  })();

  const forksSpark = softCurve(repo.forks, 12);
  const contribSpark = softCurve(repo.contributors, 12);

  // For NPM / mentions / velocity we have no per-day series yet, so derive
  // a smooth ramp from the headline so the column doesn't look empty.
  const mentionsTotal7d = repo.mentions?.total7d ?? 0;
  const mentionsSpark = softCurve(mentionsTotal7d, 12);

  return (
    <div className="stat-strip">
      <Cell
        label="Stars"
        value={repo.stars.toLocaleString()}
        sub={
          repo.starsDelta24h
            ? `▲ +${repo.starsDelta24h.toLocaleString()} 24h${
                repo.starsDelta7d
                  ? ` · +${repo.starsDelta7d.toLocaleString()} 7d`
                  : ""
              }`
            : repo.starsDelta7d
              ? `▲ +${repo.starsDelta7d.toLocaleString()} 7d`
              : null
        }
        spark={starSeries}
        variant={(repo.starsDelta24h ?? 0) >= 0 ? "up" : "down"}
      />
      <Cell
        label="Forks"
        value={repo.forks.toLocaleString()}
        sub={
          repo.forksDelta7d
            ? `▲ +${repo.forksDelta7d.toLocaleString()} 7d`
            : null
        }
        spark={forksSpark}
        variant="up"
      />
      <Cell
        label="Mentions 7d"
        value={formatBig(mentionsTotal7d)}
        sub={
          repo.mentions?.total24h
            ? `▲ +${repo.mentions.total24h.toLocaleString()} last 24h`
            : null
        }
        spark={mentionsSpark}
        variant="up"
      />
      <Cell
        label="Contributors"
        value={repo.contributors.toLocaleString()}
        sub={
          repo.contributorsDelta30d
            ? `▲ +${repo.contributorsDelta30d.toLocaleString()} 30d`
            : null
        }
        spark={contribSpark}
        variant="up"
      />
      <Cell
        label="Open issues"
        value={repo.openIssues.toLocaleString()}
        sub={null}
        spark={softCurve(repo.openIssues, 12)}
        variant="muted"
      />
      <Cell
        label="Velocity"
        value={
          typeof repo.trendScore24h === "number"
            ? repo.trendScore24h.toFixed(1)
            : repo.momentumScore
              ? repo.momentumScore.toFixed(0)
              : "—"
        }
        sub={repo.movementStatus ? repo.movementStatus : null}
        spark={softCurve(Math.max(1, repo.momentumScore ?? 1), 12)}
        variant="up"
      />
    </div>
  );
}

// Keep deltaText/formatBig exported for tests in a future phase. Reference
// them once so eslint doesn't drop the helpers above as unused exports.
export const __internals = { deltaText, formatBig };
