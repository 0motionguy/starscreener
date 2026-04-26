"use client";

// StarScreener — /you client shell.
//
// Broken out of page.tsx because Next 15 disallows `export const metadata`
// from a "use client" module. Nothing user-facing lives above this
// boundary — the server page is a one-line wrapper.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, GitCompareArrows, Filter, X, ArrowRight } from "lucide-react";
import {
  useCompareStore,
  useFilterStore,
  useWatchlistStore,
} from "@/lib/store";
import { idToSlug } from "@/lib/utils";

export default function YouClient() {
  // Hydration gate — zustand/persist loads from localStorage post-mount,
  // so render a stable placeholder until client state is truly live.
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Heading ------------------------------------------------------ */}
      <header className="mb-10">
        <span className="label-micro">Profile</span>
        <h1 className="font-display text-4xl sm:text-5xl mt-2 mb-3">
          Your signal.
        </h1>
        <p className="text-text-secondary text-md max-w-2xl leading-relaxed">
          No account. No tracking. TrendingRepo keeps your watchlist and
          shortlist in your browser — portable when you&apos;re ready,
          invisible when you&apos;re not.
        </p>
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {/* Watchlist -------------------------------------------------- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <span className="label-section flex items-center gap-2">
                <Eye className="w-3 h-3" />
                Watchlist · {watchCount}
              </span>
              {watchCount > 0 && (
                <Link
                  href="/watchlist"
                  className="text-xs font-mono text-text-tertiary hover:text-brand flex items-center gap-1"
                >
                  Open terminal <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
            {watchCount === 0 ? (
              <EmptyRow
                label="No repos watched yet."
                cta="/"
                ctaLabel="Browse trending"
              />
            ) : (
              <ul className="divide-y divide-border-secondary border border-border-primary rounded-md overflow-hidden bg-bg-card">
                {watchlist.map((item) => {
                  const slug = idToSlug(item.repoId);
                  return (
                    <li
                      key={item.repoId}
                      className="flex items-center justify-between px-3 py-2 hover:bg-bg-row-hover transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/repo/${slug}`}
                          className="font-mono text-sm text-text-primary hover:text-brand truncate block"
                        >
                          {slug}
                        </Link>
                        <span className="label-micro">
                          added{" "}
                          {new Date(item.addedAt).toLocaleDateString()} ·{" "}
                          @ {item.starsAtAdd.toLocaleString("en-US")} stars
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWatched(item.repoId)}
                        aria-label={`Remove ${slug} from watchlist`}
                        className="ml-3 w-7 h-7 flex items-center justify-center rounded-button text-text-tertiary hover:text-down hover:bg-bg-card-hover shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Compare ---------------------------------------------------- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <span className="label-section flex items-center gap-2">
                <GitCompareArrows className="w-3 h-3" />
                Compare shortlist · {compareCount}/4
              </span>
              {compareCount > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={clearCompare}
                    className="text-xs font-mono text-text-tertiary hover:text-down"
                  >
                    Clear
                  </button>
                  <Link
                    href="/compare"
                    className="text-xs font-mono text-text-tertiary hover:text-brand flex items-center gap-1"
                  >
                    Open compare <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
            {compareCount === 0 ? (
              <EmptyRow
                label="Nothing staged for comparison."
                cta="/"
                ctaLabel="Pick up to four repos"
              />
            ) : (
              <ul className="divide-y divide-border-secondary border border-border-primary rounded-md overflow-hidden bg-bg-card">
                {compareIds.map((id) => {
                  const slug = idToSlug(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-bg-row-hover transition-colors"
                    >
                      <Link
                        href={`/repo/${slug}`}
                        className="font-mono text-sm text-text-primary hover:text-brand truncate"
                      >
                        {slug}
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeCompare(id)}
                        aria-label={`Remove ${slug} from compare`}
                        className="ml-3 w-7 h-7 flex items-center justify-center rounded-button text-text-tertiary hover:text-down hover:bg-bg-card-hover shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Saved filters --------------------------------------------- */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <span className="label-section flex items-center gap-2">
                <Filter className="w-3 h-3" />
                Active filters
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-mono text-text-tertiary hover:text-down"
              >
                Reset
              </button>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 border border-border-primary rounded-md bg-bg-card p-4 text-sm">
              <FilterRow k="Window" v={timeRange} />
              <FilterRow k="Sort" v={sortBy} />
              <FilterRow k="Category" v={category ?? "all"} />
              <FilterRow
                k="Languages"
                v={languages.length === 0 ? "any" : languages.join(", ")}
              />
              <FilterRow k="Min momentum" v={String(minMomentum)} />
              <FilterRow k="Only watched" v={onlyWatched ? "on" : "off"} />
              <FilterRow
                k="Exclude archived"
                v={excludeArchived ? "on" : "off"}
              />
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border-primary rounded-md p-10 text-center bg-bg-card">
      <p className="font-display text-xl mb-2">Nothing tracked yet.</p>
      <p className="text-text-tertiary text-sm mb-6 max-w-md mx-auto">
        Watch a repo, pick a few for side-by-side compare, or drop filters
        on the terminal. Everything you do shows up here.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-brand text-black px-4 py-2 rounded-button text-sm font-medium hover:bg-brand-hover transition-colors"
      >
        Open the terminal <ArrowRight className="w-4 h-4" />
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
    <div className="flex items-center justify-between border border-dashed border-border-primary rounded-md px-4 py-3 bg-bg-card">
      <span className="text-text-tertiary text-sm">{label}</span>
      <Link
        href={cta}
        className="text-xs font-mono text-brand hover:text-brand-hover flex items-center gap-1"
      >
        {ctaLabel} <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function FilterRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 min-w-0">
      <dt className="label-micro shrink-0">{k}</dt>
      <dd className="font-mono text-sm text-text-primary truncate">{v}</dd>
    </div>
  );
}
