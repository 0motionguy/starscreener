"use client";

// StarScreener — Watchlist (Phase 3)
//
// Client component — reads the watchlist store (zustand/persist) and hydrates
// each repoId against the live `/api/repos?ids=a,b,c` endpoint. Hands the
// resolved list to TerminalLayout with `watchlist` FilterBar variant.
// AlertConfig stays below the terminal as a dedicated section.
//
// Hydration gotcha: zustand/persist runs a rehydrate pass on the client
// AFTER the first render. We gate the fetch on `hasHydrated` to avoid
// firing with an empty ID list, then flashing real data in a second pass.

import { Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Repo } from "@/lib/types";
import { useWatchlistStore } from "@/lib/store";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import { AlertConfig } from "@/components/watchlist/AlertConfig";

export default function WatchlistPage() {
  useEffect(() => {
    document.title = "Watchlist — TrendingRepo";
  }, []);

  const watchlist = useWatchlistStore((s) => s.repos);

  // Hydration gate. zustand/persist finishes rehydrating from localStorage
  // after the first client render; until then, `watchlist` is the store's
  // initial value (empty array), which would otherwise trigger a spurious
  // "empty state" flash.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    // Mark hydrated on mount — zustand/persist runs synchronously in the
    // browser so by the time this effect fires, the real state is loaded.
    setHasHydrated(true);
  }, []);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (watchlist.length === 0) {
      setRepos([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const ids = watchlist.map((w) => w.repoId).join(",");
        const res = await fetch(
          `/api/repos?ids=${encodeURIComponent(ids)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        setRepos(Array.isArray(data.repos) ? data.repos : []);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[watchlist] fetch failed", err);
        setRepos([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [watchlist, hasHydrated]);

  const heading = (
    <div className="px-4 sm:px-6 pt-6 pb-2">
      <h1 className="font-display text-3xl font-bold text-text-primary flex items-center gap-3">
        Watchlist
        <span className="text-sm font-mono font-normal text-text-tertiary px-2 py-1 bg-bg-tertiary rounded-full">
          {repos.length}
        </span>
      </h1>
      <p className="mt-2 text-text-secondary">Track repos you care about.</p>
    </div>
  );

  // Choose the empty-state body based on the phase: pre-hydration and
  // in-flight fetches show a subtle loading shimmer; truly-empty state
  // gets the "add repos" CTA.
  const emptyState =
    !hasHydrated || loading ? (
      <WatchlistLoadingState />
    ) : (
      <EmptyWatchlistState />
    );

  return (
    <>
      <TerminalLayout
        repos={repos}
        filterBarVariant="watchlist"
        featuredCount={4}
        featuredTitle="Your Movers"
        showFeatured={repos.length >= 4}
        rowActions={["remove", "compare"]}
        heading={heading}
        emptyState={emptyState}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-border-primary mt-8">
        <AlertConfig />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty + loading states
// ---------------------------------------------------------------------------

function WatchlistLoadingState() {
  return (
    <div className="text-center py-20 px-4">
      <div className="mx-auto mb-4 inline-flex items-center justify-center p-4 rounded-full bg-bg-card border border-border-primary">
        <Eye
          size={28}
          className="text-text-tertiary animate-pulse"
          aria-hidden="true"
        />
      </div>
      <p className="text-text-secondary text-lg">Loading watchlist&hellip;</p>
    </div>
  );
}

function EmptyWatchlistState() {
  return (
    <div className="text-center py-20 px-4">
      <div className="mx-auto mb-4 inline-flex items-center justify-center p-4 rounded-full bg-bg-card border border-border-primary">
        <Eye size={28} className="text-text-tertiary" aria-hidden="true" />
      </div>
      <p className="text-text-secondary text-lg">
        Your watchlist is empty
      </p>
      <p className="text-text-muted text-sm mt-2 max-w-md mx-auto">
        Click the eye icon on any repo to add it here. You&rsquo;ll get a
        quick-glance view of movement across everything you&rsquo;re tracking.
      </p>
      <Link
        href="/"
        className="inline-block mt-6 px-4 py-2 rounded-[var(--radius-md)] bg-brand text-text-inverse font-medium text-sm hover:bg-brand-hover transition-colors"
      >
        Browse trending repos
      </Link>
    </div>
  );
}
