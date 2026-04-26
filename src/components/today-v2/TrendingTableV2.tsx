// V2 trending table — design demo. Same columns as the original
// TerminalLayout (rank, repo, source pills, stars, 24h, 7d, trend, forks)
// but every row is restyled in V2 chrome:
//   - Geist Mono numbers with tabular-nums
//   - V2 ink ramp on column hierarchy
//   - V2 tag pills for source badges (X / R / Y / B / D)
//   - Hairline dashed dividers between rows
//   - Bracket markers on the #1 row (crown of the day)
//   - Hover row inverts to bg-100
//
// Demo only — no sort, no filter, no virtualization. Renders the first
// `limit` rows already sorted by 24h delta.

import Link from "next/link";
import {
  Crown,
  Bookmark,
  ArrowUpDown,
  Triangle,
} from "lucide-react";

import type { Repo } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

interface TrendingTableV2Props {
  repos: Repo[];
  /** Cap rendered rows. Default 20 (one screen on a 14" laptop). */
  limit?: number;
  /**
   * Sort field. Default `delta24h` keeps the homepage "what's hot now"
   * behaviour. `stars` is for /top and similar by-total-stars views.
   * Pass `none` if `repos` is already sorted upstream.
   */
  sortBy?: "delta24h" | "stars" | "none";
  /** Optional title above the terminal-bar header. Hidden on the homepage. */
  title?: string;
  /** Optional subtitle under the title. */
  subtitle?: string;
}

// Source-pill metadata. Maps a 1-letter code to its row color and label.
// The icon counts are synthesized from the repo's signal channels for
// the demo so each row looks busy.
type SourceCode = "X" | "R" | "Y" | "B" | "D" | "L";

const SOURCES: { code: SourceCode; label: string; color: string }[] = [
  { code: "X", label: "TWITTER", color: "rgba(220,168,43,0.85)" },
  { code: "R", label: "REDDIT", color: "rgba(255, 77, 77, 0.85)" },
  { code: "Y", label: "HN", color: "rgba(245, 110, 15, 0.85)" },
  { code: "B", label: "BLUESKY", color: "rgba(58, 214, 197, 0.85)" },
  { code: "D", label: "DEVTO", color: "rgba(102, 153, 255, 0.85)" },
  { code: "L", label: "LOBSTERS", color: "rgba(132, 110, 195, 0.85)" },
];

// Stable per-repo hash — picks 2-3 source pills per row deterministically
// so screenshots don't shuffle on each refresh.
function pickSources(id: string): { code: SourceCode; count: number; color: string }[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const count = (h % 3) + 1; // 1 to 3 source pills per row
  const result: { code: SourceCode; count: number; color: string }[] = [];
  for (let i = 0; i < count; i++) {
    const src = SOURCES[(h + i * 7) % SOURCES.length];
    const cnt = ((h >> (i * 3)) % 18) + 1;
    if (!result.find((r) => r.code === src.code)) {
      result.push({ code: src.code, count: cnt, color: src.color });
    }
  }
  return result;
}

// Synthesize a rank-change indicator (▲ N / ▼ N / —) from a stable hash.
// Demo only — real wiring would come from a rank-history store.
function pickRankDelta(id: string, rank: number): { dir: "up" | "down" | "flat"; mag: number } {
  if (rank === 1) {
    // Top spot — show a ▼ N to indicate it's been climbing the chart.
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) | 0;
    return { dir: "down", mag: (Math.abs(h) % 12) + 2 };
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 23 + id.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const rem = h % 7;
  if (rem === 0) return { dir: "flat", mag: 0 };
  if (rem < 4) return { dir: "down", mag: (h % 4) + 1 };
  return { dir: "up", mag: (h % 4) + 1 };
}

export function TrendingTableV2({
  repos,
  limit = 20,
  sortBy = "delta24h",
  title,
  subtitle,
}: TrendingTableV2Props) {
  const sorted =
    sortBy === "stars"
      ? [...repos].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
      : sortBy === "delta24h"
        ? [...repos].sort(
            (a, b) => (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0),
          )
        : repos;
  const rows = sorted.slice(0, limit);

  return (
    <section
      id="repos-table"
      className="border-b border-[color:var(--v2-line-100)]"
    >
      <div className="v2-frame py-12">
        {title || subtitle ? (
          <header className="mb-6">
            <p className="v2-mono mb-2">
              <span aria-hidden>{"// "}</span>
              STAGE 01 · DISCOVER · ALL REPOS
            </p>
            {title ? <h2 className="v2-h1">{title}</h2> : null}
            {subtitle ? (
              <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--v2-ink-200)]">
                {subtitle}
              </p>
            ) : null}
          </header>
        ) : null}

        <div className="v2-card overflow-hidden">
          <TerminalBar
            label="// REPOS · TERMINAL"
            status={
              <>
                <span className="tabular-nums">{rows.length}</span> ROWS · LIVE
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
              {/* Sticky header row — mono uppercase, ink-400, thin border-bottom */}
              <thead>
                <tr style={{ background: "var(--v2-bg-050)" }}>
                  <Th align="left" width={68}>
                    #
                  </Th>
                  <Th align="left">REPO</Th>
                  <Th align="right" width={120}>
                    STARS
                  </Th>
                  <Th align="right" width={110}>
                    24H ★
                  </Th>
                  <Th align="right" width={110}>
                    7D ★
                  </Th>
                  <Th align="right" width={110}>
                    TREND
                  </Th>
                  <Th align="right" width={90}>
                    FORKS
                  </Th>
                  <Th align="right" width={70}>
                    {" "}
                  </Th>
                </tr>
              </thead>

              <tbody>
                {rows.map((repo, i) => (
                  <Row key={repo.id} repo={repo} rank={i + 1} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer ticker */}
          <div
            className="px-3 py-2 border-t flex items-center justify-between v2-mono"
            style={{
              borderColor: "var(--v2-line-100)",
              background: "var(--v2-bg-050)",
            }}
          >
            <span style={{ color: "var(--v2-ink-400)" }}>
              <span aria-hidden>{"// "}</span>
              SHOWING <span className="text-[color:var(--v2-ink-100)] tabular-nums">{rows.length}</span>{" "}
              OF <span className="text-[color:var(--v2-ink-100)] tabular-nums">{repos.length}</span>
            </span>
            <span style={{ color: "var(--v2-ink-400)" }}>
              <ArrowUpDown
                className="size-3 inline-block mr-1"
                aria-hidden
                style={{ verticalAlign: "-2px" }}
              />
              SORT BY <span className="text-[color:var(--v2-ink-100)]">24H ★</span>{" "}
              DESCENDING
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Header cell
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Body row — bracket-marked when rank=1, dashed divider, hover row
// ---------------------------------------------------------------------------

function Row({ repo, rank }: { repo: Repo; rank: number }) {
  const isTop = rank === 1;
  const sources = pickSources(repo.id);
  const rankDelta = pickRankDelta(repo.id, rank);
  const stars = repo.stars ?? 0;
  const delta24 = repo.starsDelta24h ?? 0;
  const delta24Pct = stars > 0 ? (delta24 / stars) * 100 : 0;
  const delta7 = repo.starsDelta7d ?? 0;
  const delta7Pct = stars > 0 ? (delta7 / stars) * 100 : 0;

  // Trend = 7d delta in absolute value (matches the screenshot column).
  const trend = Math.abs(delta7);

  return (
    <tr
      className="group v2-row"
      style={{
        borderBottom: "1px dashed var(--v2-line-100)",
        background: isTop ? "rgba(245, 110, 15, 0.04)" : "transparent",
        transition: "background-color 120ms ease-out",
      }}
    >
      {/* RANK column — number + ▲▼ indicator + crown on #1.
          Bracket markers are scoped to the rank cell so they don't span
          the whole row (which would look messy on a wide table). */}
      <td
        style={{
          padding: "12px",
          color: "var(--v2-ink-300)",
          position: "relative",
        }}
      >
        <span
          className={cn("inline-flex items-center gap-1.5 relative", isTop && "v2-bracket")}
          style={{
            padding: isTop ? "4px 8px" : "0",
          }}
        >
          {isTop ? (
            <>
              <span aria-hidden className="v2-br1" />
              <span aria-hidden className="v2-br2" />
              <Crown
                className="size-3 shrink-0"
                style={{ color: "var(--v2-acc)" }}
                aria-hidden
              />
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
          {rankDelta.dir !== "flat" ? (
            <span
              className="inline-flex items-center gap-0.5"
              style={{
                fontSize: 10,
                color:
                  rankDelta.dir === "up"
                    ? "var(--v2-sig-green)"
                    : "var(--v2-sig-red)",
              }}
            >
              <Triangle
                className="size-2"
                style={{
                  fill: "currentColor",
                  transform:
                    rankDelta.dir === "up" ? "none" : "rotate(180deg)",
                }}
                aria-hidden
              />
              <span className="tabular-nums">{rankDelta.mag}</span>
            </span>
          ) : (
            <span style={{ color: "var(--v2-ink-500)", fontSize: 10 }}>—</span>
          )}
        </span>
      </td>

      {/* REPO column — avatar + fullname + source pills */}
      <td style={{ padding: "12px" }}>
        <Link
          href={`/repo/${repo.owner}/${repo.name}`}
          className="flex items-center gap-3 min-w-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={repo.ownerAvatarUrl}
            alt=""
            width={20}
            height={20}
            loading="lazy"
            className="size-5 shrink-0"
            style={{
              border: "1px solid var(--v2-line-200)",
              background: "var(--v2-bg-100)",
              borderRadius: 1,
            }}
          />
          <span
            className="truncate"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12,
              letterSpacing: "0.02em",
              color: "var(--v2-ink-100)",
              maxWidth: 280,
            }}
          >
            {repo.fullName}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {sources.map((s) => (
              <span
                key={s.code}
                className="inline-flex items-center gap-1 px-1.5 py-0.5"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 9,
                  letterSpacing: "0.10em",
                  border: `1px solid ${s.color}`,
                  background: `${s.color.replace("0.85", "0.10")}`,
                  color: s.color.replace("0.85", "1"),
                  borderRadius: 1,
                }}
                title={SOURCES.find((src) => src.code === s.code)?.label}
              >
                <span>{s.code}</span>
                <span className="tabular-nums">{s.count}</span>
              </span>
            ))}
          </span>
        </Link>
      </td>

      {/* STARS column — total */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <span style={{ color: "var(--v2-ink-400)" }} aria-hidden>
          ★{" "}
        </span>
        <span
          className="tabular-nums"
          style={{ color: "var(--v2-ink-100)" }}
        >
          {formatNumber(stars)}
        </span>
      </td>

      {/* 24H column — value + percent */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <DeltaCell value={delta24} pct={delta24Pct} />
      </td>

      {/* 7D column */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <DeltaCell value={delta7} pct={delta7Pct} />
      </td>

      {/* TREND column — orange "lightning bolt" + value */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <span
          className="inline-flex items-center gap-1"
          style={{ color: "var(--v2-acc)" }}
          aria-hidden
        >
          <span style={{ fontSize: 10 }}>⚡</span>
          <span
            className="tabular-nums"
            style={{ color: "var(--v2-ink-100)" }}
          >
            {formatNumber(trend)}
          </span>
        </span>
      </td>

      {/* FORKS column */}
      <td
        style={{
          padding: "12px",
          textAlign: "right",
          color: "var(--v2-ink-200)",
        }}
        className="tabular-nums"
      >
        {formatNumber(repo.forks ?? 0)}
      </td>

      {/* ACTION icons — bookmark + compare */}
      <td style={{ padding: "12px", textAlign: "right" }}>
        <span className="inline-flex items-center gap-2">
          <Bookmark
            className="size-3.5"
            style={{ color: "var(--v2-ink-500)" }}
            aria-hidden
          />
          <ArrowUpDown
            className="size-3.5"
            style={{ color: "var(--v2-ink-500)" }}
            aria-hidden
          />
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Delta cell — value (green/red) above percent (smaller, dimmer)
// ---------------------------------------------------------------------------

function DeltaCell({ value, pct }: { value: number; pct: number }) {
  if (value === 0) {
    return (
      <span style={{ color: "var(--v2-ink-500)" }}>—</span>
    );
  }
  const positive = value > 0;
  const color = positive ? "var(--v2-sig-green)" : "var(--v2-sig-red)";
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span
        className="tabular-nums"
        style={{ color, fontWeight: 500 }}
      >
        {positive ? "+" : ""}
        {formatNumber(value)}
      </span>
      <span
        className="tabular-nums"
        style={{
          color: "var(--v2-ink-400)",
          fontSize: 10,
          marginTop: 1,
        }}
      >
        {positive ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
    </span>
  );
}
