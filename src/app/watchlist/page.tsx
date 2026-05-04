"use client";

// StarScreener - Watchlist.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Eye } from "lucide-react";

import type { Repo } from "@/lib/types";
import { useWatchlistStore } from "@/lib/store";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

const AlertConfig = dynamic(
  () =>
    import("@/components/watchlist/AlertConfig").then((m) => ({
      default: m.AlertConfig,
    })),
  { ssr: false },
);

export default function WatchlistPage() {
  useEffect(() => {
    document.title = "Watchlist - TrendingRepo";
  }, []);

  const watchlist = useWatchlistStore((s) => s.repos);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [reposById, setReposById] = useState<Record<string, Repo>>({});
  const [loading, setReposLoading] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Stable refetch key — sorted, joined repoIds. Mirrors WatchlistManager
  // so removing/re-adding a repo doesn't force a refetch loop.
  const repoIdKey = useMemo(
    () => watchlist.map((w) => w.repoId).sort().join(","),
    [watchlist],
  );

  useEffect(() => {
    if (!hasHydrated) return;
    if (repoIdKey === "") {
      setReposById({});
      setReposLoading(false);
      return;
    }
    const controller = new AbortController();
    setReposLoading(true);
    (async () => {
      try {
        const ids = watchlist.map((w: { repoId: string }) => w.repoId).join(",");
        const res = await fetch(`/api/repos?ids=${encodeURIComponent(ids)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { repos?: Repo[] };
        const next: Record<string, Repo> = {};
        for (const r of Array.isArray(data.repos) ? data.repos : []) {
          next[r.id] = r;
        }
        setReposById(next);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[watchlist] repos fetch failed", err);
      } finally {
        setReposLoading(false);
      }
    })();
    return () => controller.abort();
  }, [repoIdKey, hasHydrated, watchlist]);

  // Resolve watched repo IDs to their hydrated Repo records. Drop items
  // we couldn't hydrate (e.g. removed from the store).
  const repos = useMemo<Repo[]>(
    () =>
      watchlist
        .map((item: { repoId: string }) => reposById[item.repoId])
        .filter((r): r is Repo => Boolean(r)),
    [watchlist, reposById],
  );

  const heading = (
    <section className="page-head">
      <div>
        <div className="crumb">
          <Link href="/">Trend terminal</Link>
          <span> / </span>
          <b>watchlist</b>
        </div>
        <h1>Watch repos you care about.</h1>
        <p className="lede">
          Your private terminal of tracked projects, movement alerts, and quick
          compare actions.
        </p>
      </div>
      <div className="clock">
        <span className="big">{repos.length}</span>
        <span className="live">{loading ? "syncing" : "tracked"}</span>
      </div>
    </section>
  );

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
        className="home-surface terminal-page watchlist-page"
        filterBarVariant="watchlist"
        featuredCount={4}
        featuredTitle="Your Movers"
        showFeatured={repos.length >= 4}
        rowActions={["remove", "compare"]}
        heading={heading}
        emptyState={emptyState}
      />
      <section className="home-surface watchlist-alerts">
        <div className="panel-head">
          <span className="key">{"// ALERT RULES"}</span>
          <span className="right">
            <span className="live">browser + pipeline</span>
          </span>
        </div>
        <div className="watchlist-alert-body">
          <AlertConfig />
        </div>
      </section>
    </>
  );
}

function WatchlistLoadingState() {
  return (
    <div className="watchlist-state">
      <span className="watchlist-state-icon">
        <Eye size={24} className="animate-pulse" aria-hidden="true" />
      </span>
      <p>{"// LOADING WATCHLIST..."}</p>
    </div>
  );
}

function EmptyWatchlistState() {
  return (
    <div className="watchlist-state">
      <span className="watchlist-state-icon muted">
        <Eye size={24} aria-hidden="true" />
      </span>
      <p>{"// WATCHLIST IS EMPTY"}</p>
      <p className="hint">
        Click the eye icon on any repo to add it here. Your tracked projects
        will appear in this terminal.
      </p>
      <Link href="/" className="tool-button">
        Browse trending repos
        <span aria-hidden>-&gt;</span>
      </Link>
    </div>
  );
}
