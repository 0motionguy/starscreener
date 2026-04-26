// /breakouts — Cross-Signal Breakouts (V2 design system).
//
// Surfaces every repo where multiple channels (GitHub momentum + Reddit
// 48h velocity + HN 7d presence) agree, sorted by crossSignalScore.
//
// URL-driven filter: ?filter=all|multi|three. Default = multi. Single-
// channel firing is just the homepage trending feed — multi-channel is
// real signal.
//
// Server component + force-static: data comes from getDerivedRepos()
// which is process-cached, so every request is identical until the
// next build.

import Link from "next/link";
import { Star } from "lucide-react";
import { getDerivedRepos } from "@/lib/derived-repos";
import { ChannelDots } from "@/components/cross-signal/ChannelDots";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { getChannelStatus } from "@/lib/pipeline/cross-signal";
import { formatNumber } from "@/lib/utils";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { BarcodeTicker } from "@/components/today-v2/primitives/BarcodeTicker";
import type { Repo } from "@/lib/types";

export const dynamic = "force-static";

type FilterKey = "all" | "multi" | "three";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "ALL FIRING",
  multi: "2+ CHANNELS",
  three: "3 CHANNELS ONLY",
};

function parseFilter(raw: string | undefined): FilterKey {
  if (raw === "all" || raw === "multi" || raw === "three") return raw;
  return "multi";
}

function visibleFiring(repo: Repo, nowMs: number): number {
  const s = getChannelStatus(repo, nowMs);
  return (s.github ? 1 : 0) + (s.reddit ? 1 : 0) + (s.hn ? 1 : 0);
}

function applyFilter(
  repos: Array<Repo & { _firing: number }>,
  filter: FilterKey,
) {
  if (filter === "all") return repos.filter((r) => r._firing >= 1);
  if (filter === "three") return repos.filter((r) => r._firing === 3);
  return repos.filter((r) => r._firing >= 2);
}

export default async function BreakoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.filter);

  const allRepos = getDerivedRepos();
  const nowMs = Date.now();

  const annotated = allRepos.map((r) => ({
    ...r,
    _firing: visibleFiring(r, nowMs),
  }));

  const totalFiring = annotated.filter((r) => r._firing >= 1).length;
  const multiChannel = annotated.filter((r) => r._firing >= 2).length;
  const allThree = annotated.filter((r) => r._firing === 3).length;
  const topScore = annotated.reduce(
    (max, r) => Math.max(max, r.crossSignalScore ?? 0),
    0,
  );

  const view = applyFilter(annotated, filter)
    .sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))
    .slice(0, 50);

  return (
    <>
      {/* Page title */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <h1
            className="v2-mono mb-3 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            CROSS-SIGNAL BREAKOUTS · WHERE GH + REDDIT + HN AGREE
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
          <p
            className="text-[14px] leading-relaxed max-w-[80ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Each repo gets a score 0–3 by summing GitHub movement-status
            weight, Reddit 48h trending velocity (corpus-normalized), and
            HN 7d mention/front-page tier. One channel is noise; multi-
            channel firing is real signal.
          </p>

          {/* 4 stat tiles */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
            <V2Stat
              label="TOTAL FIRING"
              value={formatNumber(totalFiring)}
              hint=">=1 CHANNEL"
            />
            <V2Stat
              label="MULTI-CHANNEL"
              value={formatNumber(multiChannel)}
              hint=">=2 CHANNELS"
              accent
            />
            <V2Stat
              label="ALL THREE"
              value={formatNumber(allThree)}
              hint="GH + REDDIT + HN"
              accent
            />
            <V2Stat
              label="TOP SCORE"
              value={topScore.toFixed(2)}
              hint="HIGHEST IN CORPUS"
            />
          </div>

          {/* Filter pills */}
          <nav
            aria-label="Filter breakouts"
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            <span
              className="v2-mono"
              style={{ color: "var(--v2-ink-400)" }}
            >
              <span aria-hidden>{"// "}</span>
              FILTER
            </span>
            {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
              const active = key === filter;
              return (
                <Link
                  key={key}
                  href={`/breakouts?filter=${key}`}
                  scroll={false}
                  className="px-3 py-1.5"
                  style={{
                    fontFamily:
                      "var(--font-geist-mono), ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    border: active
                      ? "1px solid var(--v2-acc)"
                      : "1px solid var(--v2-line-200)",
                    background: active
                      ? "var(--v2-acc-soft)"
                      : "transparent",
                    color: active ? "var(--v2-acc)" : "var(--v2-ink-300)",
                    borderRadius: 1,
                    transition: "all 120ms ease-out",
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  {FILTER_LABELS[key]}
                </Link>
              );
            })}
            <span
              className="v2-mono ml-auto tabular-nums"
              style={{ color: "var(--v2-ink-300)" }}
            >
              {view.length}{" "}
              {view.length === 1 ? "REPO" : "REPOS"}
            </span>
          </nav>
        </div>
      </section>

      {/* Breakouts table */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame py-6">
          <div className="v2-card overflow-hidden">
            <TerminalBar
              label="// BREAKOUTS · TABLE"
              status={
                <>
                  <span className="tabular-nums">{view.length}</span> ROWS · LIVE
                </>
              }
            />

            {view.length === 0 ? (
              <div
                className="p-12 text-center text-[13px]"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span className="v2-mono">
                  <span aria-hidden>{"// "}</span>
                  NO REPOS MATCH FILTER · CHECK BACK NEXT REFRESH
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full"
                  style={{
                    borderCollapse: "collapse",
                    fontFamily:
                      "var(--font-geist-mono), ui-monospace, monospace",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr style={{ background: "var(--v2-bg-100)" }}>
                      <Th align="left" width={50}>
                        #
                      </Th>
                      <Th align="left" width={110}>
                        CHANNELS
                      </Th>
                      <Th align="left">REPO</Th>
                      <Th align="left" width={140}>
                        CATEGORY
                      </Th>
                      <Th align="right" width={90}>
                        STARS
                      </Th>
                      <Th align="right" width={90}>
                        24H ★
                      </Th>
                      <Th align="right" width={80}>
                        SCORE
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.map((repo, i) => {
                      const delta24 = repo.starsDelta24h;
                      const deltaColor =
                        delta24 > 0
                          ? "var(--v2-sig-green)"
                          : delta24 < 0
                            ? "var(--v2-sig-red)"
                            : "var(--v2-ink-400)";
                      const deltaLabel =
                        delta24 > 0
                          ? `+${formatNumber(delta24)}`
                          : delta24 < 0
                            ? formatNumber(delta24)
                            : "0";
                      const isTop = i === 0;
                      return (
                        <tr
                          key={repo.id}
                          className="v2-row"
                          style={{
                            borderBottom:
                              "1px dashed var(--v2-line-100)",
                            background: isTop
                              ? "var(--v2-acc-soft)"
                              : "transparent",
                          }}
                        >
                          <td
                            style={{
                              padding: "10px 12px",
                              color: isTop
                                ? "var(--v2-acc)"
                                : "var(--v2-ink-300)",
                            }}
                            className="tabular-nums"
                          >
                            #{i + 1}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <ChannelDots repo={repo} size="md" />
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <Link
                              href={`/repo/${repo.owner}/${repo.name}`}
                              style={{
                                fontFamily:
                                  "var(--font-geist), Inter, sans-serif",
                                fontWeight: 510,
                                fontSize: 13,
                                color: "var(--v2-ink-100)",
                                letterSpacing: "-0.005em",
                              }}
                            >
                              {repo.fullName}
                            </Link>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <CategoryPill
                              categoryId={repo.categoryId}
                              size="sm"
                            />
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: "var(--v2-ink-200)",
                            }}
                            className="tabular-nums"
                          >
                            <Star
                              size={11}
                              className="inline-block mr-1"
                              style={{
                                color: "var(--v2-sig-amber)",
                                verticalAlign: "-1px",
                              }}
                              fill="currentColor"
                              aria-hidden
                            />
                            {formatNumber(repo.stars)}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: deltaColor,
                            }}
                            className="tabular-nums"
                          >
                            {deltaLabel}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: isTop
                                ? "var(--v2-acc)"
                                : "var(--v2-ink-100)",
                              fontWeight: 500,
                            }}
                            className="tabular-nums"
                          >
                            {(repo.crossSignalScore ?? 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div
              className="px-3 py-2 border-t"
              style={{
                borderColor: "var(--v2-line-100)",
                background: "var(--v2-bg-050)",
              }}
            >
              <BarcodeTicker
                left={`// BREAKOUTS · ${filter.toUpperCase()}`}
                middle={`${view.length} ROWS`}
                right="LIVE"
                bars={20}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function V2Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="v2-card"
      style={{ padding: "10px 12px", minHeight: 72 }}
    >
      <div
        className="v2-mono"
        style={{ color: "var(--v2-ink-400)", fontSize: 9 }}
      >
        {label}
      </div>
      <div
        className="tabular-nums mt-1"
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontWeight: 400,
          fontSize: 22,
          letterSpacing: "-0.015em",
          lineHeight: 1.1,
          color: accent ? "var(--v2-acc)" : "var(--v2-ink-000)",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          className="v2-mono mt-1"
          style={{ color: "var(--v2-ink-400)", fontSize: 9 }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Th({
  children,
  align = "left",
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
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
