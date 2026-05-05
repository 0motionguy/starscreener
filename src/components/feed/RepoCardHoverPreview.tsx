"use client";

// RepoCardHoverPreview (AGN-645)
//
// Wraps a RepoCard child in a hover-trigger that shows a popover with
// the owner avatar + 3 latest commits after a 200ms delay.
//
// Caching: per-session module-level Map keyed by fullName. Once a repo's
// commits load they stay until full reload — avoids re-firing on every
// hover-out / hover-in cycle. Inflight promises are also memoized so a
// jittery hover can't double-fetch.
//
// API: GET /api/repos/[owner]/[name]/recent-commits → { ok, commits[] }

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { EntityLogo } from "@/components/ui/EntityLogo";

interface RecentCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  htmlUrl: string;
}

type CacheEntry =
  | { state: "loaded"; commits: RecentCommit[] }
  | { state: "error"; error: string };

const sessionCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const HOVER_DELAY_MS = 200;

function fetchRecentCommits(
  owner: string,
  name: string,
): Promise<CacheEntry> {
  const key = `${owner}/${name}`;
  const cached = sessionCache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<CacheEntry> => {
    try {
      const res = await fetch(
        `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/recent-commits`,
        { method: "GET", credentials: "same-origin" },
      );
      if (!res.ok) {
        const entry: CacheEntry = {
          state: "error",
          error: res.status === 404 ? "Repo not found" : "Couldn't load commits",
        };
        // Cache 404s — they won't fix themselves on rehover. Don't cache
        // transient errors so a retry has a chance.
        if (res.status === 404) sessionCache.set(key, entry);
        return entry;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        commits?: RecentCommit[];
      };
      if (!json.ok || !Array.isArray(json.commits)) {
        return { state: "error", error: "Couldn't load commits" };
      }
      const entry: CacheEntry = { state: "loaded", commits: json.commits };
      sessionCache.set(key, entry);
      return entry;
    } catch {
      return { state: "error", error: "Couldn't load commits" };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  const diffYr = Math.round(diffMo / 12);
  return `${diffYr}y ago`;
}

interface RepoCardHoverPreviewProps {
  owner: string;
  name: string;
  ownerAvatarUrl: string | null;
  fullName: string;
  children: React.ReactNode;
}

export function RepoCardHoverPreview({
  owner,
  name,
  ownerAvatarUrl,
  fullName,
  children,
}: RepoCardHoverPreviewProps) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<CacheEntry | null>(() => {
    return sessionCache.get(`${owner}/${name}`) ?? null;
  });
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();

  const cancelDelay = useCallback(() => {
    if (delayTimer.current !== null) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
  }, []);

  const onEnter = useCallback(() => {
    cancelDelay();
    delayTimer.current = setTimeout(() => {
      setOpen(true);
      const cached = sessionCache.get(`${owner}/${name}`);
      if (cached) {
        setEntry(cached);
        return;
      }
      void fetchRecentCommits(owner, name).then((next) => {
        setEntry(next);
      });
    }, HOVER_DELAY_MS);
  }, [owner, name, cancelDelay]);

  const onLeave = useCallback(() => {
    cancelDelay();
    setOpen(false);
  }, [cancelDelay]);

  useEffect(() => {
    return () => cancelDelay();
  }, [cancelDelay]);

  return (
    <div
      className="relative"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {open && (
        <div
          id={popoverId}
          role="tooltip"
          aria-label={`${fullName} recent activity`}
          className="absolute left-0 right-0 top-full z-30 mt-2 rounded-[var(--radius-card)] border border-border-primary bg-bg-card p-3 shadow-[var(--shadow-card-hover)] pointer-events-none"
        >
          <div className="flex items-center gap-2 mb-2">
            <EntityLogo
              src={ownerAvatarUrl}
              name={owner}
              size={20}
              shape="circle"
              alt={`${owner} avatar`}
            />
            <span className="text-xs font-mono text-text-secondary truncate">
              {owner}
            </span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-text-tertiary">
              Latest commits
            </span>
          </div>
          {entry === null && (
            <div className="text-xs text-text-tertiary py-2">Loading…</div>
          )}
          {entry?.state === "error" && (
            <div className="text-xs text-text-tertiary py-2">{entry.error}</div>
          )}
          {entry?.state === "loaded" && entry.commits.length === 0 && (
            <div className="text-xs text-text-tertiary py-2">
              No recent commits
            </div>
          )}
          {entry?.state === "loaded" && entry.commits.length > 0 && (
            <ul className="space-y-1.5">
              {entry.commits.map((c) => (
                <li
                  key={c.sha}
                  className="flex items-start gap-2 text-xs leading-snug"
                >
                  <span className="font-mono text-text-tertiary shrink-0 w-[52px]">
                    {c.shortSha}
                  </span>
                  <span className="text-text-primary truncate flex-1">
                    {c.message}
                  </span>
                  <span className="text-text-tertiary shrink-0 font-mono text-[10px]">
                    {relativeTime(c.committedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
