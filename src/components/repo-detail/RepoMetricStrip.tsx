// 5-up metric strip for the repo-detail hero.
//
// Replaces the legacy stack of `RepoDetailStatsStrip` + `RepoDetailStats` with
// a single 5-card row matching the mockup:
//
//   STARS · FORKS · CONTRIBS · MOMENTUM · SURFACE
//
// Each card carries a label, primary value, sub line (delta + window), and a
// mini sparkline where one applies. SURFACE is a "k of N" card with no spark.
// Reads only from the in-memory Repo + a pre-computed surfaceCount/surfaceTotal
// supplied by the page (the surface map is async, so the page resolves it
// once and passes the count down to keep this component sync).

import type { JSX } from "react";
import { Sparkline } from "@/components/shared/Sparkline";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { Repo } from "@/lib/types";

interface RepoMetricStripProps {
  repo: Repo;
  surfaceCount: number;
  surfaceTotal: number;
}

interface MetricDef {
  label: string;
  value: string;
  delta?: { text: string; positive: boolean };
  sub?: string;
  spark?: number[];
  positive?: boolean;
}

function buildMetrics(
  repo: Repo,
  surfaceCount: number,
  surfaceTotal: number,
): MetricDef[] {
  const stars = repo.stars ?? 0;
  const forks = repo.forks ?? 0;
  const contributors = repo.contributors ?? 0;
  const momentum = repo.momentumScore ?? 0;
  const sd24 = repo.starsDelta24h ?? 0;
  const sd7 = repo.starsDelta7d ?? 0;
  const fd7 = repo.forksDelta7d ?? 0;
  const cd30 = repo.contributorsDelta30d ?? 0;

  // Synthetic 7-point sparks from anchor deltas when no real series.
  const starSpark =
    Array.isArray(repo.sparklineData) && repo.sparklineData.length > 1
      ? repo.sparklineData.slice(-14)
      : synthFromAnchors(stars, sd7, sd7 / 7);
  const forkSpark = synthFromAnchors(forks, fd7, fd7 / 7);
  const contribSpark = synthFromAnchors(contributors, cd30, cd30 / 30);
  const momentumSpark = synthFromAnchors(momentum, momentum * 0.18, momentum * 0.025);

  const surfaceLabel =
    surfaceCount >= surfaceTotal - 1
      ? "BROAD"
      : surfaceCount >= Math.ceil(surfaceTotal / 2)
        ? "MIXED"
        : "THIN";
  const lastCommit = repo.lastCommitAt
    ? `last commit ${getRelativeTime(repo.lastCommitAt)}`
    : "last commit unknown";

  return [
    {
      label: "Stars",
      value: formatNumber(stars),
      delta: {
        text: `${sd7 >= 0 ? "+" : ""}${formatNumber(sd7)} 7d`,
        positive: sd7 >= 0,
      },
      sub: `${sd24 >= 0 ? "+" : ""}${formatNumber(sd24)} today`,
      spark: starSpark,
      positive: sd7 >= 0,
    },
    {
      label: "Forks",
      value: formatNumber(forks),
      delta: {
        text: `${fd7 >= 0 ? "+" : ""}${formatNumber(fd7)} 7d`,
        positive: fd7 >= 0,
      },
      sub: forks > 0
        ? `${Math.round((forks / Math.max(stars, 1)) * 100)}% fork ratio`
        : "no forks tracked",
      spark: forkSpark,
      positive: fd7 >= 0,
    },
    {
      label: "Contribs",
      value: formatNumber(contributors),
      delta: {
        text: `${cd30 >= 0 ? "+" : ""}${formatNumber(cd30)} 30d`,
        positive: cd30 >= 0,
      },
      sub: contributors >= 5 ? "team-led" : "solo-led",
      spark: contribSpark,
      positive: cd30 >= 0,
    },
    {
      label: "Momentum",
      value: momentum.toFixed(1),
      delta: {
        text: `${momentum >= 30 ? "+" : ""}${(momentum * 0.18).toFixed(1)}`,
        positive: momentum >= 30,
      },
      sub: "stars-velocity score",
      spark: momentumSpark,
      positive: momentum >= 30,
    },
    {
      label: "Surface",
      value: surfaceLabel,
      sub: lastCommit,
      delta: {
        text: `${surfaceCount} / ${surfaceTotal}`,
        positive: surfaceCount >= Math.ceil(surfaceTotal / 2),
      },
    },
  ];
}

function synthFromAnchors(
  total: number,
  delta7d: number,
  perDay: number,
): number[] {
  if (total <= 0) return [];
  const start = Math.max(0, total - delta7d);
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(Math.round(start + (delta7d * (i + 1)) / 7 + perDay * i * 0.05));
  }
  return out;
}

export function RepoMetricStrip({
  repo,
  surfaceCount,
  surfaceTotal,
}: RepoMetricStripProps): JSX.Element {
  const metrics = buildMetrics(repo, surfaceCount, surfaceTotal);
  return (
    <div className="repo-metric-strip" role="list" aria-label="Headline metrics">
      {metrics.map((m) => (
        <div key={m.label} role="listitem" className="rms-cell">
          <span className="rms-label">{m.label}</span>
          <span className="rms-value">{m.value}</span>
          {m.delta ? (
            <span
              className={`rms-delta ${m.delta.positive ? "up" : "dn"}`}
            >
              {m.delta.text}
            </span>
          ) : null}
          {m.sub ? <span className="rms-sub">{m.sub}</span> : null}
          {m.spark && m.spark.length > 1 ? (
            <span className="rms-spark" aria-hidden>
              <Sparkline
                data={m.spark}
                width={140}
                height={28}
                positive={m.positive ?? true}
              />
            </span>
          ) : null}
        </div>
      ))}
      <style>{`
        .repo-metric-strip {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }
        @media (max-width: 720px) {
          .repo-metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .rms-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 12px 8px;
          border: 1px solid var(--v3-line-100, rgba(255,255,255,0.08));
          border-radius: 3px;
          background: var(--v3-bg-050, rgba(255,255,255,0.025));
          min-height: 92px;
          position: relative;
          overflow: hidden;
        }
        .rms-label {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--v3-ink-300, rgba(255,255,255,0.7));
        }
        .rms-value {
          font-family: var(--font-geist-mono, monospace);
          font-size: 22px;
          line-height: 1.1;
          color: var(--v3-ink-100, #fff);
          letter-spacing: -0.01em;
        }
        .rms-delta {
          font-family: var(--font-geist-mono, monospace);
          font-size: 11px;
          margin-top: 2px;
        }
        .rms-delta.up { color: var(--sig-green, #22c55e); }
        .rms-delta.dn { color: var(--sig-red, #ef4444); }
        .rms-sub {
          font-family: var(--font-geist-mono, monospace);
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--v3-ink-400, rgba(255,255,255,0.55));
          margin-top: 2px;
          text-transform: uppercase;
        }
        .rms-spark {
          margin-top: auto;
          display: block;
          height: 28px;
        }
        .rms-spark svg { display: block; width: 100%; height: 28px; }
      `}</style>
    </div>
  );
}

export default RepoMetricStrip;
