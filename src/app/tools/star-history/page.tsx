// /tools/star-history — single-repo star-history visualization.
//
// Server component. Pulls per-repo daily cumulative star series from
// src/lib/star-activity (Redis-backed via the data-store).
//
// Composition:
//   01 Hero strip       — repo identity + live star count + all-time peak
//                         + FreshnessPill (classifyFreshness wired honestly).
//   02 Main chart       — 30-day cumulative line with gradient area fill,
//                         axis ticks, last-point glow.
//   03 KPI strip        — 4 cards: 24h, 7d, 30d, % vs week-avg.
//   04 Repo picker      — top-10 by 7d star delta as a sibling list (when no
//                         ?repo= or repo not found in derived-repos).
//
// When `?repo=` resolves to a repo whose star-activity payload is empty
// (the backfill hasn't run yet), we still render the hero + KPI strip from
// the derived-repos snapshot and show an inline "history backfilling" note
// inside the chart panel — never a hard 404.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getDerivedRepos, getDerivedRepoByFullName } from "@/lib/derived-repos";
import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";
import {
  filterPayloadByWindow,
  getStarActivity,
  refreshStarActivityFromStore,
  type StarActivityPayload,
} from "@/lib/star-activity";
import { getLastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Star History — TrendingRepo",
  description:
    "Visualize daily GitHub star accumulation for any tracked repo. 30-day curve, peak, deltas, and velocity — built on the same cross-source pipeline as the rest of TrendingRepo.",
  openGraph: {
    images: [
      { url: "/api/og/tools/star-history", width: 1200, height: 630 },
    ],
  },
};

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// SVG plot geometry — viewBox stays fixed; the consumer scales width via CSS.
const VB_W = 1000;
const VB_H = 320;
const PAD = { top: 24, right: 28, bottom: 28, left: 56 };
const INNER_W = VB_W - PAD.left - PAD.right;
const INNER_H = VB_H - PAD.top - PAD.bottom;

interface ResolvedRepo {
  fullName: string;
  raw: string | null;
  resolved: Repo | null;
  invalid: boolean;
}

function parseRepoParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function pickTopMovers(repos: Repo[], limit = 10): Repo[] {
  return [...repos]
    .filter((r) => r.fullName && r.fullName.includes("/"))
    .sort((a, b) => (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0))
    .slice(0, limit);
}

function resolveRepo(raw: string | null, all: Repo[]): ResolvedRepo {
  if (!raw) {
    const fallback = pickTopMovers(all, 1)[0] ?? null;
    return {
      fullName: fallback?.fullName ?? "",
      raw: null,
      resolved: fallback,
      invalid: false,
    };
  }
  const direct = getDerivedRepoByFullName(raw);
  if (direct) {
    return { fullName: direct.fullName, raw, resolved: direct, invalid: false };
  }
  // Case-insensitive linear fallback — derived-repos uses exact-match Map.
  const lower = raw.toLowerCase();
  const ci = all.find((r) => r.fullName.toLowerCase() === lower) ?? null;
  if (ci) {
    return { fullName: ci.fullName, raw, resolved: ci, invalid: false };
  }
  const fallback = pickTopMovers(all, 1)[0] ?? null;
  return {
    fullName: fallback?.fullName ?? raw,
    raw,
    resolved: fallback,
    invalid: true,
  };
}

function formatStars(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatSignedDelta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${Math.round(n).toLocaleString()}`;
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function shortDayLabel(iso: string): string {
  // YYYY-MM-DD → Mon DD (local-en, UTC-safe — the bucket is already UTC midnight)
  const ts = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ts)) return iso.slice(5);
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface ChartGeometry {
  linePath: string;
  areaPath: string;
  lastDot: { x: number; y: number } | null;
  yTicks: { y: number; label: string }[];
  xTicks: { x: number; label: string }[];
  peak: { stars: number; date: string } | null;
  current: number;
  first: number;
  windowDelta: number;
  windowDeltaPct: number;
}

function buildChartGeometry(
  payload: StarActivityPayload | null,
): ChartGeometry | null {
  if (!payload || payload.points.length === 0) return null;
  const points = payload.points;
  const stars = points.map((p) => p.s);
  const minStars = Math.min(...stars);
  const maxStars = Math.max(...stars);
  const range = Math.max(1, maxStars - minStars);
  // Pad the y-axis 6% on top so the last-point dot doesn't kiss the ceiling.
  const yCeiling = maxStars + range * 0.06;
  const yFloor = Math.max(0, minStars - range * 0.02);
  const yRange = Math.max(1, yCeiling - yFloor);

  const scaleX = (i: number): number =>
    points.length === 1
      ? PAD.left + INNER_W / 2
      : PAD.left + (i / (points.length - 1)) * INNER_W;
  const scaleY = (v: number): number =>
    PAD.top + INNER_H * (1 - (v - yFloor) / yRange);

  const projected = points.map((p, i) => ({ x: scaleX(i), y: scaleY(p.s) }));
  const linePath = `M${projected
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" L")}`;
  const baselineY = PAD.top + INNER_H;
  const areaPath = `M${projected[0].x.toFixed(2)},${baselineY.toFixed(2)} L${projected
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" L")} L${projected[projected.length - 1].x.toFixed(
    2,
  )},${baselineY.toFixed(2)} Z`;

  // 4 horizontal grid lines — quartile ticks of the actual y-range, not the
  // padded ceiling, so the labels stay round-ish.
  const yTicks = [0.25, 0.5, 0.75, 1].map((t) => {
    const value = minStars + (maxStars - minStars) * t;
    return { y: scaleY(value), label: formatStars(value) };
  });

  // 5 x-ticks evenly spaced across the visible range.
  const tickCount = Math.min(5, points.length);
  const xTicks: { x: number; label: string }[] = [];
  for (let i = 0; i < tickCount; i += 1) {
    const idx =
      tickCount === 1
        ? 0
        : Math.round((i * (points.length - 1)) / (tickCount - 1));
    xTicks.push({
      x: scaleX(idx),
      label: shortDayLabel(points[idx].d),
    });
  }

  // Peak detection across the window.
  let peakIdx = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].s > points[peakIdx].s) peakIdx = i;
  }
  const peak =
    points.length > 0
      ? { stars: points[peakIdx].s, date: points[peakIdx].d }
      : null;

  const first = points[0].s;
  const current = points[points.length - 1].s;
  const windowDelta = current - first;
  const windowDeltaPct = first > 0 ? (windowDelta / first) * 100 : 0;

  return {
    linePath,
    areaPath,
    lastDot: projected[projected.length - 1] ?? null,
    yTicks,
    xTicks,
    peak,
    current,
    first,
    windowDelta,
    windowDeltaPct,
  };
}

interface DeltaCard {
  label: string;
  value: string;
  trend: "up" | "dn" | "fl";
  sub: string;
}

function buildDeltaCards(
  repo: Repo | null,
  payload: StarActivityPayload | null,
): DeltaCard[] {
  const d24 = repo?.starsDelta24h ?? 0;
  const d7 = repo?.starsDelta7d ?? 0;
  const d30 = repo?.starsDelta30d ?? 0;

  // "% vs 7d avg" = today's delta against the trailing-7d daily mean from the
  // payload's last 7 points. Falls back to repo snapshot when payload absent.
  let pctVs7dAvg = 0;
  if (payload && payload.points.length >= 7) {
    const tail = payload.points.slice(-7);
    const sum = tail.reduce((acc, p) => acc + p.delta, 0);
    const avg = sum / tail.length;
    const today = tail[tail.length - 1].delta;
    pctVs7dAvg = avg !== 0 ? ((today - avg) / Math.abs(avg)) * 100 : 0;
  } else if (d7 !== 0 && d24 !== 0) {
    const avg = d7 / 7;
    pctVs7dAvg = avg !== 0 ? ((d24 - avg) / Math.abs(avg)) * 100 : 0;
  }

  const trend = (n: number): "up" | "dn" | "fl" =>
    n > 0 ? "up" : n < 0 ? "dn" : "fl";

  return [
    {
      label: "24h stars",
      value: formatSignedDelta(d24),
      trend: trend(d24),
      sub: "yesterday → today",
    },
    {
      label: "7d stars",
      value: formatSignedDelta(d7),
      trend: trend(d7),
      sub: "rolling week",
    },
    {
      label: "30d stars",
      value: formatSignedDelta(d30),
      trend: trend(d30),
      sub: "rolling month",
    },
    {
      label: "vs 7d avg",
      value: formatPct(pctVs7dAvg),
      trend: trend(pctVs7dAvg),
      sub: "today vs week mean",
    },
  ];
}

export default async function StarHistoryPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawRepo = parseRepoParam(params.repo);

  await refreshTrendingFromStore();
  const allRepos = getDerivedRepos();
  const target = resolveRepo(rawRepo, allRepos);

  // Refresh the per-repo star-activity payload for whichever repo we ended
  // up on. Falls through silently if the data-store has nothing.
  if (target.fullName) {
    await refreshStarActivityFromStore(target.fullName);
  }
  const rawPayload = target.fullName ? getStarActivity(target.fullName) : null;
  const payload = rawPayload
    ? filterPayloadByWindow(rawPayload, "30d")
    : null;

  const geom = buildChartGeometry(payload);
  const cards = buildDeltaCards(target.resolved, payload);

  // Hero meta: stars + peak come from the payload when present, otherwise
  // from the derived-repos snapshot so the hero never renders empty.
  const liveStars =
    geom?.current ?? target.resolved?.stars ?? 0;
  const peakStars =
    geom?.peak?.stars ?? target.resolved?.stars ?? 0;
  const peakDate = geom?.peak?.date ?? null;

  // Freshness wired to whichever timestamp we can find — per-repo payload
  // updatedAt wins (it actually moves daily), otherwise fall through to the
  // trending pipeline snapshot.
  const lastUpdatedAt =
    rawPayload?.updatedAt ?? getLastFetchedAt() ?? null;
  const fresh = classifyFreshness("repos", lastUpdatedAt);
  const statusLabel = getStatusLabel(fresh.status);

  const movers = pickTopMovers(allRepos, 10);

  return (
    <div
      className="star-history-tool"
      style={{ padding: "16px 22px 32px", maxWidth: 1500, margin: "0 auto" }}
    >
      <StarHistoryStyles />

      <Hero
        repo={target.resolved}
        fullName={target.fullName}
        liveStars={liveStars}
        peakStars={peakStars}
        peakDate={peakDate}
        windowDeltaPct={geom?.windowDeltaPct ?? 0}
        statusLabel={statusLabel}
        statusClass={fresh.status}
        ageLabel={fresh.ageLabel}
        invalid={target.invalid}
        rawRequest={target.raw}
      />

      <section className="sh-chart-card">
        <div className="sh-chart-head">
          <div className="sh-eyebrow">
            <span className="num">{"// 01"}</span>
            <span className="title">Cumulative star history · 30 days</span>
            <span className="meta">
              {geom ? (
                <>
                  <b>{payload?.points.length ?? 0}</b> daily buckets · backfill{" "}
                  <b>{rawPayload?.backfillSource ?? "—"}</b>
                </>
              ) : (
                <>history backfilling · check back shortly</>
              )}
            </span>
          </div>
        </div>
        <div className="sh-chart-body">
          {geom ? (
            <StarHistorySvg geom={geom} repoFullName={target.fullName} />
          ) : (
            <EmptyChart fullName={target.fullName} />
          )}
        </div>
      </section>

      <section className="sh-kpis">
        {cards.map((c) => (
          <div key={c.label} className="sh-kpi">
            <div className="sh-kpi-label">{c.label}</div>
            <div className={`sh-kpi-value ${c.trend}`}>{c.value}</div>
            <div className="sh-kpi-sub">{c.sub}</div>
          </div>
        ))}
      </section>

      <section className="sh-picker">
        <div className="sh-eyebrow">
          <span className="num">{"// 02"}</span>
          <span className="title">Switch repo</span>
          <span className="meta">
            top <b>{movers.length}</b> by 7-day star delta
          </span>
        </div>
        <div className="sh-picker-grid">
          {movers.map((r, i) => {
            const active =
              r.fullName.toLowerCase() === target.fullName.toLowerCase();
            return (
              <Link
                key={r.fullName}
                href={`/tools/star-history?repo=${encodeURIComponent(r.fullName)}`}
                className={`sh-picker-row ${active ? "on" : ""}`}
                prefetch={false}
              >
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <RepoAvatar repo={r} size={20} />
                <span className="name">{r.fullName}</span>
                <span className="grow" />
                <span className="delta up">
                  +{Math.round(r.starsDelta7d ?? 0).toLocaleString()}
                </span>
                <span className="window">7d</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

interface HeroProps {
  repo: Repo | null;
  fullName: string;
  liveStars: number;
  peakStars: number;
  peakDate: string | null;
  windowDeltaPct: number;
  statusLabel: string;
  statusClass: string;
  ageLabel: string;
  invalid: boolean;
  rawRequest: string | null;
}

function Hero({
  repo,
  fullName,
  liveStars,
  peakStars,
  peakDate,
  windowDeltaPct,
  statusLabel,
  statusClass,
  ageLabel,
  invalid,
  rawRequest,
}: HeroProps) {
  const trendChip = windowDeltaPct >= 0 ? "up" : "dn";
  const trendSign = windowDeltaPct >= 0 ? "+" : "";
  return (
    <div className="page-head sh-hero">
      <div className="sh-hero-left">
        <div className="page-eyebrow">
          <span className={`live-dot ${statusClass}`} /> <b>{statusLabel}</b>{" "}
          · scanned {ageLabel} · star history · 30-day window
        </div>
        <h1 className="page-title sh-title">
          <RepoAvatar repo={repo} size={28} />
          <span className="sh-title-text">{fullName || "Star history"}</span>
        </h1>
        <p className="page-sub">
          {repo?.description ||
            "Daily cumulative GitHub stars for a tracked repo. Backed by the star-activity timeseries — one bucket per UTC day, dual-ended for repos above the stargazer API cap."}
        </p>
        {invalid && rawRequest ? (
          <div className="sh-warn" role="status">
            <b>Repo not found</b> — “{rawRequest}” isn’t in the tracked set yet.
            Showing top mover by 7d delta instead.
          </div>
        ) : null}
      </div>
      <div className="sh-hero-right">
        <div className="sh-kpi pill">
          <div className="sh-kpi-label">Live stars</div>
          <div className="sh-kpi-value">{formatStars(liveStars)}</div>
        </div>
        <div className="sh-kpi pill">
          <div className="sh-kpi-label">30d peak</div>
          <div className="sh-kpi-value">{formatStars(peakStars)}</div>
          {peakDate ? (
            <div className="sh-kpi-sub">{shortDayLabel(peakDate)}</div>
          ) : null}
        </div>
        <div className={`sh-kpi pill ${trendChip}`}>
          <div className="sh-kpi-label">30d shift</div>
          <div className={`sh-kpi-value ${trendChip}`}>
            {trendSign}
            {windowDeltaPct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function RepoAvatar({
  repo,
  size,
}: {
  repo: Repo | null;
  size: number;
}) {
  if (!repo?.ownerAvatarUrl) {
    return (
      <span
        className="sh-avatar-fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {repo?.owner?.slice(0, 2).toUpperCase() ?? "··"}
      </span>
    );
  }
  return (
    <Image
      src={repo.ownerAvatarUrl}
      alt={`${repo.owner} avatar`}
      width={size}
      height={size}
      unoptimized
      style={{
        borderRadius: 2,
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}

interface StarHistorySvgProps {
  geom: ChartGeometry;
  repoFullName: string;
}

function StarHistorySvg({ geom, repoFullName }: StarHistorySvgProps) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${repoFullName} star history — 30 days`}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <linearGradient id="sh-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
          <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y grid */}
      <g className="sh-grid">
        {geom.yTicks.map((t) => (
          <line
            key={`yg-${t.y}`}
            x1={PAD.left}
            y1={t.y}
            x2={PAD.left + INNER_W}
            y2={t.y}
          />
        ))}
      </g>

      {/* Y axis labels */}
      <g className="sh-axis">
        {geom.yTicks.map((t) => (
          <text key={`yl-${t.y}`} x={PAD.left - 8} y={t.y + 4} textAnchor="end">
            {t.label}
          </text>
        ))}
      </g>

      {/* Area fill + line */}
      <path d={geom.areaPath} fill="url(#sh-area-grad)" />
      <path
        d={geom.linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last-point glow */}
      {geom.lastDot ? (
        <g>
          <circle
            cx={geom.lastDot.x.toFixed(2)}
            cy={geom.lastDot.y.toFixed(2)}
            r="10"
            fill="var(--accent)"
            opacity="0.18"
          />
          <circle
            cx={geom.lastDot.x.toFixed(2)}
            cy={geom.lastDot.y.toFixed(2)}
            r="4"
            fill="var(--accent)"
          />
        </g>
      ) : null}

      {/* X axis baseline + ticks */}
      <line
        x1={PAD.left}
        y1={PAD.top + INNER_H}
        x2={PAD.left + INNER_W}
        y2={PAD.top + INNER_H}
        stroke="var(--border)"
        strokeWidth="1"
      />
      <g className="sh-axis">
        {geom.xTicks.map((t) => (
          <text
            key={`xl-${t.x}`}
            x={t.x}
            y={PAD.top + INNER_H + 18}
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}
      </g>
    </svg>
  );
}

function EmptyChart({ fullName }: { fullName: string }) {
  return (
    <div className="sh-empty">
      <span className="sh-empty-icon" aria-hidden="true">
        ◌
      </span>
      <div>
        <div className="sh-empty-title">Star history backfill queued</div>
        <div className="sh-empty-sub">
          {fullName
            ? `Waiting on the first star-activity bucket for ${fullName}. The daily appender runs once per UTC day.`
            : "Pick a repo from the list below."}
        </div>
      </div>
    </div>
  );
}

function StarHistoryStyles() {
  return (
    <style>{`
      .star-history-tool .sh-hero {
        align-items: stretch;
        gap: 22px;
      }
      .star-history-tool .sh-hero-left { flex: 1 1 480px; min-width: 0; }
      .star-history-tool .sh-hero-right {
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .star-history-tool .sh-title {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 2px;
      }
      .star-history-tool .sh-title-text {
        font-family: var(--font-mono);
        font-weight: 500;
        letter-spacing: -0.01em;
      }
      .star-history-tool .sh-warn {
        margin-top: 10px;
        padding: 8px 12px;
        background: var(--accent-soft, rgba(255,180,80,0.06));
        border: 1px solid var(--accent-border, rgba(255,180,80,0.25));
        border-radius: var(--r-1);
        color: var(--fg);
        font-size: 12px;
        font-family: var(--font-mono);
      }
      .star-history-tool .sh-warn b { color: var(--accent); font-weight: 600; }

      .star-history-tool .sh-avatar-fallback {
        display: inline-grid;
        place-items: center;
        background: var(--surface-3);
        color: var(--fg-faint);
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 600;
        border-radius: 2px;
      }

      .star-history-tool .sh-kpi {
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        padding: 12px 14px;
        display: flex; flex-direction: column; gap: 4px;
        border-radius: var(--r-1);
      }
      .star-history-tool .sh-kpi.pill { padding: 10px 14px; }
      .star-history-tool .sh-kpi-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--fg-faint);
      }
      .star-history-tool .sh-kpi-value {
        font-family: var(--font-mono);
        font-size: 22px;
        font-weight: 600;
        color: var(--fg-bright);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .star-history-tool .sh-kpi-value.up { color: var(--up); }
      .star-history-tool .sh-kpi-value.dn { color: var(--down); }
      .star-history-tool .sh-kpi-value.fl { color: var(--fg-muted); }
      .star-history-tool .sh-kpi-sub {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--fg-muted);
      }

      .star-history-tool .sh-chart-card {
        margin-top: 18px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .star-history-tool .sh-chart-head {
        padding: 14px 16px 10px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .star-history-tool .sh-chart-body { padding: 8px 8px 12px; }

      .star-history-tool .sh-eyebrow {
        display: flex; align-items: center; gap: 10px;
        flex-wrap: wrap;
      }
      .star-history-tool .sh-eyebrow .num {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent);
        letter-spacing: 0.10em;
        font-weight: 600;
      }
      .star-history-tool .sh-eyebrow .title {
        font-size: 13.5px;
        color: var(--fg-bright);
        font-weight: 500;
      }
      .star-history-tool .sh-eyebrow .meta {
        margin-left: auto;
        font-family: var(--font-mono);
        font-size: 10.5px;
        color: var(--fg-faint);
      }
      .star-history-tool .sh-eyebrow .meta b { color: var(--fg); font-weight: 500; }

      .star-history-tool svg .sh-grid line {
        stroke: var(--border-subtle);
        stroke-dasharray: 2 4;
        stroke-width: 1;
      }
      .star-history-tool svg .sh-axis text {
        font-family: var(--font-mono);
        font-size: 10px;
        fill: var(--fg-faint);
      }

      .star-history-tool .sh-empty {
        display: flex; align-items: center; gap: 14px;
        padding: 36px 22px;
        color: var(--fg-muted);
        font-family: var(--font-mono);
      }
      .star-history-tool .sh-empty-icon {
        font-size: 36px;
        color: var(--fg-faint);
      }
      .star-history-tool .sh-empty-title {
        font-size: 13px;
        color: var(--fg-bright);
        margin-bottom: 4px;
      }
      .star-history-tool .sh-empty-sub {
        font-size: 11.5px;
        color: var(--fg-muted);
        max-width: 60ch;
      }

      .star-history-tool .sh-kpis {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 1px;
        background: var(--border-subtle);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        overflow: hidden;
      }
      .star-history-tool .sh-kpis .sh-kpi {
        border: 0;
        border-radius: 0;
      }

      .star-history-tool .sh-picker {
        margin-top: 22px;
        background: var(--surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--r-1);
        padding: 14px 16px 16px;
      }
      .star-history-tool .sh-picker-grid {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px;
        background: var(--border-subtle);
      }
      .star-history-tool .sh-picker-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        background: var(--surface);
        text-decoration: none;
        color: var(--fg);
        font-family: var(--font-mono);
        font-size: 12px;
        transition: background var(--d-fast) var(--ease);
      }
      .star-history-tool .sh-picker-row:hover { background: var(--surface-2); }
      .star-history-tool .sh-picker-row.on { background: var(--surface-3); color: var(--fg-bright); }
      .star-history-tool .sh-picker-row .rank {
        color: var(--fg-faint);
        font-size: 10px;
        width: 18px;
      }
      .star-history-tool .sh-picker-row .name {
        color: var(--fg-bright);
        font-size: 12px;
      }
      .star-history-tool .sh-picker-row .grow { margin-left: auto; }
      .star-history-tool .sh-picker-row .delta {
        font-size: 11.5px;
        color: var(--up);
        font-variant-numeric: tabular-nums;
      }
      .star-history-tool .sh-picker-row .window {
        color: var(--fg-faint);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      @media (max-width: 900px) {
        .star-history-tool .sh-hero-right {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          width: 100%;
        }
        .star-history-tool .sh-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .star-history-tool .sh-picker-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 560px) {
        .star-history-tool .sh-hero-right { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
