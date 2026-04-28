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
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Repo } from "@/lib/types";
import { useWatchlistStore } from "@/lib/store";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

// AlertConfig is 868 lines of browser-alert plumbing, threshold sliders, and
// a repo picker — none of which is needed for the first paint of the
// terminal table. Defer it from the watchlist first-load chunk; ssr:false
// because it renders below the fold and is fully client-driven.
const AlertConfig = dynamic(
  () =>
    import("@/components/watchlist/AlertConfig").then((m) => ({
      default: m.AlertConfig,
    })),
  { ssr: false },
);

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
    <div className="px-4 sm:px-6 pt-6 pb-2 space-y-3">
      <div
        className="flex items-center justify-between gap-3 pb-1"
        style={{ borderBottom: "1px solid var(--v2-line-std)" }}
      >
        <span
          className="v2-mono"
          style={{ fontSize: 10, color: "var(--v2-ink-400)" }}
        >
          {"// 01 · WATCHLIST · TRACKED REPOS"}
        </span>
        <span
          className="v2-mono v2-stat tabular-nums"
          style={{ fontSize: 10, color: "var(--v2-ink-300)" }}
        >
          <span className="v2-live-dot mr-2 inline-block" aria-hidden />
          {repos.length} TRACKED
        </span>
      </div>
      <h1
        className="flex items-center gap-3"
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: "clamp(24px, 3vw, 32px)",
          fontWeight: 510,
          letterSpacing: "-0.022em",
          color: "var(--v2-ink-000)",
          lineHeight: 1.1,
        }}
      >
        Watchlist
        <span
          className="v2-tag tabular-nums"
          style={{ fontSize: 11, color: "var(--v2-ink-100)" }}
        >
          {repos.length}
        </span>
      </h1>
      <p style={{ fontSize: 14, color: "var(--v2-ink-300)" }}>
        Track repos you care about.
      </p>
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
      <div
        className="mx-auto mb-4 inline-flex items-center justify-center p-3"
        style={{
          background: "var(--v2-bg-050)",
          border: "1px solid var(--v2-line-200)",
          borderRadius: 2,
        }}
      >
        <Eye
          size={24}
          className="animate-pulse"
          style={{ color: "var(--v2-acc)" }}
          aria-hidden="true"
        />
      </div>
      <p
        className="v2-mono"
        style={{ fontSize: 12, color: "var(--v2-ink-200)" }}
      >
        {"// LOADING WATCHLIST …"}
      </p>
    </div>
  );
}

function EmptyWatchlistState() {
  return (
    <div className="text-center py-20 px-4">
      <div
        className="mx-auto mb-4 inline-flex items-center justify-center p-3"
        style={{
          background: "var(--v2-bg-050)",
          border: "1px solid var(--v2-line-200)",
          borderRadius: 2,
        }}
      >
        <Eye
          size={24}
          style={{ color: "var(--v2-ink-300)" }}
          aria-hidden="true"
        />
      </div>
      <p
        className="v2-mono"
        style={{ fontSize: 12, color: "var(--v2-ink-200)" }}
      >
        {"// WATCHLIST IS EMPTY"}
      </p>
      <p
        className="mt-2 max-w-md mx-auto"
        style={{ fontSize: 12, color: "var(--v2-ink-400)" }}
      >
        Click the eye icon on any repo to add it here. You&rsquo;ll get a
        quick-glance view of movement across everything you&rsquo;re tracking.
      </p>
      <Link href="/" className="v2-btn v2-btn-primary inline-flex mt-6">
        BROWSE TRENDING REPOS
        <span aria-hidden style={{ marginLeft: 8 }}>→</span>
      </Link>
    </div>
  );
}
