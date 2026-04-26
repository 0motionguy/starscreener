"use client";

// /you — V2 personal signal panel.
//
// Zero-auth: reads watchlist + compare + filter store from zustand
// (localStorage-persisted). Renders a V2 dashboard summarizing what
// the user is tracking. No server account.
//
// Broken out of page.tsx because Next 15 disallows `export const metadata`
// from a "use client" module.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useCompareStore,
  useFilterStore,
  useWatchlistStore,
} from "@/lib/store";
import { idToSlug } from "@/lib/utils";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export default function YouClient() {
  // Hydration gate — zustand/persist loads from localStorage post-mount.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const watchlist = useWatchlistStore((s) => s.repos);
  const removeWatched = useWatchlistStore((s) => s.removeRepo);
  const compareIds = useCompareStore((s) => s.repos);
  const removeCompare = useCompareStore((s) => s.removeRepo);
  const clearCompare = useCompareStore((s) => s.clearAll);

  const timeRange = useFilterStore((s) => s.timeRange);
  const sortBy = useFilterStore((s) => s.sortBy);
  const category = useFilterStore((s) => s.category);
  const languages = useFilterStore((s) => s.languages);
  const onlyWatched = useFilterStore((s) => s.onlyWatched);
  const excludeArchived = useFilterStore((s) => s.excludeArchived);
  const minMomentum = useFilterStore((s) => s.minMomentum);
  const resetFilters = useFilterStore((s) => s.resetFilters);

  const watchCount = hydrated ? watchlist.length : 0;
  const compareCount = hydrated ? compareIds.length : 0;
  const isEmpty = hydrated && watchCount === 0 && compareCount === 0;

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>YOU · LOCAL · NO ACCOUNT
              </>
            }
            status={
              hydrated
                ? `${watchCount} WATCHED · ${compareCount} STAGED`
                : "HYDRATING"
            }
          />

          <h1
            className="v2-display mt-6"
            style={{
              fontSize: "clamp(40px, 6vw, 72px)",
              color: "var(--v2-ink-000)",
            }}
          >
            Your{" "}
            <span style={{ color: "var(--v2-ink-400)" }}>signal.</span>
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[60ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            No account. No tracking. TrendingRepo keeps your watchlist and
            shortlist in your browser — portable when you&apos;re ready,
            invisible when you&apos;re not.
          </p>
        </div>
      </section>

      <div className="v2-frame py-6 max-w-[1100px] mx-auto">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {/* Watchlist */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p
                  className="v2-mono"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  <span aria-hidden>{"// "}</span>
                  WATCHLIST ·{" "}
                  <span style={{ color: "var(--v2-ink-100)" }}>
                    {watchCount}
                  </span>
                </p>
                {watchCount > 0 && (
                  <Link
                    href="/watchlist"
                    className="v2-mono"
                    style={{
                      color: "var(--v2-ink-300)",
                      fontSize: 11,
                      letterSpacing: "0.20em",
                    }}
                  >
                    OPEN TERMINAL →
                  </Link>
                )}
              </div>
              {watchCount === 0 ? (
                <EmptyRow
                  label="No repos watched yet."
                  cta="/"
                  ctaLabel="BROWSE TRENDING"
                />
              ) : (
                <ul className="v2-card overflow-hidden">
                  {watchlist.map((item, idx) => {
                    const slug = idToSlug(item.repoId);
                    return (
                      <li
                        key={item.repoId}
                        className="flex items-center justify-between px-4 py-3 transition-colors"
                        style={{
                          borderTop:
                            idx === 0
                              ? "none"
                              : "1px solid var(--v2-line-100)",
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/repo/${slug}`}
                            className="v2-mono-tight font-mono truncate block"
                            style={{ color: "var(--v2-ink-100)" }}
                          >
                            {slug}
                          </Link>
                          <span
                            className="v2-mono"
                            style={{
                              color: "var(--v2-ink-400)",
                              fontSize: 11,
                            }}
                          >
                            <span aria-hidden>{"// "}</span>
                            ADDED{" "}
                            {new Date(item.addedAt).toLocaleDateString()} · @{" "}
                            {item.starsAtAdd.toLocaleString("en-US")} STARS
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWatched(item.repoId)}
                          aria-label={`Remove ${slug} from watchlist`}
                          className="v2-mono ml-3 px-2 py-1 transition shrink-0"
                          style={{
                            color: "var(--v2-ink-400)",
                            fontSize: 11,
                            letterSpacing: "0.20em",
                          }}
                        >
                          REMOVE
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Compare */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p
                  className="v2-mono"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  <span aria-hidden>{"// "}</span>
                  COMPARE · STAGING ·{" "}
                  <span style={{ color: "var(--v2-ink-100)" }}>
                    {compareCount}
                  </span>
                  /4
                </p>
                {compareCount > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={clearCompare}
                      className="v2-mono"
                      style={{
                        color: "var(--v2-ink-400)",
                        fontSize: 11,
                        letterSpacing: "0.20em",
                      }}
                    >
                      CLEAR
                    </button>
                    <Link
                      href="/compare"
                      className="v2-mono"
                      style={{
                        color: "var(--v2-ink-300)",
                        fontSize: 11,
                        letterSpacing: "0.20em",
                      }}
                    >
                      OPEN COMPARE →
                    </Link>
                  </div>
                )}
              </div>
              {compareCount === 0 ? (
                <EmptyRow
                  label="Nothing staged for comparison."
                  cta="/"
                  ctaLabel="PICK UP TO FOUR"
                />
              ) : (
                <ul className="v2-card overflow-hidden">
                  {compareIds.map((id, idx) => {
                    const slug = idToSlug(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between px-4 py-3"
                        style={{
                          borderTop:
                            idx === 0
                              ? "none"
                              : "1px solid var(--v2-line-100)",
                        }}
                      >
                        <Link
                          href={`/repo/${slug}`}
                          className="v2-mono-tight font-mono truncate"
                          style={{ color: "var(--v2-ink-100)" }}
                        >
                          {slug}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeCompare(id)}
                          aria-label={`Remove ${slug} from compare`}
                          className="v2-mono ml-3 px-2 py-1 transition shrink-0"
                          style={{
                            color: "var(--v2-ink-400)",
                            fontSize: 11,
                            letterSpacing: "0.20em",
                          }}
                        >
                          REMOVE
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Saved filters */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p
                  className="v2-mono"
                  style={{ color: "var(--v2-ink-300)" }}
                >
                  <span aria-hidden>{"// "}</span>
                  ACTIVE · FILTERS
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="v2-mono"
                  style={{
                    color: "var(--v2-ink-400)",
                    fontSize: 11,
                    letterSpacing: "0.20em",
                  }}
                >
                  RESET
                </button>
              </div>
              <dl className="v2-card grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 p-4">
                <FilterRow k="WINDOW" v={timeRange} />
                <FilterRow k="SORT" v={sortBy} />
                <FilterRow k="CATEGORY" v={category ?? "all"} />
                <FilterRow
                  k="LANGUAGES"
                  v={languages.length === 0 ? "any" : languages.join(", ")}
                />
                <FilterRow k="MIN · MOMENTUM" v={String(minMomentum)} />
                <FilterRow k="ONLY · WATCHED" v={onlyWatched ? "on" : "off"} />
                <FilterRow
                  k="EXCLUDE · ARCHIVED"
                  v={excludeArchived ? "on" : "off"}
                />
              </dl>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="v2-card p-8 md:p-12 text-center">
      <p
        className="v2-mono mb-3"
        style={{ color: "var(--v2-acc)" }}
      >
        <span aria-hidden>{"// "}</span>
        NOTHING TRACKED YET
      </p>
      <p
        className="v2-display mb-4"
        style={{
          fontSize: "clamp(24px, 3vw, 36px)",
          color: "var(--v2-ink-000)",
        }}
      >
        Open the terminal.
      </p>
      <p
        className="text-[14px] leading-relaxed mb-6 max-w-md mx-auto"
        style={{ color: "var(--v2-ink-200)" }}
      >
        Watch a repo, pick a few for side-by-side compare, or drop filters on
        the terminal. Everything you do shows up here.
      </p>
      <Link href="/" className="v2-btn v2-btn-primary inline-flex">
        OPEN TERMINAL →
      </Link>
    </div>
  );
}

function EmptyRow({
  label,
  cta,
  ctaLabel,
}: {
  label: string;
  cta: string;
  ctaLabel: string;
}) {
  return (
    <div
      className="flex items-center justify-between v2-card p-4"
      style={{ borderStyle: "dashed" }}
    >
      <span
        className="text-[14px]"
        style={{ color: "var(--v2-ink-400)" }}
      >
        {label}
      </span>
      <Link
        href={cta}
        className="v2-mono inline-flex items-center gap-2"
        style={{
          color: "var(--v2-acc)",
          fontSize: 11,
          letterSpacing: "0.20em",
        }}
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}

function FilterRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 min-w-0">
      <dt
        className="v2-mono shrink-0"
        style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
      >
        <span aria-hidden>{"// "}</span>
        {k}
      </dt>
      <dd
        className="v2-mono-tight font-mono truncate tabular-nums"
        style={{ color: "var(--v2-ink-100)", fontSize: 13 }}
      >
        {v}
      </dd>
    </div>
  );
}
