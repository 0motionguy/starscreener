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
  /**
   * Optional body excerpt — used by featured cards. Sources without an
   * intrinsic body (HN headlines, Lobsters titles) leave this blank;
   * the featured card falls back to a meta-line built from author/score.
   */
  body?: string;
}

/**
 * Per-source volume row — real count + summed score from the current
 * snapshot. No fake time series.
 */
export interface SourceVolume {
  code: string;
  label: string;
  color: string;
  itemCount: number;
  totalScore: number;
}

/**
 * Top topic — real frequency count of a token across the current item
 * set. Renders as a horizontal bar in the hero.
 */
export interface TopTopic {
  topic: string;
  count: number;
  color: string;
}

interface NewsTemplateV2Props {
  /** Page-level metadata. The unified page uses { code: "ALL", ... }. */
  source: NewsSourceMeta;
  /** Sources represented in the data — drives the per-source volume bar. */
  channels: NewsSourceMeta[];
  /** Real item rows. */
  items: NewsItem[];
  /** Real total of items in this snapshot. */
  totalItems: number;
  /** Real sum of all item scores. */
  totalScore: number;
  /** Real top item (highest score). */
  topItem: NewsItem | null;
  /** Real per-source volume rows. */
  sourceVolume: SourceVolume[];
  /** Real top-N most-mentioned tokens across item titles. */
  topTopics: TopTopic[];
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
  totalItems,
  totalScore,
  topItem,
  sourceVolume,
  topTopics,
  featured,
}: NewsTemplateV2Props) {
  const isUnified = source.code === "ALL";

  return (
    <>
      <NewsHero
        source={source}
        channels={channels}
        totalItems={totalItems}
        totalScore={totalScore}
        topItem={topItem}
        sourceVolume={sourceVolume}
        topTopics={topTopics}
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
  totalItems: number;
  totalScore: number;
  topItem: NewsItem | null;
  sourceVolume: SourceVolume[];
  topTopics: TopTopic[];
}

function NewsHero({
  source,
  channels,
  totalItems,
  totalScore,
  topItem,
  sourceVolume,
  topTopics,
}: NewsHeroProps) {
  const titleLine =
    source.label === "ALL"
      ? "MARKET SIGNALS · CROSS-SOURCE"
      : `${source.label} · SIGNAL TERMINAL`;

  // Find the max for the per-source bar so we can size each bar
  // proportionally without inventing a y-axis.
  const sourceMax = Math.max(...sourceVolume.map((s) => s.itemCount), 1);
  const topicMax = Math.max(...topTopics.map((t) => t.count), 1);

  return (
    <section className="border-b border-[color:var(--v2-line-100)]">
      <div className="v2-frame pt-6 pb-6">
        <h1
          className="v2-mono mb-4 inline-flex items-center gap-2"
          style={{
            color: "var(--v2-ink-100)",
            fontSize: 12,
            letterSpacing: "0.20em",
          }}
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

        {/* 3-column hero grid: counter | per-source volume | top topics */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-3">
          {/* COUNTER — real total of current snapshot */}
          <div className="v2-card v2-bracket relative overflow-hidden">
            <BracketMarkers />
            <TerminalBar
              label="// SNAPSHOT · NOW"
              status={
                <span
                  className="tabular-nums"
                  style={{ color: "var(--v2-ink-200)" }}
                >
                  {totalItems} ITEMS
                </span>
              }
            />
            <div className="p-4 flex flex-col gap-3">
              <div>
                <span
                  className="v2-mono"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  ITEMS TRACKED
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
                  {totalItems.toLocaleString("en-US")}
                </div>
                <div
                  className="mt-1 v2-mono"
                  style={{ color: "var(--v2-ink-400)" }}
                >
                  ACROSS {channels.length}{" "}
                  {channels.length === 1 ? "SOURCE" : "SOURCES"}
                </div>
              </div>

              {/* Total score + top item — both real snapshot values */}
              <div className="grid grid-cols-1 gap-1">
                <div
                  className="flex items-center justify-between v2-mono"
                  style={{
                    borderTop: "1px dashed var(--v2-line-200)",
                    paddingTop: 4,
                  }}
                >
                  <span style={{ color: "var(--v2-ink-300)" }}>
                    TOTAL SCORE
                  </span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--v2-ink-100)" }}
                  >
                    {totalScore.toLocaleString("en-US")}
                  </span>
                </div>
                {topItem ? (
                  <div
                    className="flex items-center justify-between v2-mono"
                    style={{
                      borderTop: "1px dashed var(--v2-line-200)",
                      paddingTop: 4,
                    }}
                  >
                    <span style={{ color: "var(--v2-ink-300)" }}>
                      TOP SCORE
                    </span>
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--v2-acc)" }}
                    >
                      {topItem.score.toLocaleString("en-US")}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* PER-SOURCE VOLUME — horizontal bars, one per source */}
          <div className="v2-card overflow-hidden">
            <TerminalBar
              label="// VOLUME · PER SOURCE"
              status={
                <span className="tabular-nums">
                  {sourceVolume.length}{" "}
                  {sourceVolume.length === 1 ? "CHANNEL" : "CHANNELS"}
                </span>
              }
            />
            <div className="p-3 space-y-1.5">
              {sourceVolume.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center gap-2"
                  style={{ minHeight: 22 }}
                >
                  <span
                    className="v2-mono shrink-0 w-12"
                    style={{
                      color: "var(--v2-ink-200)",
                      fontSize: 10,
                    }}
                  >
                    {s.code}
                  </span>
                  <div
                    className="flex-1 relative"
                    style={{
                      height: 14,
                      background: "var(--v2-bg-100)",
                      borderRadius: 1,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${(s.itemCount / sourceMax) * 100}%`,
                        background: s.color,
                        borderRadius: 1,
                        minWidth: s.itemCount > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  <span
                    className="v2-mono tabular-nums shrink-0 w-14 text-right"
                    style={{
                      color: "var(--v2-ink-100)",
                      fontSize: 10,
                    }}
                  >
                    {s.itemCount}
                  </span>
                  <span
                    className="v2-mono tabular-nums shrink-0 w-16 text-right"
                    style={{
                      color: "var(--v2-ink-400)",
                      fontSize: 9,
                    }}
                  >
                    {s.totalScore.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
              {sourceVolume.length === 0 ? (
                <div
                  className="v2-mono py-6 text-center"
                  style={{ color: "var(--v2-ink-500)" }}
                >
                  <span aria-hidden>{"// "}</span>
                  NO SOURCES IN SNAPSHOT
                </div>
              ) : null}
            </div>
          </div>

          {/* TOP TOPICS — most-mentioned tokens across current items */}
          <div className="v2-card overflow-hidden">
            <TerminalBar
              label="// TOPICS · MENTIONED MOST"
              status={
                <span className="tabular-nums">
                  TOP {topTopics.length}
                </span>
              }
            />
            <div className="p-3 space-y-1.5">
              {topTopics.map((t) => (
                <div
                  key={t.topic}
                  className="flex items-center gap-2"
                  style={{ minHeight: 22 }}
                >
                  <span
                    className="v2-mono shrink-0 w-32 truncate"
                    style={{
                      color: "var(--v2-ink-200)",
                      fontSize: 10,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                    title={t.topic}
                  >
                    {t.topic}
                  </span>
                  <div
                    className="flex-1 relative"
                    style={{
                      height: 14,
                      background: "var(--v2-bg-100)",
                      borderRadius: 1,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${(t.count / topicMax) * 100}%`,
                        background: t.color,
                        borderRadius: 1,
                        minWidth: t.count > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  <span
                    className="v2-mono tabular-nums shrink-0 w-10 text-right"
                    style={{
                      color: "var(--v2-ink-100)",
                      fontSize: 10,
                    }}
                  >
                    {t.count}
                  </span>
                </div>
              ))}
              {topTopics.length === 0 ? (
                <div
                  className="v2-mono py-6 text-center"
                  style={{ color: "var(--v2-ink-500)" }}
                >
                  <span aria-hidden>{"// "}</span>
                  NO TOPICS YET
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
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
