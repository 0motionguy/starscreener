// V3 header strip used by every news page (/news + per-source pages
// + /signals). One file, three card variants, four-corner bracket
// markers — same visual contract everywhere.
//
// Layout (desktop):
//   [eyebrow row .................................................]
//   [ snapshot ] [ bar-chart 1 ] [ bar-chart 2 ]      ← 280/1fr/1fr
//   [ hero #1  ] [ hero #2 ] [ hero #3 ]              ← 1fr/1fr/1fr
//
// Bars run left → right, one row per category. The middle/right cards
// take a `bars: NewsMetricBar[]` array; widths are computed from the
// max value so the chart reads as a distribution at a glance.
//
// Pure server component — every prop is derived data (numbers + strings).

import Link from "next/link";
import { EntityLogo } from "@/components/ui/EntityLogo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewsMetricBar {
  /** Left-rail label (mono uppercase). Truncates when narrow. */
  label: string;
  /** Numeric value driving the bar width. */
  value: number;
  /** Right-rail primary count. Falls back to value.toLocaleString(). */
  valueLabel?: string;
  /** Right-rail secondary (e.g. cumulative score under the count). */
  hintLabel?: string;
  /** Bar fill colour. Defaults to the page accent. */
  color?: string;
}

export interface NewsMetricSnapshotRow {
  label: string;
  value: string;
  tone?: "default" | "accent" | "up" | "down";
}

/** 3-cell footer strip shared by snapshot + topics cards in compact-v1. */
export interface NewsMetricFooterCell {
  label: string;
  value: string;
  tone?: "default" | "accent" | "up" | "down";
}

export type NewsMetricCard =
  | {
      variant: "snapshot";
      /** Eyebrow shown on the terminal-bar header, e.g. "// SNAPSHOT · NOW". */
      title: string;
      /** Right-aligned status, e.g. "50 ITEMS". */
      rightLabel?: string;
      /** Mono uppercase label above the big number. */
      label: string;
      /** Big headline number, formatted by the caller. */
      value: string;
      /** Mono uppercase line under the number, e.g. "ACROSS 5 SOURCES". */
      hint?: string;
      /** Up to 3 small stat rows below the big number (legacy V3 layout). */
      rows?: NewsMetricSnapshotRow[];
      /** Compact-v1 delta pill rendered next to the big number. */
      delta?: { value: string; tone: "up" | "down" | "flat" };
      /** Compact-v1 sparkline values (oldest → newest, left → right). */
      spark?: number[];
      /** Right-rail legend for the sparkline. */
      sparkTrend?: { label: string; value: string };
      /** Compact-v1 footer strip (3 cells). When set, replaces `rows`. */
      footer?: NewsMetricFooterCell[];
    }
  | {
      variant: "bars";
      title: string;
      rightLabel?: string;
      bars: NewsMetricBar[];
      /** Renders centered in the card body when `bars` is empty. */
      emptyText?: string;
      /** Width (px) of the left-rail label column. Default 56. */
      labelWidth?: number;
      /** Compact-v1: 30-cell minute heatmap below the bars. */
      minuteHeatmap?: { values: number[]; max: number };
      /** Compact-v1: 24-cell hourly distribution below the heatmap. */
      hourlyDistribution?: { values: number[]; peakLabel: string };
      /** Compact-v1 footer strip (3 cells). */
      footer?: NewsMetricFooterCell[];
    };

export interface NewsHeroStory {
  /** Story title. */
  title: string;
  /** Absolute or relative URL. */
  href: string;
  /** Open in new tab when the link points to an external surface. */
  external?: boolean;
  /** Source short-code chip, e.g. "HN", "BS", "PH". */
  sourceCode: string;
  /** Optional secondary byline (`@user`, `domain.com`, `r/sub`). */
  byline?: string;
  /** Pre-formatted score chip, e.g. "1.1K SCORE", "892 LIKES". */
  scoreLabel: string;
  /** Hours since posted; rendered as "<1H", "4H", "2D". null = unknown. */
  ageHours?: number | null;
  /** Optional logo / avatar URL — repo owner, author, or company. The
   *  card falls back to a deterministic monogram tile when missing. */
  logoUrl?: string | null;
  /** Optional entity name to drive the monogram letter + hue. Defaults
   *  to the title. Use this for cases where the monogram should reflect
   *  the byline (`@vercel`) instead of a long story title. */
  logoName?: string;
}

export interface NewsTopHeaderMeta {
  label: string;
  value: string;
}

export interface NewsTopHeaderV3Props {
  /** Eyebrow row text, e.g. "// HACKERNEWS · LAST 24H". Renders as the
   *  breadcrumb / topbar in compact-v1; right-aligned `meta` replaces
   *  `status` when both are set. */
  eyebrow: string;
  /** Right-aligned status, e.g. "1,432 ITEMS · LIVE". */
  status?: string;
  /** Three header cards. Card 0 is typically a snapshot, 1 + 2 are bars. */
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  /** Three hero stories. Falls back to a placeholder card per slot. */
  topStories: NewsHeroStory[];
  /** Accent CSS colour. Defaults to the active V3 accent. */
  accent?: string;

  // ─── compact-v1 additions (all optional, backward-compatible) ─────────
  /** Top titlebar text, e.g. "SKILLS · TRENDING". Adds a slim header strip
   *  above the breadcrumb when set. */
  routeTitle?: string;
  /** Right-aligned LIVE pill on the titlebar, e.g. "LIVE · 30M". */
  liveLabel?: string;
  /** Right-side meta counts on the breadcrumb topbar (replaces `status`). */
  meta?: NewsTopHeaderMeta[];
  /** Bottom mono caption pieces, e.g. ["LAYOUT compact-v1", "3-COL"]. */
  caption?: string[];
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function NewsTopHeaderV3({
  eyebrow,
  status,
  cards,
  topStories,
  accent,
  routeTitle,
  liveLabel,
  meta,
  caption,
}: NewsTopHeaderV3Props) {
  const accentVar = accent ?? "var(--v3-acc)";
  const accentGlow = accent ? `${accent.replace("0.85", "0.45")}` : "var(--v3-acc-glow)";

  return (
    <section aria-label="News overview" className="space-y-3">
      {/* Compact-v1 titlebar — only when routeTitle is provided. */}
      {routeTitle ? (
        <CornerTickBar accent={accentVar}>
          <span
            className="v2-mono truncate text-[11px] tracking-[0.18em]"
            style={{ color: "var(--v3-ink-200)" }}
          >
            <span style={{ color: "var(--v3-ink-400)" }}>{"// "}</span>
            <b style={{ color: "var(--v3-ink-000)", fontWeight: 600 }}>
              {routeTitle}
            </b>
          </span>
          {liveLabel ? <LivePill label={liveLabel} /> : null}
        </CornerTickBar>
      ) : null}

      {/* Topbar / breadcrumb. In compact-v1 it carries right-side meta
          counts; legacy callers still pass a single `status` string. */}
      <CornerTickBar accent={accentVar} dense={!routeTitle}>
        <span className="flex items-center gap-2 min-w-0 truncate">
          <span aria-hidden className="flex items-center gap-1">
            <Square color={accentVar} glow={accentGlow} />
            <Square color="var(--v3-line-300)" />
            <Square color="var(--v3-line-300)" />
          </span>
          <span
            className="v2-mono truncate text-[11px] tracking-[0.18em]"
            style={{ color: "var(--v3-ink-200)" }}
          >
            {eyebrow}
          </span>
        </span>
        {meta && meta.length > 0 ? (
          <MetaStrip meta={meta} />
        ) : status ? (
          <span
            className="v2-mono shrink-0 text-[10px] tabular-nums tracking-[0.14em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {status}
          </span>
        ) : null}
      </CornerTickBar>

      {/* 3 cards: snapshot + 2 bar charts (or any mix). 320/1fr/1fr
          mirrors the compact-v1 mockup; was 280 in the original V3. */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_1fr] gap-3">
        {cards.map((card, i) => (
          <CardShell key={i} accent={accentVar}>
            <CardHeader title={card.title} rightLabel={card.rightLabel} />
            {card.variant === "snapshot" ? (
              <SnapshotBody card={card} accent={accentVar} />
            ) : (
              <BarsBody card={card} accent={accentVar} />
            )}
          </CardShell>
        ))}
      </div>

      {/* Optional compact-v1 caption row. */}
      {caption && caption.length > 0 ? (
        <div
          className="v2-mono px-1 pt-1 text-[10.5px] tracking-[0.08em] flex flex-wrap gap-x-5 gap-y-1"
          style={{ color: "var(--v3-ink-500)" }}
        >
          {caption.map((piece, i) => (
            <span key={i}>{piece}</span>
          ))}
        </div>
      ) : null}

      {/* Featured strip — `// FEATURED · TODAY · 3 PICKS` + 3 cards */}
      <div className="pt-2">
        <div
          className="v2-mono mb-2 px-1 text-[11px] tracking-[0.18em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {`// FEATURED · TODAY · 3 PICKS`}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((slot) => {
            const story = topStories[slot];
            return (
              <HeroFeatureCard
                key={slot}
                rank={slot + 1}
                story={story}
                accent={accentVar}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Compact-v1 chrome atoms — corner-tick bars, LIVE pill, meta strip.
// ---------------------------------------------------------------------------

function CornerTickBar({
  accent,
  dense,
  children,
}: {
  accent: string;
  dense?: boolean;
  children: React.ReactNode;
}) {
  // Same 4-corner tick treatment used on cards — applied to header bars
  // so the new titlebar / topbar share the visual contract with the
  // 3-up grid below.
  return (
    <div
      className={`relative flex items-center justify-between gap-3 px-3 ${
        dense ? "py-2" : "py-2.5"
      } border`}
      style={{
        borderColor: "var(--v3-line-200)",
        background: "var(--v3-bg-050)",
        borderRadius: 2,
      }}
    >
      {[
        { top: -2, left: -2 },
        { top: -2, right: -2 },
        { bottom: -2, left: -2 },
        { bottom: -2, right: -2 },
      ].map((pos, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ width: 5, height: 5, background: accent, ...pos }}
        />
      ))}
      {children}
    </div>
  );
}

function LivePill({ label }: { label: string }) {
  return (
    <span
      className="v2-mono shrink-0 inline-flex items-center gap-1.5 text-[10.5px] tracking-[0.14em]"
      style={{
        color: "var(--v3-sig-green)",
        border: "1px solid color-mix(in srgb, var(--v3-sig-green) 35%, transparent)",
        background: "color-mix(in srgb, var(--v3-sig-green) 8%, transparent)",
        borderRadius: 1,
        padding: "3px 8px",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          background: "var(--v3-sig-green)",
          borderRadius: "50%",
          boxShadow: "0 0 8px var(--v3-sig-green)",
          animation: "v3LivePulse 1.6s ease-in-out infinite",
          display: "inline-block",
        }}
      />
      {label}
      <style>{`@keyframes v3LivePulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </span>
  );
}

function MetaStrip({ meta }: { meta: NewsTopHeaderMeta[] }) {
  return (
    <span className="shrink-0 flex items-center gap-5">
      {meta.map((m, i) => (
        <span
          key={i}
          className="v2-mono text-[10.5px] tabular-nums tracking-[0.14em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          <b style={{ color: "var(--v3-ink-000)", fontWeight: 600 }}>{m.value}</b>{" "}
          {m.label}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card chrome — bracket markers + body wrapper.
// ---------------------------------------------------------------------------

function CardShell({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  // Four 5px corner squares pinned just outside the card frame so the
  // card reads as the "active object" — same Sentinel-style treatment
  // used elsewhere in the V3 chrome (BracketMarkers in v2/).
  return (
    <div
      className="relative"
      style={{
        background: "var(--v3-bg-050)",
        border: "1px solid var(--v3-line-200)",
        borderRadius: 2,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 5,
          height: 5,
          top: -2,
          left: -2,
          background: accent,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 5,
          height: 5,
          top: -2,
          right: -2,
          background: accent,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 5,
          height: 5,
          bottom: -2,
          left: -2,
          background: accent,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 5,
          height: 5,
          bottom: -2,
          right: -2,
          background: accent,
        }}
      />
      {children}
    </div>
  );
}

function CardHeader({
  title,
  rightLabel,
}: {
  title: string;
  rightLabel?: string;
}) {
  return (
    <div
      className="v2-mono flex items-center justify-between gap-3 px-3 h-9 border-b"
      style={{
        borderColor: "var(--v3-line-100)",
        background: "var(--v3-bg-025)",
      }}
    >
      <span className="flex items-center gap-1.5 min-w-0 truncate">
        <Square color="var(--v3-acc)" />
        <Square color="var(--v3-line-300)" />
        <Square color="var(--v3-line-300)" />
        <span
          className="ml-1 truncate text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {title}
        </span>
      </span>
      {rightLabel ? (
        <span
          className="shrink-0 text-[10px] tabular-nums tracking-[0.14em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          {rightLabel}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshot body — big number + meta rows.
// ---------------------------------------------------------------------------

function SnapshotBody({
  card,
  accent,
}: {
  card: Extract<NewsMetricCard, { variant: "snapshot" }>;
  accent: string;
}) {
  // When `footer` is set, render the compact-v1 layout: hero number + delta
  // pill + sparkline + 3-cell footer strip. Otherwise fall back to the
  // legacy stacked rows layout so old callers stay visually identical.
  const useCompact = !!card.footer;

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <div
          className="v2-mono text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {card.label}
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontWeight: 300,
              fontSize: "clamp(40px, 5vw, 56px)",
              letterSpacing: "-0.035em",
              lineHeight: 0.95,
              color: "var(--v3-ink-000)",
            }}
          >
            {card.value}
          </div>
          {card.delta ? <DeltaPill delta={card.delta} /> : null}
        </div>
        {card.hint ? (
          <div
            className="v2-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {card.hint}
          </div>
        ) : null}

        {card.spark && card.spark.length > 1 ? (
          <div className="mt-1 flex items-end gap-3">
            <Sparkline values={card.spark} accent={accent} />
            {card.sparkTrend ? (
              <div
                className="v2-mono text-right shrink-0 text-[9.5px] tracking-[0.10em]"
                style={{ color: "var(--v3-ink-400)", lineHeight: 1.4 }}
              >
                <div>{card.sparkTrend.label}</div>
                <div
                  style={{ color: "var(--v3-ink-000)", fontWeight: 600 }}
                  className="tabular-nums"
                >
                  {card.sparkTrend.value}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!useCompact && card.rows && card.rows.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {card.rows.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between v2-mono text-[10px] tracking-[0.14em] uppercase"
                style={{
                  borderTop: "1px dashed var(--v3-line-100)",
                  paddingTop: 8,
                }}
              >
                <span style={{ color: "var(--v3-ink-300)" }}>{row.label}</span>
                <span
                  className="tabular-nums"
                  style={{
                    color:
                      row.tone === "accent"
                        ? "var(--v3-acc)"
                        : row.tone === "up"
                          ? "var(--v3-sig-green)"
                          : row.tone === "down"
                            ? "var(--v3-sig-red)"
                            : "var(--v3-ink-100)",
                    fontWeight: row.tone === "accent" ? 500 : 400,
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {useCompact && card.footer ? <FooterStrip cells={card.footer} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact-v1 visual atoms — sparkline, delta pill, footer strip,
// minute heatmap, hourly distribution.
// ---------------------------------------------------------------------------

function Sparkline({ values, accent }: { values: number[]; accent: string }) {
  if (values.length === 0) return null;
  const w = 200;
  const h = 38;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - 2 - ((v - min) / range) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const lastIdx = values.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = h - 2 - ((values[lastIdx] - min) / range) * (h - 6);
  const gradId = `v3spark-${Math.abs(values.reduce((s, v) => s + v, 0)) || 0}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="flex-1"
      style={{ width: "100%", height: 38, display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={accent} strokeWidth={1.5} />
      <circle cx={lastX} cy={lastY} r={2.4} fill="var(--v3-ink-000)" />
    </svg>
  );
}

function DeltaPill({
  delta,
}: {
  delta: { value: string; tone: "up" | "down" | "flat" };
}) {
  const color =
    delta.tone === "up"
      ? "var(--v3-sig-green)"
      : delta.tone === "down"
        ? "var(--v3-sig-red)"
        : "var(--v3-ink-300)";
  const tint =
    delta.tone === "up"
      ? "color-mix(in srgb, var(--v3-sig-green) 8%, transparent)"
      : delta.tone === "down"
        ? "color-mix(in srgb, var(--v3-sig-red) 8%, transparent)"
        : "color-mix(in srgb, var(--v3-ink-300) 8%, transparent)";
  const border =
    delta.tone === "up"
      ? "color-mix(in srgb, var(--v3-sig-green) 30%, transparent)"
      : delta.tone === "down"
        ? "color-mix(in srgb, var(--v3-sig-red) 30%, transparent)"
        : "color-mix(in srgb, var(--v3-ink-300) 30%, transparent)";
  return (
    <span
      className="v2-mono inline-flex items-center gap-1 text-[10.5px] tabular-nums shrink-0"
      style={{
        color,
        background: tint,
        border: `1px solid ${border}`,
        padding: "3px 7px",
        borderRadius: 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 0,
          height: 0,
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          ...(delta.tone === "down"
            ? { borderTop: `5px solid currentColor` }
            : { borderBottom: `5px solid currentColor` }),
          display: "inline-block",
        }}
      />
      {delta.value}
    </span>
  );
}

function FooterStrip({ cells }: { cells: NewsMetricFooterCell[] }) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
        borderTop: "1px solid var(--v3-line-100)",
      }}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          className="px-3 py-2.5"
          style={{
            borderRight:
              i < cells.length - 1 ? "1px solid var(--v3-line-100)" : "none",
          }}
        >
          <div
            className="v2-mono text-[9.5px] tracking-[0.14em] uppercase"
            style={{ color: "var(--v3-ink-300)", marginBottom: 3 }}
          >
            {c.label}
          </div>
          <div
            className="v2-mono tabular-nums text-[14px]"
            style={{
              color:
                c.tone === "accent"
                  ? "var(--v3-acc)"
                  : c.tone === "up"
                    ? "var(--v3-sig-green)"
                    : c.tone === "down"
                      ? "var(--v3-sig-red)"
                      : "var(--v3-ink-000)",
              fontWeight: 600,
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function MinuteHeatmap({
  data,
  accent,
}: {
  data: { values: number[]; max: number };
  accent: string;
}) {
  const max = Math.max(1, data.max);
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${data.values.length}, 1fr)` }}
    >
      {data.values.map((v, i) => {
        const o = v === 0 ? 0.08 : 0.18 + (v / max) * 0.82;
        const isPeak = v > 0 && v >= max * 0.85;
        return (
          <span
            key={i}
            aria-hidden
            style={{
              aspectRatio: "1 / 2.4",
              background: `color-mix(in srgb, ${accent} ${Math.round(o * 100)}%, transparent)`,
              boxShadow: isPeak
                ? `0 0 6px color-mix(in srgb, ${accent} 60%, transparent)`
                : undefined,
              display: "block",
            }}
          />
        );
      })}
    </div>
  );
}

function HourlyDistribution({
  data,
  accent,
}: {
  data: { values: number[]; peakLabel: string };
  accent: string;
}) {
  const max = Math.max(1, ...data.values);
  let peakIdx = 0;
  for (let i = 1; i < data.values.length; i++) {
    if (data.values[i] > data.values[peakIdx]) peakIdx = i;
  }
  return (
    <div className="flex flex-col gap-1">
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: "repeat(24, 1fr)",
          alignItems: "end",
          height: 56,
        }}
      >
        {data.values.map((v, i) => {
          const isPeak = i === peakIdx && v > 0;
          const heightPct = 8 + (v / max) * 92;
          const op = 0.35 + (v / max) * 0.65;
          return (
            <span
              key={i}
              aria-hidden
              style={{
                background: isPeak ? "var(--v3-sig-green)" : accent,
                opacity: v === 0 ? 0.15 : op,
                display: "block",
                minHeight: 2,
                height: `${heightPct}%`,
              }}
            />
          );
        })}
      </div>
      <div
        className="v2-mono flex justify-between text-[9px] tracking-[0.10em]"
        style={{ color: "var(--v3-ink-500)" }}
      >
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bars body — one row per bar, left-to-right fill widths.
// ---------------------------------------------------------------------------

function BarsBody({
  card,
  accent,
}: {
  card: Extract<NewsMetricCard, { variant: "bars" }>;
  accent: string;
}) {
  const bars = card.bars ?? [];
  const hasExtras = !!(
    card.minuteHeatmap || card.hourlyDistribution || card.footer
  );

  if (bars.length === 0 && !hasExtras) {
    return (
      <div
        className="v2-mono py-8 px-3 text-center text-[10px] tracking-[0.18em]"
        style={{ color: "var(--v3-ink-500)" }}
      >
        <span aria-hidden>{"// "}</span>
        {card.emptyText ?? "NO DATA YET"}
      </div>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);
  const labelWidth = card.labelWidth ?? 56;

  // Right-rail width: enough for both valueLabel and hintLabel when present.
  const hasHint = bars.some((b) => b.hintLabel);

  return (
    <div className="flex flex-col">
      {bars.length > 0 ? (
      <div className="px-3 py-3 sm:px-4 sm:py-4 flex flex-col gap-2">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="flex items-center gap-2 sm:gap-3"
          style={{ minHeight: 22 }}
        >
          {/* Left rail label — narrower on mobile so the bar stays
              visible on iPhone-SE-class widths (375px). */}
          <span
            className="v2-mono shrink-0 truncate text-[10px] tracking-[0.14em] uppercase w-[56px] sm:w-auto sm:max-w-none"
            style={{
              width: undefined,
              minWidth: 40,
              maxWidth: labelWidth,
              color: "var(--v3-ink-200)",
            }}
            title={bar.label}
          >
            {bar.label}
          </span>
          <div
            className="flex-1 relative"
            style={{
              height: 12,
              background: "var(--v3-bg-100)",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: `${(bar.value / max) * 100}%`,
                minWidth: bar.value > 0 ? 2 : 0,
                background: bar.color ?? accent,
                borderRadius: 1,
                boxShadow: bar.value > 0 ? `0 0 6px ${bar.color ?? accent}33` : undefined,
              }}
            />
          </div>
          <span
            className="v2-mono tabular-nums shrink-0 text-right text-[11px]"
            style={{
              width: 40,
              color: "var(--v3-ink-100)",
              fontWeight: 500,
            }}
          >
            {bar.valueLabel ?? bar.value.toLocaleString("en-US")}
          </span>
          {/* Hint column — secondary metric (e.g. cumulative score).
              Hidden on <sm so the bar + value stay readable on narrow
              screens; reappears on sm+ where there's room. */}
          {hasHint ? (
            <span
              className="v2-mono tabular-nums shrink-0 text-right text-[9px] tracking-[0.14em] hidden sm:inline-block"
              style={{
                width: 48,
                color: "var(--v3-ink-400)",
              }}
            >
              {bar.hintLabel ?? ""}
            </span>
          ) : null}
        </div>
      ))}
      </div>
      ) : null}

      {card.minuteHeatmap ? (
        <div
          className="px-3 sm:px-4 pb-3 pt-3"
          style={{ borderTop: "1px dashed var(--v3-line-100)" }}
        >
          <div className="flex items-baseline justify-between mb-2 v2-mono text-[10px] tracking-[0.14em]">
            <span style={{ color: "var(--v3-ink-300)" }}>
              LAST 30M · PER MINUTE
            </span>
            <span style={{ color: "var(--v3-ink-500)" }}>
              MAX{" "}
              <b
                style={{ color: "var(--v3-ink-200)", fontWeight: 600 }}
                className="tabular-nums"
              >
                {card.minuteHeatmap.max}
              </b>
            </span>
          </div>
          <MinuteHeatmap data={card.minuteHeatmap} accent={accent} />
        </div>
      ) : null}

      {card.hourlyDistribution ? (
        <div
          className="px-3 sm:px-4 pb-3 pt-3"
          style={{ borderTop: "1px dashed var(--v3-line-100)" }}
        >
          <div className="flex items-baseline justify-between mb-2 v2-mono text-[10px] tracking-[0.14em]">
            <span style={{ color: "var(--v3-ink-300)" }}>24H DISTRIBUTION</span>
            <span style={{ color: "var(--v3-ink-500)" }}>
              PEAK{" "}
              <b
                style={{ color: "var(--v3-ink-200)", fontWeight: 600 }}
                className="tabular-nums"
              >
                {card.hourlyDistribution.peakLabel}
              </b>
            </span>
          </div>
          <HourlyDistribution data={card.hourlyDistribution} accent={accent} />
        </div>
      ) : null}

      {card.footer && card.footer.length > 0 ? (
        <FooterStrip cells={card.footer} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero feature card — rank + source chip + title + meta row.
// Slot 1 (rank=1) gets the accent left rail; slots 2/3 are dimmer.
// ---------------------------------------------------------------------------

function formatAge(hours: number | null | undefined): string {
  if (hours === undefined || hours === null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return "<1H";
  if (hours < 24) return `${Math.round(hours)}H`;
  return `${Math.round(hours / 24)}D`;
}

function HeroFeatureCard({
  rank,
  story,
  accent,
}: {
  rank: number;
  story: NewsHeroStory | undefined;
  accent: string;
}) {
  if (!story) {
    return (
      <CardShell accent="var(--v3-line-300)">
        <div
          className="flex items-center justify-center p-4 min-h-[112px]"
          style={{ color: "var(--v3-ink-500)" }}
        >
          <span className="v2-mono text-[10px] tracking-[0.18em]">
            {`/ NO #${String(rank).padStart(2, "0")} YET`}
          </span>
        </div>
      </CardShell>
    );
  }

  const isTop = rank === 1;
  const Wrap = story.external ? "a" : Link;
  const linkProps = story.external
    ? { href: story.href, target: "_blank", rel: "noopener noreferrer" as const }
    : { href: story.href };

  return (
    <CardShell accent={isTop ? accent : "var(--v3-line-300)"}>
      <Wrap
        {...linkProps}
        className="group flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--v3-bg-100)]"
        style={{
          boxShadow: isTop ? `inset 3px 0 0 ${accent}` : undefined,
          minHeight: 168,
        }}
      >
        {/* Top row: source chip + logo + byline + FEATURED tag (top only) */}
        <div className="flex items-center gap-2 v2-mono text-[10px] tracking-[0.18em]">
          <span
            className="px-1.5 py-0.5 shrink-0 inline-flex items-center gap-1"
            style={{
              background: isTop ? `${accent}1a` : "var(--v3-bg-100)",
              border: `1px solid ${isTop ? `${accent}66` : "var(--v3-line-200)"}`,
              color: isTop ? accent : "var(--v3-ink-200)",
              borderRadius: 1,
              fontWeight: 500,
            }}
          >
            {story.sourceCode}
          </span>
          <EntityLogo
            src={story.logoUrl ?? null}
            name={story.logoName ?? story.byline ?? story.title}
            size={20}
            shape="circle"
            alt=""
          />
          {story.byline ? (
            <span
              className="truncate min-w-0"
              style={{ color: "var(--v3-ink-400)" }}
            >
              {story.byline}
            </span>
          ) : null}
          {isTop ? (
            <span
              className="ml-auto shrink-0 tabular-nums"
              style={{ color: accent, fontWeight: 500 }}
            >
              FEATURED
            </span>
          ) : (
            <span
              className="ml-auto shrink-0 tabular-nums"
              style={{ color: "var(--v3-ink-500)" }}
            >
              {`#${String(rank).padStart(2, "0")}`}
            </span>
          )}
        </div>

        {/* Title — 2-line clamp, generous size + tight line-height */}
        <h3
          className="text-[15px] sm:text-[16px] leading-tight font-semibold"
          style={{
            color: "var(--v3-ink-000)",
            fontFamily: "var(--font-geist), Inter, sans-serif",
            letterSpacing: "-0.012em",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {story.title}
        </h3>

        {/* Inline meta */}
        <div
          className="flex items-center gap-2 text-[11px] tabular-nums"
          style={{ color: "var(--v3-ink-300)" }}
        >
          <span>{story.scoreLabel}</span>
          <span aria-hidden style={{ color: "var(--v3-line-300)" }}>·</span>
          <span>{formatAge(story.ageHours)} ago</span>
        </div>

        {/* Footer — hairline + open indicator. Hover floods accent. */}
        <div
          className="mt-auto pt-2 flex items-center justify-between v2-mono text-[10px] tracking-[0.16em]"
          style={{
            borderTop: "1px dashed var(--v3-line-100)",
            color: "var(--v3-ink-400)",
          }}
        >
          <span className="flex items-center gap-1">
            <Square color={isTop ? accent : "var(--v3-line-300)"} />
            <Square color="var(--v3-line-300)" />
            <Square color="var(--v3-line-300)" />
          </span>
          <span
            className="tabular-nums transition-colors group-hover:text-[color:var(--v3-acc)]"
            style={{ color: "var(--v3-ink-400)" }}
            aria-hidden
          >
            OPEN ↗
          </span>
        </div>
      </Wrap>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Tiny atoms
// ---------------------------------------------------------------------------

function Square({
  color,
  glow,
  size = 6,
}: {
  color: string;
  glow?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: size,
        height: size,
        background: color,
        borderRadius: 1,
        boxShadow: glow ? `0 0 6px ${glow}` : undefined,
      }}
    />
  );
}
