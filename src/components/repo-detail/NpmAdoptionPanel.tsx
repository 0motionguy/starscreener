import type { JSX } from "react";
import { Download, ExternalLink, Package, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NpmPackageRow } from "@/lib/npm";
import type { DailyDownload } from "@/lib/npm-daily";
import { formatNumber, getRelativeTime } from "@/lib/utils";

interface NpmAdoptionPanelProps {
  packages: NpmPackageRow[];
  /**
   * Optional 30-day daily-download series keyed by package name.
   * Populated server-side from .data/npm-daily.jsonl; when absent the panel
   * just skips the sparkline (graceful fallback for cold-boot / tests).
   */
  dailyDownloads?: Record<string, DailyDownload[]>;
  /**
   * Optional dependents counts keyed by package name. `null` means
   * "known-unknown" (npm has no reliable public API) — don't render.
   */
  dependentsByPackage?: Record<string, number | null>;
}

type DownloadWindow = "24h" | "7d" | "30d";

interface WindowMetric {
  label: DownloadWindow;
  downloads: number;
  delta: number;
  previous: number;
  icon: LucideIcon;
}

function sum(packages: NpmPackageRow[], selector: (pkg: NpmPackageRow) => number) {
  return packages.reduce((total, pkg) => total + Math.max(0, selector(pkg) || 0), 0);
}

function formatSignedNumber(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function percentDelta(delta: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (delta / previous) * 100;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(value >= 100 ? 0 : 1)}%`;
}

function toneForDelta(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function windowMetric(packages: NpmPackageRow[], label: DownloadWindow): WindowMetric {
  if (label === "24h") {
    return {
      label,
      downloads: sum(packages, (pkg) => pkg.downloads24h),
      delta: packages.reduce((total, pkg) => total + (pkg.delta24h || 0), 0),
      previous: sum(packages, (pkg) => pkg.previous24h),
      icon: Download,
    };
  }
  if (label === "7d") {
    return {
      label,
      downloads: sum(packages, (pkg) => pkg.downloads7d),
      delta: packages.reduce((total, pkg) => total + (pkg.delta7d || 0), 0),
      previous: sum(packages, (pkg) => pkg.previous7d),
      icon: TrendingUp,
    };
  }
  return {
    label,
    downloads: sum(packages, (pkg) => pkg.downloads30d),
    delta: packages.reduce((total, pkg) => total + (pkg.delta30d || 0), 0),
    previous: sum(packages, (pkg) => pkg.previous30d),
    icon: Package,
  };
}

function deltaColor(delta: number): string {
  const tone = toneForDelta(delta);
  if (tone === "up") return "var(--v4-money)";
  if (tone === "down") return "var(--v4-red)";
  return "var(--v4-ink-400)";
}

/**
 * Render a compact 30-day sparkline as an inline SVG polyline.
 *
 * Zero-width stroke / zero-only series render as a flat mid-line rather
 * than a div-by-zero NaN. Uses var(--v4-ink-300) via the SVG color attr.
 */
function Sparkline({ series }: { series: DailyDownload[] }): JSX.Element | null {
  if (series.length < 2) return null;
  const width = 160;
  const height = 36;
  const pad = 2;
  const values = series.map((point) => point.downloads);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (series.length - 1);
  const points = series
    .map((point, idx) => {
      const x = pad + idx * stepX;
      const y = height - pad - ((point.downloads - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ color: "var(--v4-ink-300)" }}
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NpmAdoptionPanel({
  packages,
  dailyDownloads,
  dependentsByPackage,
}: NpmAdoptionPanelProps): JSX.Element | null {
  if (packages.length === 0) return null;

  const metrics: WindowMetric[] = [
    windowMetric(packages, "24h"),
    windowMetric(packages, "7d"),
    windowMetric(packages, "30d"),
  ];
  const rankedPackages = packages
    .slice()
    .sort((a, b) => {
      const by7d = b.downloads7d - a.downloads7d;
      if (by7d !== 0) return by7d;
      return b.downloads24h - a.downloads24h;
    });
  const topPackage = rankedPackages[0];
  const topSeries =
    topPackage && dailyDownloads ? dailyDownloads[topPackage.name] ?? null : null;

  return (
    <section
      aria-label="npm adoption"
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        <Package
          size={12}
          style={{ color: "var(--v4-acc)", flexShrink: 0 }}
          aria-hidden
        />
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--v4-ink-200)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// NPM ADOPTION · PACKAGE DOWNLOADS"}
        </span>
        <span
          style={{
            flexShrink: 0,
            color: "var(--v4-ink-300)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {packages.length} PACKAGE{packages.length === 1 ? "" : "S"}
        </span>
      </div>

      <div className="p-4">
        <p
          className="mb-4"
          style={{ fontSize: 12, color: "var(--v4-ink-300)" }}
        >
          Real registry download windows for npm packages linked or related to
          this repo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const pct = percentDelta(metric.delta, metric.previous);
            const dColor = deltaColor(metric.delta);
            return (
              <div
                key={metric.label}
                className="p-3"
                style={{
                  border: "1px solid var(--v4-line-200)",
                  background: "var(--v4-bg-050)",
                  borderRadius: 2,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--v4-ink-400)",
                    }}
                  >
                    <Icon className="size-3" aria-hidden />
                    {metric.label}
                  </span>
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 11,
                      color: dColor,
                    }}
                  >
                    {formatPercent(pct)}
                  </span>
                </div>
                <p
                  className="mt-2 tabular-nums"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 24,
                    fontWeight: 600,
                    lineHeight: 1,
                    color: "var(--v4-ink-100)",
                  }}
                >
                  {formatNumber(metric.downloads)}
                </p>
                <p
                  className="mt-1 tabular-nums"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: dColor,
                  }}
                >
                  {formatSignedNumber(metric.delta)}
                  <span style={{ marginLeft: 4, color: "var(--v4-ink-400)" }}>
                    vs previous
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--v4-line-200)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--v4-ink-400)",
                }}
              >
                <th
                  className="py-2 pr-3"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 500,
                  }}
                >
                  Package
                </th>
                <th
                  className="py-2 px-3"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 500,
                  }}
                >
                  24h
                </th>
                <th
                  className="py-2 px-3"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 500,
                  }}
                >
                  7d
                </th>
                <th
                  className="py-2 px-3"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 500,
                  }}
                >
                  30d
                </th>
                <th
                  className="py-2 pl-3"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 500,
                  }}
                >
                  Latest
                </th>
              </tr>
            </thead>
            <tbody>
              {rankedPackages.slice(0, 5).map((pkg) => (
                <PackageRow
                  key={pkg.name}
                  pkg={pkg}
                  dependents={dependentsByPackage?.[pkg.name] ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>

        {topPackage && (
          <div
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
            style={{ fontSize: 11, color: "var(--v4-ink-400)" }}
          >
            <p className="flex items-center gap-1">
              <span style={{ color: "var(--v4-ink-400)" }}>
                {"// LEADING PACKAGE: "}
              </span>
              <span style={{ color: "var(--v4-ink-200)" }}>{topPackage.name}</span>
              <span>{" with "}</span>
              <span
                className="tabular-nums"
                style={{
                  color: "var(--v4-acc)",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
              >
                {formatNumber(topPackage.downloads7d)}
              </span>
              <span>{" downloads in 7d"}</span>
            </p>
            {topSeries && topSeries.length >= 2 && (
              <span
                className="inline-flex items-center gap-1"
                title={`${topPackage.name} — last ${topSeries.length} days of downloads`}
              >
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 10,
                    color: "var(--v4-ink-400)",
                  }}
                >
                  30D
                </span>
                <Sparkline series={topSeries} />
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PackageRow({
  pkg,
  dependents,
}: {
  pkg: NpmPackageRow;
  dependents: number | null;
}) {
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--v4-line-100)",
        fontSize: 14,
        color: "var(--v4-ink-200)",
      }}
    >
      <td className="py-3 pr-3">
        <a
          href={pkg.npmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-[260px] items-center gap-1.5"
          style={{ color: "var(--v4-ink-100)", textDecoration: "none" }}
        >
          <Package
            className="size-3.5 shrink-0"
            style={{ color: "var(--v4-ink-300)" }}
          />
          <span className="truncate">{pkg.name}</span>
          <ExternalLink
            className="size-3 shrink-0"
            style={{ color: "var(--v4-ink-300)" }}
          />
        </a>
        {dependents != null && dependents > 0 && (
          <span
            className="ml-1 tabular-nums"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v4-ink-400)",
            }}
            title={`${formatNumber(dependents)} packages depend on ${pkg.name}`}
          >
            {"·"} {formatNumber(dependents)} deps
          </span>
        )}
        {pkg.description && (
          <p
            className="mt-0.5 max-w-[320px] truncate"
            style={{ fontSize: 11, color: "var(--v4-ink-400)" }}
          >
            {pkg.description}
          </p>
        )}
      </td>
      <WindowCell downloads={pkg.downloads24h} delta={pkg.delta24h} pct={pkg.deltaPct24h} />
      <WindowCell downloads={pkg.downloads7d} delta={pkg.delta7d} pct={pkg.deltaPct7d} />
      <WindowCell downloads={pkg.downloads30d} delta={pkg.delta30d} pct={pkg.deltaPct30d} />
      <td
        className="py-3 pl-3 tabular-nums"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          color: "var(--v4-ink-400)",
        }}
      >
        <span className="block" style={{ color: "var(--v4-ink-200)" }}>
          {pkg.latestVersion ?? "unknown"}
        </span>
        {pkg.publishedAt && (
          <span className="block">{getRelativeTime(pkg.publishedAt)}</span>
        )}
      </td>
    </tr>
  );
}

function WindowCell({
  downloads,
  delta,
  pct,
}: {
  downloads: number;
  delta: number;
  pct: number;
}) {
  return (
    <td
      className="py-3 px-3 tabular-nums"
      style={{ fontFamily: "var(--font-geist-mono), monospace" }}
    >
      <span className="block" style={{ color: "var(--v4-ink-100)" }}>
        {formatNumber(downloads)}
      </span>
      <span className="block" style={{ fontSize: 11, color: deltaColor(delta) }}>
        {formatSignedNumber(delta)}
        <span className="ml-1" style={{ color: "var(--v4-ink-400)" }}>
          {formatPercent(pct)}
        </span>
      </span>
    </td>
  );
}

export default NpmAdoptionPanel;
