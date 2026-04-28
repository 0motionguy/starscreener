// /breakouts — full-page Cross-Signal Breakouts.
//
// Surfaces every repo where multiple channels (GitHub momentum + Reddit 48h
// velocity + HN 7d presence) agree, sorted by crossSignalScore. The compact
// 5-row homepage section lives in components/cross-signal/CrossSignalBreakouts;
// this page is the deeper drill-down with stat tiles + filter chips.
//
// URL-driven filter: ?filter=all|multi|three. Default = multi. Single-channel
// firing is just the homepage trending feed — multi-channel is real signal.
//
// Server component + force-static: data comes from getDerivedRepos() which is
// process-cached and built from committed JSON, so every request is identical
// until the next build.

import Link from "next/link";
import { Star } from "lucide-react";
import { getDerivedRepos } from "@/lib/derived-repos";
import { ChannelDots } from "@/components/cross-signal/ChannelDots";
import { CategoryPill } from "@/components/shared/CategoryPill";
import { getChannelStatus } from "@/lib/pipeline/cross-signal";
import { formatNumber } from "@/lib/utils";
import type { Repo } from "@/lib/types";

export const dynamic = "force-static";

type FilterKey = "all" | "multi" | "three";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All firing",
  multi: "2+ channels",
  three: "3 channels only",
};

function parseFilter(raw: string | undefined): FilterKey {
  if (raw === "all" || raw === "multi" || raw === "three") return raw;
  return "multi";
}

/**
 * Recompute firing-count using only the 3 visible channels (github+reddit+hn)
 * — Repo.channelsFiring includes Bluesky upstream, but this page renders a
 * 3-dot indicator and uses 3-channel terminology in the UI ("ALL THREE").
 * Counting locally keeps the stat tiles + filter consistent with the dots.
 */
function visibleFiring(repo: Repo, nowMs: number): number {
  const s = getChannelStatus(repo, nowMs);
  return (s.github ? 1 : 0) + (s.reddit ? 1 : 0) + (s.hn ? 1 : 0);
}

function applyFilter(repos: Array<Repo & { _firing: number }>, filter: FilterKey) {
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

  // Annotate every repo with the 3-channel-visible firing count once.
  const annotated = allRepos.map((r) => ({
    ...r,
    _firing: visibleFiring(r, nowMs),
  }));

  // Stats — all derived from the same annotated list, regardless of filter.
  const totalFiring = annotated.filter((r) => r._firing >= 1).length;
  const multiChannel = annotated.filter((r) => r._firing >= 2).length;
  const allThree = annotated.filter((r) => r._firing === 3).length;
  const topScore = annotated.reduce(
    (max, r) => Math.max(max, r.crossSignalScore ?? 0),
    0,
  );

  // Filtered + sorted view.
  const view = applyFilter(annotated, filter)
    .sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))
    .slice(0, 50);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              CROSS-SIGNAL BREAKOUTS
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// where GitHub momentum + Reddit + HN agree"}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            Each repo gets a score 0–3 by summing GitHub movement-status weight,
            Reddit 48h trending velocity (corpus-normalized), and HN 7d
            mention/front-page tier. One channel is noise; multi-channel firing
            is real signal.
          </p>
        </header>

        {/* Stat tiles */}
        <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="TOTAL FIRING"
            value={totalFiring.toLocaleString("en-US")}
            hint=">=1 channel active"
          />
          <StatTile
            label="MULTI-CHANNEL"
            value={multiChannel.toLocaleString("en-US")}
            hint=">=2 channels firing"
          />
          <StatTile
            label="ALL THREE"
            value={allThree.toLocaleString("en-US")}
            hint="github + reddit + hn"
          />
          <StatTile
            label="TOP SCORE"
            value={topScore.toFixed(2)}
            hint="highest cross-signal in corpus"
          />
        </section>

        {/* Filter chips — horizontally scrollable on mobile so the row
            doesn't wrap into 3 lines on a narrow viewport. */}
        <nav
          aria-label="Filter breakouts"
          className="mb-4 flex items-center gap-2 flex-nowrap md:flex-wrap overflow-x-auto md:overflow-visible scrollbar-hide"
        >
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary mr-1 shrink-0">
            {"// filter"}
          </span>
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
            const active = key === filter;
            return (
              <Link
                key={key}
                href={`/breakouts?filter=${key}`}
                scroll={false}
                className="v2-mono px-3 min-h-[40px] inline-flex items-center transition-colors shrink-0"
                style={{
                  fontSize: 11,
                  border: "1px solid",
                  borderRadius: 2,
                  background: active ? "var(--v2-acc-soft)" : "transparent",
                  color: active ? "var(--v2-acc)" : "var(--v2-ink-300)",
                  borderColor: active ? "var(--v2-acc)" : "var(--v2-line-200)",
                }}
                aria-current={active ? "page" : undefined}
              >
                {FILTER_LABELS[key]}
              </Link>
            );
          })}
          <span className="ml-auto text-[11px] text-text-tertiary tabular-nums shrink-0 pl-2">
            {view.length} {view.length === 1 ? "repo" : "repos"}
          </span>
        </nav>

        {/* Table */}
        {view.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="v2-card overflow-hidden">
            {/* Header row — hidden on mobile (the row contents are
                self-describing and the column packing is too tight for
                phones). */}
            <div className="hidden md:grid grid-cols-[40px_70px_1fr_120px_80px_80px_60px] gap-2 items-center px-4 py-2 border-b border-border-primary bg-bg-secondary text-[10px] uppercase tracking-wider text-text-tertiary">
              <span>#</span>
              <span>Channels</span>
              <span>Repo</span>
              <span>Category</span>
              <span className="text-right">Stars</span>
              <span className="text-right">24h</span>
              <span className="text-right">Score</span>
            </div>

            <ol className="divide-y divide-border-primary/40">
              {view.map((repo, i) => {
                const delta24 = repo.starsDelta24h;
                const deltaClass =
                  delta24 > 0
                    ? "text-up"
                    : delta24 < 0
                      ? "text-down"
                      : "text-text-tertiary";
                const deltaLabel =
                  delta24 > 0
                    ? `+${formatNumber(delta24)}`
                    : delta24 < 0
                      ? formatNumber(delta24)
                      : "0";
                return (
                  <li key={repo.id}>
                    <Link
                      href={`/repo/${repo.owner}/${repo.name}`}
                      className="grid grid-cols-[28px_auto_1fr_auto_auto] md:grid-cols-[40px_70px_1fr_120px_80px_80px_60px] gap-2 items-center px-3 md:px-4 min-h-[48px] md:h-11 py-2 md:py-0 hover:bg-bg-card-hover transition-colors"
                    >
                      <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
                        {i + 1}
                      </span>
                      <ChannelDots repo={repo} size="md" />
                      <span className="text-[12px] text-text-primary truncate font-medium min-w-0">
                        {repo.fullName}
                      </span>
                      {/* Category pill + stars hidden on mobile to keep
                          the row 5-col instead of 7-col. */}
                      <span className="hidden md:inline-flex min-w-0 truncate">
                        <CategoryPill categoryId={repo.categoryId} size="sm" />
                      </span>
                      <span className="hidden md:inline-flex items-center justify-end gap-1 font-mono text-[11px] text-text-secondary tabular-nums">
                        <Star
                          size={11}
                          className="text-warning shrink-0"
                          fill="currentColor"
                        />
                        {formatNumber(repo.stars)}
                      </span>
                      <span
                        className={`text-right font-mono text-[11px] tabular-nums whitespace-nowrap ${deltaClass}`}
                        title={`${deltaLabel} stars / 24h`}
                      >
                        {deltaLabel}
                      </span>
                      <span className="text-right font-mono text-[11px] tabular-nums text-text-primary">
                        {(repo.crossSignalScore ?? 0).toFixed(2)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-border-primary rounded-md px-4 py-3 bg-bg-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold truncate">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <p className="text-sm text-text-secondary">
        No repos match this filter right now — check back after the next data
        refresh.
      </p>
    </section>
  );
}
