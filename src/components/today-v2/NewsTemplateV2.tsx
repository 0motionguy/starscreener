// V2 news template — shared layout for every news source page (HN,
// Lobsters, Dev.to, Bluesky, Reddit) plus the unified Market Signals
// page. All instances render identical chrome: a hero with one big
// counter + two trend charts, then a unified table of news items.
//
// Demo only. Mock data is generated deterministically from the page
// slug so screenshots are stable but each source feels distinct.

import Link from "next/link";
import { ArrowUpRight, MessagesSquare, Bookmark } from "lucide-react";

import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BracketMarkers } from "@/components/today-v2/primitives/BracketMarkers";
import { BarcodeTicker } from "@/components/today-v2/primitives/BarcodeTicker";
import {
  FeaturedCardsV2,
  type FeaturedItem,
} from "@/components/today-v2/FeaturedCardsV2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewsSourceMeta {
  /** Single-letter code shown on row pills. */
  code: string;
  /** Full label, e.g. "HACKERNEWS". */
  label: string;
  /** Brand color for this source — used on pills + chart series. */
  color: string;
  /** Page slug (e.g. "hackernews"). */
  slug: string;
}

export interface NewsItem {
  id: string;
  title: string;
  /** Source code; for the unified Market Signals page rows mix. */
  source: string;
  /** Author / handle without leading @. */
  author: string;
  /** Score (HN points, Bluesky reactions, etc). */
  score: number;
  /** Mention count or comments. */
  mentions: number;
  /** Repo this item references (or null). */
  repo: string | null;
  /** Relative time string ("3h ago"). */
  age: string;
  /** Heat tier — drives row tint. */
  heat: "breakout" | "hot" | "rising" | "neutral";
}

interface NewsTemplateV2Props {
  /** Page-level metadata. The unified page uses { code: "ALL", ... }. */
  source: NewsSourceMeta;
  /** Sources represented in the data — for the stacked-bar legend. */
  channels: NewsSourceMeta[];
  /** Mock data rows. */
  items: NewsItem[];
  /** Pre-computed counter (today's mentions). */
  todayCounter: number;
  /** 24h delta (signed). */
  todayDelta: number;
  /** 7d stacked bar data — one bar per day, segments per channel. */
  stackedBars: Array<{ day: string; segments: Record<string, number> }>;
  /** Multi-line trending topics — top 5 over 7d. */
  topicLines: Array<{ topic: string; values: number[]; color: string }>;
  /** 3 editorial picks rendered above the table. */
  featured?: FeaturedItem[];
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function NewsTemplateV2({
  source,
  channels,
  items,
  todayCounter,
  todayDelta,
  stackedBars,
  topicLines,
  featured,
}: NewsTemplateV2Props) {
  const isUnified = source.code === "ALL";

  return (
    <>
      <NewsHero
        source={source}
        channels={channels}
        todayCounter={todayCounter}
        todayDelta={todayDelta}
        stackedBars={stackedBars}
        topicLines={topicLines}
      />
      {featured && featured.length > 0 ? (
        <FeaturedCardsV2 items={featured} />
      ) : null}
      <NewsTable source={source} items={items} showSourceColumn={isUnified} />
    </>
  );
}

// ---------------------------------------------------------------------------
// HERO — eyebrow + headline + 1 counter + 2 charts in a 3-column grid
// ---------------------------------------------------------------------------

interface NewsHeroProps {
  source: NewsSourceMeta;
  channels: NewsSourceMeta[];
  todayCounter: number;
  todayDelta: number;
  stackedBars: NewsTemplateV2Props["stackedBars"];
  topicLines: NewsTemplateV2Props["topicLines"];
}

function NewsHero({
  source,
  channels,
  todayCounter,
  todayDelta,
  stackedBars,
  topicLines,
}: NewsHeroProps) {
  const positive = todayDelta >= 0;
  const deltaColor = positive
    ? "var(--v2-sig-green)"
    : "var(--v2-sig-red)";

  // Title line — small mono uppercase, sits above the hero charts like a
  // logo. Replaces the previous giant display headline so the page leads
  // with the data, not the title.
  const titleLine =
    source.label === "ALL"
      ? "MARKET SIGNALS · CROSS-SOURCE"
      : `${source.label} · SIGNAL TERMINAL`;

  return (
    <section className="border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame pt-6 pb-6">
        {/* Single mono title line — eyebrow + page name combined. */}
        <h1
          className="v2-mono mb-4 inline-flex items-center gap-2"
          style={{ color: "var(--v2-ink-100)", fontSize: 12, letterSpacing: "0.20em" }}
        >
          <span aria-hidden>{"// "}</span>
          {titleLine}
          <span
            aria-hidden
            className="inline-block ml-1"
            style={{
              width: 6,
              height: 6,
              background: "var(--v2-acc)",
              borderRadius: 1,
              boxShadow: "0 0 6px var(--v2-acc-glow)",
            }}
          />
        </h1>

        {/* 3-column hero grid: counter | stacked-bar | topic-lines */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-3">
          {/* COUNTER — bracket-marked, the centerpiece KPI */}
          <div className="v2-card v2-bracket relative overflow-hidden">
            <BracketMarkers />
            <TerminalBar
              label="// MENTIONS · 24H"
              status={
                <span style={{ color: deltaColor }} className="tabular-nums">
                  {positive ? "+" : ""}
                  {todayDelta.toLocaleString("en-US")}
                </span>
              }
            />
            <div className="p-4 flex flex-col gap-3">
              <div>
                <span className="v2-mono" style={{ color: "var(--v2-ink-300)" }}>
                  TOTAL TODAY
                </span>
                <div
                  className="mt-1 tabular-nums"
                  style={{
                    fontFamily: "var(--font-geist), Inter, sans-serif",
                    fontWeight: 300,
                    fontSize: "clamp(32px, 4.5vw, 48px)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: "var(--v2-ink-000)",
                  }}
                >
                  {todayCounter.toLocaleString("en-US")}
                </div>
                <div className="mt-1 v2-mono" style={{ color: "var(--v2-ink-400)" }}>
                  ACROSS {channels.length} {channels.length === 1 ? "SOURCE" : "SOURCES"}
                </div>
              </div>

              {/* Per-source mini-counters */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {channels.slice(0, 4).map((ch) => (
                  <div
                    key={ch.code}
                    className="flex items-center justify-between"
                    style={{
                      borderTop: "1px dashed var(--v2-line-200)",
                      paddingTop: 4,
                    }}
                  >
                    <span
                      className="v2-mono inline-flex items-center gap-1.5"
                      style={{ color: "var(--v2-ink-300)" }}
                    >
                      <span
                        aria-hidden
                        className="inline-block w-1.5 h-1.5"
                        style={{ background: ch.color, borderRadius: 1 }}
                      />
                      {ch.code}
                    </span>
                    <span
                      className="v2-mono tabular-nums"
                      style={{ color: "var(--v2-ink-100)" }}
                    >
                      {Math.round(todayCounter / channels.length).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CHART 1 — stacked bar: mentions per source over 7d */}
          <div className="v2-card overflow-hidden">
            <TerminalBar
              label="// MENTIONS · PER SOURCE · 7D"
              status={
                <span className="tabular-nums">
                  {stackedBars.length}D
                </span>
              }
            />
            <div className="p-3">
              <StackedBarChart
                data={stackedBars}
                channels={channels}
                height={140}
              />
              {/* Legend — tight, single row preferred */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {channels.map((ch) => (
                  <span
                    key={ch.code}
                    className="v2-mono inline-flex items-center gap-1"
                    style={{ color: "var(--v2-ink-300)", fontSize: 9 }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-1.5 h-1.5"
                      style={{ background: ch.color, borderRadius: 1 }}
                    />
                    {ch.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* CHART 2 — multi-line: top 5 trending topics */}
          <div className="v2-card overflow-hidden">
            <TerminalBar
              label="// TOPICS · TRENDING · 7D"
              status={
                <span className="tabular-nums">{topicLines.length} TOP</span>
              }
            />
            <div className="p-3">
              <MultiLineChart data={topicLines} height={140} />
              <div className="mt-2 flex flex-col gap-0.5">
                {topicLines.map((t) => (
                  <div
                    key={t.topic}
                    className="flex items-center justify-between v2-mono"
                    style={{ fontSize: 9 }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span
                        aria-hidden
                        className="inline-block w-1.5 h-1.5"
                        style={{ background: t.color, borderRadius: 1 }}
                      />
                      <span style={{ color: "var(--v2-ink-200)" }}>
                        {t.topic}
                      </span>
                    </span>
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--v2-ink-100)" }}
                    >
                      {t.values[t.values.length - 1].toLocaleString("en-US")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CHART — stacked vertical bars (one per day, segments per channel)
// ---------------------------------------------------------------------------

function StackedBarChart({
  data,
  channels,
  height,
}: {
  data: NewsTemplateV2Props["stackedBars"];
  channels: NewsSourceMeta[];
  height: number;
}) {
  const padding = { top: 12, right: 8, bottom: 28, left: 36 };
  const width = 520;
  const innerH = height - padding.top - padding.bottom;
  const innerW = width - padding.left - padding.right;

  // Compute total per day, then global max for the y-axis.
  const totals = data.map((d) =>
    Object.values(d.segments).reduce((s, v) => s + v, 0),
  );
  const max = Math.max(...totals, 1);

  const barW = innerW / data.length - 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full h-auto"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Y-axis grid lines (4 ticks) */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padding.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="var(--v2-line-200)"
              strokeWidth={0.5}
              strokeDasharray={t === 0 ? "0" : "2 3"}
              opacity={t === 0 ? 0.6 : 0.3}
            />
            <text
              x={padding.left - 6}
              y={y + 3}
              textAnchor="end"
              fill="var(--v2-ink-400)"
              fontSize={9}
              fontFamily="var(--font-geist-mono), monospace"
              style={{ letterSpacing: "0.06em" }}
            >
              {Math.round(max * t)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((day, i) => {
        const x = padding.left + i * (innerW / data.length) + 2;
        let yCursor = padding.top + innerH;
        return (
          <g key={day.day}>
            {channels.map((ch) => {
              const v = day.segments[ch.code] ?? 0;
              const h = (v / max) * innerH;
              yCursor -= h;
              return (
                <rect
                  key={ch.code}
                  x={x}
                  y={yCursor}
                  width={barW}
                  height={h}
                  fill={ch.color}
                />
              );
            })}
            {/* X-axis label */}
            {i % 2 === 0 ? (
              <text
                x={x + barW / 2}
                y={height - 8}
                textAnchor="middle"
                fill="var(--v2-ink-400)"
                fontSize={9}
                fontFamily="var(--font-geist-mono), monospace"
                style={{ letterSpacing: "0.06em" }}
              >
                {day.day}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CHART — multi-line series with axis labels
// ---------------------------------------------------------------------------

function MultiLineChart({
  data,
  height,
}: {
  data: NewsTemplateV2Props["topicLines"];
  height: number;
}) {
  const padding = { top: 12, right: 8, bottom: 28, left: 36 };
  const width = 520;
  const innerH = height - padding.top - padding.bottom;
  const innerW = width - padding.left - padding.right;

  const all = data.flatMap((d) => d.values);
  const max = Math.max(...all, 1);
  const points = data[0]?.values.length ?? 7;

  const xAt = (i: number) =>
    padding.left + (i / Math.max(1, points - 1)) * innerW;
  const yAt = (v: number) => padding.top + innerH * (1 - v / max);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full h-auto"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Y-axis grid lines */}
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1={padding.left}
            y1={padding.top + innerH * (1 - t)}
            x2={width - padding.right}
            y2={padding.top + innerH * (1 - t)}
            stroke="var(--v2-line-200)"
            strokeWidth={0.5}
            strokeDasharray={t === 0 ? "0" : "2 3"}
            opacity={t === 0 ? 0.6 : 0.3}
          />
          <text
            x={padding.left - 6}
            y={padding.top + innerH * (1 - t) + 3}
            textAnchor="end"
            fill="var(--v2-ink-400)"
            fontSize={9}
            fontFamily="var(--font-geist-mono), monospace"
            style={{ letterSpacing: "0.06em" }}
          >
            {Math.round(max * t)}
          </text>
        </g>
      ))}

      {/* Line series */}
      {data.map((line) => {
        const path = line.values
          .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
          .join(" ");
        return (
          <g key={line.topic}>
            <path
              d={path}
              fill="none"
              stroke={line.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Last point marker */}
            <rect
              x={xAt(line.values.length - 1) - 3}
              y={yAt(line.values[line.values.length - 1]) - 3}
              width={6}
              height={6}
              fill={line.color}
              stroke="#000"
              strokeWidth={0.5}
            />
          </g>
        );
      })}

      {/* X-axis tick at left and right */}
      <text
        x={padding.left}
        y={height - 8}
        fill="var(--v2-ink-400)"
        fontSize={9}
        fontFamily="var(--font-geist-mono), monospace"
        style={{ letterSpacing: "0.06em" }}
      >
        7D AGO
      </text>
      <text
        x={width - padding.right}
        y={height - 8}
        textAnchor="end"
        fill="var(--v2-ink-400)"
        fontSize={9}
        fontFamily="var(--font-geist-mono), monospace"
        style={{ letterSpacing: "0.06em" }}
      >
        TODAY
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TABLE — unified rows (with optional source pill column)
// ---------------------------------------------------------------------------

function NewsTable({
  source,
  items,
  showSourceColumn,
}: {
  source: NewsSourceMeta;
  items: NewsItem[];
  showSourceColumn: boolean;
}) {
  return (
    <section className="border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame py-10">
        <header className="mb-5">
          <p className="v2-mono mb-2">
            <span aria-hidden>{"// "}</span>
            STAGE 02 · VALIDATE · {source.label} FEED
          </p>
          <h2 className="v2-h1">Signal feed</h2>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--v2-ink-200)]">
            Top items by 7d mention volume. {showSourceColumn ? "Sources mixed; tagged on each row." : "Each row links back to the source."}
          </p>
        </header>

        <div className="v2-card overflow-hidden">
          <TerminalBar
            label={`// ${source.label} · TABLE`}
            status={
              <>
                <span className="tabular-nums">{items.length}</span> ROWS · LIVE
              </>
            }
          />

          <div className="overflow-x-auto">
            <table
              className="w-full"
              style={{
                borderCollapse: "collapse",
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: "var(--v2-bg-100)" }}>
                  <Th align="left" width={56}>
                    #
                  </Th>
                  {showSourceColumn ? <Th align="left" width={70}>SRC</Th> : null}
                  <Th align="left">TITLE</Th>
                  <Th align="left" width={140}>
                    AUTHOR · REPO
                  </Th>
                  <Th align="right" width={90}>
                    SCORE
                  </Th>
                  <Th align="right" width={100}>
                    MENTIONS
                  </Th>
                  <Th align="right" width={80}>
                    AGE
                  </Th>
                  <Th align="right" width={50}>
                    {" "}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <Row
                    key={row.id}
                    row={row}
                    rank={i + 1}
                    showSourceColumn={showSourceColumn}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="px-3 py-2 border-t flex items-center justify-between v2-mono"
            style={{
              borderColor: "var(--v2-line-100)",
              background: "var(--v2-bg-050)",
            }}
          >
            <BarcodeTicker
              left={`// ${source.label}`}
              middle={`${items.length} ROWS`}
              right="LIVE"
              bars={20}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Th({
  children,
  align = "left",
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: number;
}) {
  return (
    <th
      style={{
        textAlign: align,
        fontWeight: 400,
        fontSize: 10,
        letterSpacing: "0.20em",
        textTransform: "uppercase",
        color: "var(--v2-ink-400)",
        padding: "10px 12px",
        borderBottom: "1px solid var(--v2-line-200)",
        width,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Row({
  row,
  rank,
  showSourceColumn,
}: {
  row: NewsItem;
  rank: number;
  showSourceColumn: boolean;
}) {
  const isTop = rank === 1;
  const heatColor =
    row.heat === "breakout"
      ? "var(--v2-acc)"
      : row.heat === "hot"
        ? "var(--v2-acc-dim)"
        : row.heat === "rising"
          ? "var(--v2-sig-green)"
          : "var(--v2-ink-400)";

  return (
    <tr
      className="group v2-row"
      style={{
        borderBottom: "1px dashed var(--v2-line-100)",
        background: isTop ? "var(--v2-acc-soft)" : "transparent",
        transition: "background-color 120ms ease-out",
      }}
    >
      {/* RANK */}
      <td style={{ padding: "12px", color: "var(--v2-ink-300)" }}>
        <span
          className={isTop ? "v2-bracket inline-flex relative" : "inline-flex"}
          style={{ padding: isTop ? "4px 8px" : "0" }}
        >
          {isTop ? (
            <>
              <span aria-hidden className="v2-br1" />
              <span aria-hidden className="v2-br2" />
            </>
          ) : null}
          <span
            className="tabular-nums"
            style={{
              color: isTop ? "var(--v2-acc)" : "var(--v2-ink-200)",
              fontWeight: isTop ? 500 : 400,
            }}
          >
            #{rank}
          </span>
        </span>
      </td>

      {/* SOURCE pill — only on the unified Market Signals page */}
      {showSourceColumn ? (
        <td style={{ padding: "12px" }}>
          <SourcePill code={row.source} />
        </td>
      ) : null}

      {/* TITLE — prominent ink-100 with hover tint */}
      <td style={{ padding: "12px" }}>
        <Link
          href="#"
          className="block group/title"
          style={{
            fontFamily: "var(--font-geist), Inter, sans-serif",
            fontSize: 13,
            fontWeight: 510,
            letterSpacing: "-0.005em",
            color: "var(--v2-ink-100)",
            lineHeight: 1.35,
          }}
        >
          {row.title}
        </Link>
      </td>

      {/* AUTHOR · REPO */}
      <td style={{ padding: "12px" }}>
        <span style={{ color: "var(--v2-ink-300)" }}>@{row.author}</span>
        {row.repo ? (
          <>
            <span aria-hidden style={{ color: "var(--v2-line-300)", margin: "0 6px" }}>
              ·
            </span>
            <span style={{ color: "var(--v2-ink-200)" }}>{row.repo}</span>
          </>
        ) : null}
      </td>

      {/* SCORE — with heat-tone */}
      <td
        style={{
          padding: "12px",
          textAlign: "right",
        }}
      >
        <span style={{ color: heatColor }} className="tabular-nums">
          {row.score.toLocaleString("en-US")}
        </span>
      </td>

      {/* MENTIONS */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <span
          className="inline-flex items-center gap-1 tabular-nums"
          style={{ color: "var(--v2-ink-100)" }}
        >
          <MessagesSquare
            className="size-3 shrink-0"
            style={{ color: "var(--v2-ink-400)" }}
            aria-hidden
          />
          {row.mentions}
        </span>
      </td>

      {/* AGE */}
      <td
        style={{
          padding: "12px",
          textAlign: "right",
          color: "var(--v2-ink-300)",
        }}
      >
        {row.age}
      </td>

      {/* ACTIONS */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <span className="inline-flex items-center gap-2">
          <Bookmark
            className="size-3.5"
            style={{ color: "var(--v2-ink-500)" }}
            aria-hidden
          />
          <ArrowUpRight
            className="size-3.5"
            style={{ color: "var(--v2-ink-500)" }}
            aria-hidden
          />
        </span>
      </td>
    </tr>
  );
}

function SourcePill({ code }: { code: string }) {
  const meta = SOURCE_COLORS[code] ?? {
    label: code,
    color: "var(--v2-ink-300)",
  };
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5"
      style={{
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 9,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        border: `1px solid ${meta.color}`,
        background: meta.color.replace("0.85", "0.12"),
        color: meta.color.replace("0.85", "1"),
        borderRadius: 1,
      }}
    >
      {code}
    </span>
  );
}

const SOURCE_COLORS: Record<string, { label: string; color: string }> = {
  HN: { label: "HACKERNEWS", color: "rgba(245, 110, 15, 0.85)" },
  L: { label: "LOBSTERS", color: "rgba(132, 110, 195, 0.85)" },
  D: { label: "DEVTO", color: "rgba(102, 153, 255, 0.85)" },
  B: { label: "BLUESKY", color: "rgba(58, 214, 197, 0.85)" },
  R: { label: "REDDIT", color: "rgba(255, 77, 77, 0.85)" },
  X: { label: "TWITTER", color: "rgba(220, 168, 43, 0.85)" },
  CC: { label: "CLAUDE CODE", color: "rgba(217, 119, 87, 0.85)" },
  CX: { label: "CODEX", color: "rgba(110, 231, 183, 0.85)" },
  PP: { label: "PERPLEXITY", color: "rgba(96, 165, 250, 0.85)" },
};
