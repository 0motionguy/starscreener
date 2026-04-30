"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, TrendingUp } from "lucide-react";
import { FeaturedCard } from "./FeaturedCard";
import { FeaturedCardsSkeleton } from "./FeaturedCardsSkeleton";
import { useWatchlistStore } from "@/lib/store";
import { useFilterStore } from "@/lib/store";
import { getRelativeTime } from "@/lib/utils";
import type { FeaturedCard as FeaturedCardType } from "@/lib/types";

interface FeaturedCardsProps {
  /** If provided, skip fetching and render these cards directly. */
  initialCards?: FeaturedCardType[];
  /** Override the default cards limit (default = 8). */
  limit?: number;
  /** Section title (default = "Featured Now"). */
  title?: string;
}

interface FeaturedResponseBody {
  cards: FeaturedCardType[];
  generatedAt: string;
}

/**
 * Horizontally-scrolling row of featured trending cards.
 *
 * Reacts to the watchlist (for WATCHED_MOVING slots) and the filter store
 * (activeMetaFilter, activeTab, timeRange all re-trigger the fetch). Calls
 * are debounced by 150ms to coalesce rapid filter changes.
 */
export function FeaturedCards({
  initialCards,
  limit = 8,
  title,
}: FeaturedCardsProps) {
  const router = useRouter();

  // Watched repo IDs → sorted, comma-joined key for stable useEffect deps.
  const watchlistRepos = useWatchlistStore((s) => s.repos);
  const watchedKey = useMemo(
    () =>
      [...watchlistRepos.map((r) => r.repoId)]
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .join(","),
    [watchlistRepos],
  );

  // Filter store fields that should re-trigger the fetch.
  const activeMetaFilter = useFilterStore((s) => s.activeMetaFilter);
  const activeTab = useFilterStore((s) => s.activeTab);
  const timeRange = useFilterStore((s) => s.timeRange);

  const [cards, setCards] = useState<FeaturedCardType[]>(
    initialCards ?? [],
  );
  const [loading, setLoading] = useState<boolean>(!initialCards);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    // Debounce rapid dependency changes so we don't flood the API.
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (watchedKey) params.set("watched", watchedKey);
      if (activeMetaFilter) params.set("metaFilter", activeMetaFilter);
      params.set("tab", activeTab);
      params.set("timeRange", timeRange);
      fetch(`/api/pipeline/featured?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<FeaturedResponseBody>;
        })
        .then((body) => {
          if (cancelled) return;
          setCards(body.cards);
          setLastRefresh(body.generatedAt);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          // Keep prior cards on error so the UI doesn't flash empty.
          setLoading(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
    // watchedKey, activeMetaFilter, activeTab, timeRange, limit trigger refetch.
  }, [watchedKey, activeMetaFilter, activeTab, timeRange, limit]);

  async function handleRecompute() {
    if (recomputing) return;
    setRecomputing(true);
    try {
      // /api/pipeline/recompute is CRON_SECRET-gated; use the public,
      // rate-limited /api/pipeline/refresh wrapper from the browser.
      await fetch("/api/pipeline/refresh", { method: "POST" });
      router.refresh();
      // Nudge the effect to refetch by flipping lastRefresh (setState
      // forces a reconcile; the effect above will pick up the next render
      // via dep changes — recompute does not change deps, so also fire
      // a manual fetch here to reflect the newly computed cards).
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (watchedKey) params.set("watched", watchedKey);
      if (activeMetaFilter) params.set("metaFilter", activeMetaFilter);
      params.set("tab", activeTab);
      params.set("timeRange", timeRange);
      const res = await fetch(
        `/api/pipeline/featured?${params.toString()}`,
      );
      if (res.ok) {
        const body = (await res.json()) as FeaturedResponseBody;
        setCards(body.cards);
        setLastRefresh(body.generatedAt);
      }
    } finally {
      setRecomputing(false);
    }
  }

  const showSkeleton = loading && cards.length === 0;
  const showEmpty = !loading && cards.length === 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2
          className="flex items-center gap-2 font-mono uppercase text-[11px] tracking-[0.18em]"
          style={{ color: "var(--v4-ink-300)" }}
        >
          <Flame
            size={12}
            style={{ color: "var(--v4-acc)" }}
            aria-hidden="true"
          />
          <span>{`// ${(title ?? "FEATURED NOW").toUpperCase()}`}</span>
        </h2>
        {lastRefresh && (
          <span
            className="text-[10px] font-mono tabular-nums tracking-[0.14em]"
            style={{ color: "var(--v4-ink-400)" }}
          >
            UPDATED {getRelativeTime(lastRefresh).toUpperCase()}
          </span>
        )}
      </div>

      {showSkeleton ? (
        <FeaturedCardsSkeleton />
      ) : showEmpty ? (
        <div
          className="flex items-center gap-4 w-full h-[160px] p-5 rounded-[2px]"
          style={{
            background: "var(--v4-bg-050)",
            border: "1px solid var(--v4-line-200)",
          }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center size-10 rounded-[2px]"
            style={{
              background: "var(--v4-acc-soft)",
              border: "1px solid var(--v4-acc-dim)",
              color: "var(--v4-acc)",
            }}
          >
            <TrendingUp size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="font-semibold text-sm"
              style={{ color: "var(--v4-ink-000)" }}
            >
              NO TRENDING REPOS YET
            </div>
            <div
              className="mt-1 text-[11px] font-mono tracking-[0.14em] uppercase"
              style={{ color: "var(--v4-ink-300)" }}
            >
              {`// RUN THE PIPELINE TO COMPUTE FRESH FEATURED CARDS`}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRecompute}
            disabled={recomputing}
            className="v3-button v3-button-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {recomputing ? "RUNNING…" : "RUN RECOMPUTE"}
          </button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {cards.map((c, i) => (
            <div key={c.repo.id} className="snap-start">
              <FeaturedCard card={c} index={i} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
