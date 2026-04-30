import type { JSX } from "react";
import { Download, ExternalLink, Package, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NpmPackageRow } from "@/lib/npm";
import type { DailyDownload } from "@/lib/npm-daily";
import { cn, formatNumber, getRelativeTime } from "@/lib/utils";

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

function deltaClass(delta: number): string {
  const tone = toneForDelta(delta);
  if (tone === "up") return "text-up";
  if (tone === "down") return "text-down";
  return "text-text-tertiary";
}

/**
 * Render a compact 30-day sparkline as an inline SVG polyline.
 *
 * Zero-width stroke / zero-only series render as a flat mid-line rather
 * than a div-by-zero NaN. Color + dimensions stay in the terminal palette
 * (text-text-tertiary, no new accent).
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
      className="text-text-tertiary"
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
          return (
            <div
              key={metric.label}
              className="rounded-md border border-border-primary bg-bg-secondary/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
                  <Icon className="size-3" aria-hidden />
                  {metric.label}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    deltaClass(metric.delta),
                  )}
                >
                  {formatPercent(pct)}
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold leading-none text-text-primary tabular-nums">
                {formatNumber(metric.downloads)}
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-[11px] tabular-nums",
                  deltaClass(metric.delta),
                )}
              >
                {formatSignedNumber(metric.delta)}
                <span className="ml-1 text-text-tertiary">vs previous</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
              <th className="py-2 pr-3 font-mono font-medium">Package</th>
              <th className="py-2 px-3 font-mono font-medium">24h</th>
              <th className="py-2 px-3 font-mono font-medium">7d</th>
              <th className="py-2 px-3 font-mono font-medium">30d</th>
              <th className="py-2 pl-3 font-mono font-medium">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary/50">
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
    <tr className="text-sm text-text-secondary">
      <td className="py-3 pr-3">
        <a
          href={pkg.npmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-[260px] items-center gap-1.5 text-text-primary hover:text-brand"
        >
          <Package className="size-3.5 shrink-0 text-text-tertiary group-hover:text-brand" />
          <span className="truncate">{pkg.name}</span>
          <ExternalLink className="size-3 shrink-0 text-text-tertiary" />
        </a>
        {dependents != null && dependents > 0 && (
          <span
            className="ml-1 font-mono text-[10px] text-text-tertiary tabular-nums"
            title={`${formatNumber(dependents)} packages depend on ${pkg.name}`}
          >
            {"·"} {formatNumber(dependents)} deps
          </span>
        )}
        {pkg.description && (
          <p className="mt-0.5 max-w-[320px] truncate text-[11px] text-text-tertiary">
            {pkg.description}
          </p>
        )}
      </td>
      <WindowCell downloads={pkg.downloads24h} delta={pkg.delta24h} pct={pkg.deltaPct24h} />
      <WindowCell downloads={pkg.downloads7d} delta={pkg.delta7d} pct={pkg.deltaPct7d} />
      <WindowCell downloads={pkg.downloads30d} delta={pkg.delta30d} pct={pkg.deltaPct30d} />
      <td className="py-3 pl-3 font-mono text-[11px] text-text-tertiary">
        <span className="block text-text-secondary">
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
    <td className="py-3 px-3 font-mono tabular-nums">
      <span className="block text-text-primary">{formatNumber(downloads)}</span>
      <span className={cn("block text-[11px]", deltaClass(delta))}>
        {formatSignedNumber(delta)}
        <span className="ml-1 text-text-tertiary">{formatPercent(pct)}</span>
      </span>
    </td>
  );
}

export default NpmAdoptionPanel;
