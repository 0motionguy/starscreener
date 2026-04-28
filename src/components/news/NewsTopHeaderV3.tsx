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
      /** Up to 3 small stat rows below the big number. */
      rows?: NewsMetricSnapshotRow[];
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

export interface NewsTopHeaderV3Props {
  /** Eyebrow row text, e.g. "// HACKERNEWS · LAST 24H". */
  eyebrow: string;
  /** Right-aligned status, e.g. "1,432 ITEMS · LIVE". */
  status?: string;
  /** Three header cards. Card 0 is typically a snapshot, 1 + 2 are bars. */
  cards: [NewsMetricCard, NewsMetricCard, NewsMetricCard];
  /** Three hero stories. Falls back to a placeholder card per slot. */
  topStories: NewsHeroStory[];
  /** Accent CSS colour. Defaults to the active V3 accent. */
  accent?: string;
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
}: NewsTopHeaderV3Props) {
  const accentVar = accent ?? "var(--v3-acc)";
  const accentGlow = accent ? `${accent.replace("0.85", "0.45")}` : "var(--v3-acc-glow)";

  return (
    <section aria-label="News overview" className="space-y-3">
      {/* Eyebrow row */}
      <div
        className="v2-mono flex items-center justify-between gap-3 px-3 py-2 border-y"
        style={{
          borderColor: "var(--v3-line-100)",
          background: "var(--v3-bg-050)",
        }}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          <span aria-hidden className="flex items-center gap-1">
            <Square color={accentVar} glow={accentGlow} />
            <Square color="var(--v3-line-300)" />
            <Square color="var(--v3-line-300)" />
          </span>
          <span
            className="truncate text-[11px] tracking-[0.18em]"
            style={{ color: "var(--v3-ink-200)" }}
          >
            {eyebrow}
          </span>
        </span>
        {status ? (
          <span
            className="shrink-0 text-[10px] tabular-nums tracking-[0.14em]"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {status}
          </span>
        ) : null}
      </div>

      {/* 3 cards: snapshot + 2 bar charts (or any mix). The 280/1fr/1fr
          ratio gives the snapshot a fixed-width "anchor" and lets the two
          chart cards expand to fill the remaining width. */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-3">
        {cards.map((card, i) => (
          <CardShell key={i} accent={accentVar}>
            <CardHeader title={card.title} rightLabel={card.rightLabel} />
            {card.variant === "snapshot" ? (
              <SnapshotBody card={card} />
            ) : (
              <BarsBody card={card} accent={accentVar} />
            )}
          </CardShell>
        ))}
      </div>

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
}: {
  card: Extract<NewsMetricCard, { variant: "snapshot" }>;
}) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <div
          className="v2-mono text-[10px] tracking-[0.18em] uppercase"
          style={{ color: "var(--v3-ink-300)" }}
        >
          {card.label}
        </div>
        <div
          className="mt-2 tabular-nums"
          style={{
            fontFamily: "var(--font-geist), Inter, sans-serif",
            fontWeight: 300,
            fontSize: "clamp(40px, 5vw, 56px)",
            letterSpacing: "-0.035em",
            lineHeight: 1,
            color: "var(--v3-ink-000)",
          }}
        >
          {card.value}
        </div>
        {card.hint ? (
          <div
            className="mt-2 v2-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {card.hint}
          </div>
        ) : null}
      </div>

      {card.rows && card.rows.length > 0 ? (
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
  if (bars.length === 0) {
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
