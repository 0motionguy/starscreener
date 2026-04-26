"use client";

// /watchlist — V2 personal watchlist terminal.
//
// Client component — reads the watchlist store (zustand/persist) and
// hydrates each repoId against /api/repos?ids=… Renders a V2 page with
// TerminalBar, V2 stat tiles (count + best mover), TrendingTableV2 of
// watched repos, an inline manage panel with per-repo remove buttons,
// and the AlertConfig section below.
//
// Hydration gotcha: zustand/persist runs a rehydrate pass on the client
// AFTER the first render. We gate the fetch on `hasHydrated` to avoid
// firing with an empty ID list, then flashing real data in a second pass.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Repo } from "@/lib/types";
import { useWatchlistStore } from "@/lib/store";
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
import { AlertConfig } from "@/components/watchlist/AlertConfig";
import { idToSlug, formatNumber } from "@/lib/utils";

export default function WatchlistPage() {
  useEffect(() => {
    document.title = "Watchlist — TrendingRepo";
  }, []);

  const watchlist = useWatchlistStore((s) => s.repos);
  const removeWatched = useWatchlistStore((s) => s.removeRepo);

  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => setHasHydrated(true), []);

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
        const res = await fetch(`/api/repos?ids=${encodeURIComponent(ids)}`, {
          signal: controller.signal,
        });
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

  // Best 24h mover — drives the second stat tile.
  const topMover =
    repos.length > 0
      ? [...repos]
          .filter((r) => (r.starsDelta24h ?? 0) > 0)
          .sort((a, b) => (b.starsDelta24h ?? 0) - (a.starsDelta24h ?? 0))[0]
      : undefined;

  // Total 24h delta across the watchlist — throughput stat.
  const totalDelta = repos.reduce(
    (sum, r) => sum + Math.max(0, r.starsDelta24h ?? 0),
    0,
  );

  const status = !hasHydrated
    ? "HYDRATING"
    : loading
      ? "LOADING"
      : `${repos.length} REPO${repos.length === 1 ? "" : "S"}`;

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>WATCHLIST · LOCAL · NO ACCOUNT
              </>
            }
            status={status}
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            WATCHLIST · TRACKED REPOS
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
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Track the repos you care about. Click the watch icon on any repo
            page to add it here. Everything is local — no account, no tracking,
            no sync.
          </p>
        </div>
      </section>

      {hasHydrated && repos.length > 0 ? (
        <>
          {/* Stat tiles */}
          <section className="border-b border-[color:var(--v2-line-100)]">
            <div className="v2-frame py-6">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                METRICS · 24H
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="v2-stat">
                  <div className="v">{repos.length}</div>
                  <div className="k">
                    <span aria-hidden>{"// "}</span>
                    REPOS · TRACKED
                  </div>
                </div>
                <div className="v2-stat">
                  <div className="v tabular-nums">
                    +{formatNumber(totalDelta)}
                  </div>
                  <div className="k">
                    <span aria-hidden>{"// "}</span>
                    STARS · TOTAL · 24H
                  </div>
                </div>
                <div className="v2-stat">
                  <div
                    className="v tabular-nums truncate"
                    title={topMover?.name}
                  >
                    {topMover?.name ?? "—"}
                  </div>
                  <div className="k">
                    <span aria-hidden>{"// "}</span>
                    TOP · MOVER · 24H
                  </div>
                </div>
              </div>
            </div>
          </section>

          <TrendingTableV2 repos={repos} sortBy="delta24h" limit={50} />

          {/* Manage panel */}
          <section className="border-t border-[color:var(--v2-line-100)]">
            <div className="v2-frame py-6">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                MANAGE · WATCHLIST
              </p>
              <ul className="v2-card overflow-hidden">
                {watchlist.map((item, idx) => {
                  const slug = idToSlug(item.repoId);
                  return (
                    <li
                      key={item.repoId}
                      className="flex items-center justify-between px-4 py-3"
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
                          style={{ color: "var(--v2-ink-400)", fontSize: 11 }}
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
            </div>
          </section>

          {/* Alerts */}
          <section className="border-t border-[color:var(--v2-line-100)]">
            <div className="v2-frame py-8">
              <p
                className="v2-mono mb-4"
                style={{ color: "var(--v2-ink-300)" }}
              >
                <span aria-hidden>{"// "}</span>
                ALERTS · CONFIG
              </p>
              <AlertConfig />
            </div>
          </section>
        </>
      ) : (
        <section>
          <div className="v2-frame py-12">
            {!hasHydrated || loading ? (
              <WatchlistLoadingV2 />
            ) : (
              <EmptyWatchlistV2 />
            )}
          </div>
        </section>
      )}
    </>
  );
}

function WatchlistLoadingV2() {
  return (
    <div className="v2-card p-12 text-center">
      <p
        className="v2-mono"
        style={{ color: "var(--v2-ink-400)" }}
      >
        <span aria-hidden>{"// "}</span>
        LOADING · WATCHLIST
      </p>
    </div>
  );
}

function EmptyWatchlistV2() {
  return (
    <div className="v2-card p-8 md:p-12 text-center">
      <p
        className="v2-mono mb-3"
        style={{ color: "var(--v2-acc)" }}
      >
        <span aria-hidden>{"// "}</span>
        EMPTY · NO REPOS
      </p>
      <p
        className="v2-display mb-4"
        style={{
          fontSize: "clamp(24px, 3vw, 36px)",
          color: "var(--v2-ink-000)",
        }}
      >
        Your watchlist is empty.
      </p>
      <p
        className="text-[14px] leading-relaxed mb-6 max-w-md mx-auto"
        style={{ color: "var(--v2-ink-200)" }}
      >
        Click the eye icon on any repo to add it here. You&rsquo;ll get a
        quick-glance view of movement across everything you&rsquo;re tracking.
      </p>
      <Link href="/" className="v2-btn v2-btn-primary inline-flex">
        BROWSE TRENDING →
      </Link>
    </div>
  );
}
