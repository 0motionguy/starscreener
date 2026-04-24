"use client";

// Builder reactions strip — "would build / would use / would buy / would invest".
//
// Lives next to RepoActionRow on the repo detail page; designed to be drop-in
// elsewhere too (idea cards in P0.5, repo rows on hover later).
//
// Behaviour:
//   - Counts are visible to everyone.
//   - Toggling a reaction requires the user-token bearer (same model as
//     /api/pipeline/alerts/rules). Anonymous users get the buttons in a
//     disabled state with a tooltip explaining why.
//   - "buy" and "invest" require an extra confirm — they are commitment
//     signals, not casual likes. We surface this via window.confirm to keep
//     the v0 simple; the strategy doc calls for a real modal in P0.5.
//
// The reactions API returns the full counts + per-user state on every
// request, so we hydrate from the response and never need a separate
// "did the user already react" call.

import { useCallback, useEffect, useState } from "react";
import {
  Hammer,
  type LucideIcon,
  Play,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";

import {
  emptyReactionCounts,
  HIGH_COMMITMENT_REACTIONS,
  REACTION_TYPES,
  type ReactionCounts,
  type ReactionType,
  type UserReactionState,
} from "@/lib/reactions";
import { cn } from "@/lib/utils";

interface RepoReactionsProps {
  /** GitHub fullName ("owner/name"). Normalized to lowercase server-side. */
  repoFullName: string;
  /**
   * Server-rendered initial counts (from listReactionsForObject) so the
   * first paint already shows real numbers instead of zeros. Optional —
   * the component will fetch on mount if omitted.
   */
  initialCounts?: ReactionCounts;
  initialMine?: UserReactionState | null;
  /** Compact mode strips the labels — for inline use on repo rows. */
  compact?: boolean;
}

interface ReactionMeta {
  label: string;
  icon: LucideIcon;
  /** Confirm message shown for high-commitment reactions when toggling on. */
  confirmCopy: string | null;
  /** Hover/aria description for low-commitment reactions. */
  hint: string;
}

const META: Record<ReactionType, ReactionMeta> = {
  build: {
    label: "Build",
    icon: Hammer,
    confirmCopy: null,
    hint: "I would build (or fork) this",
  },
  use: {
    label: "Use",
    icon: Play,
    confirmCopy: null,
    hint: "I would install or use this today",
  },
  buy: {
    label: "Buy",
    icon: ShoppingCart,
    confirmCopy:
      "Tag yourself as a potential paying user for this? Builders see this as a buyer-intent signal.",
    hint: "I would pay for this",
  },
  invest: {
    label: "Invest",
    icon: TrendingUp,
    confirmCopy:
      "Tag yourself as a potential investor in this team? Investor-intent signals are surfaced to founders publicly.",
    hint: "I would put money into the team",
  },
};

interface ApiResponse {
  ok: true;
  counts: ReactionCounts;
  mine: UserReactionState | null;
  toggled?: "added" | "removed";
}

interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export function RepoReactions({
  repoFullName,
  initialCounts,
  initialMine,
  compact = false,
}: RepoReactionsProps) {
  const [counts, setCounts] = useState<ReactionCounts>(
    initialCounts ?? emptyReactionCounts(),
  );
  const [mine, setMine] = useState<UserReactionState | null>(
    initialMine ?? null,
  );
  const [busy, setBusy] = useState<ReactionType | null>(null);
  const [authMissing, setAuthMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the page didn't pass server-rendered initial state, fetch on mount.
  // Avoids the flash-of-zeros when the component is dropped into a page
  // that hasn't been updated to pre-fetch.
  useEffect(() => {
    if (initialCounts) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/reactions?objectType=repo&objectId=${encodeURIComponent(
            repoFullName,
          )}`,
          { cache: "no-store" },
        );
        const payload = (await res.json()) as ApiResponse | ApiError;
        if (!cancelled && payload.ok) {
          setCounts(payload.counts);
          setMine(payload.mine);
        }
      } catch {
        // Counts are non-critical; failing to hydrate is fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoFullName, initialCounts]);

  const handleToggle = useCallback(
    async (type: ReactionType) => {
      if (busy) return;
      setError(null);

      // Confirm gate for high-commitment reactions, but only when toggling
      // ON. Removing your own "buy" doesn't need a confirm.
      if (
        HIGH_COMMITMENT_REACTIONS.has(type) &&
        !mine?.[type] &&
        META[type].confirmCopy
      ) {
        if (typeof window !== "undefined") {
          const ok = window.confirm(META[type].confirmCopy);
          if (!ok) return;
        }
      }

      setBusy(type);
      // Optimistic update — flip the local state immediately, then
      // reconcile from the server response.
      const wasOn = Boolean(mine?.[type]);
      setMine((prev) => ({
        ...(prev ?? { build: false, use: false, buy: false, invest: false }),
        [type]: !wasOn,
      }));
      setCounts((prev) => ({ ...prev, [type]: prev[type] + (wasOn ? -1 : 1) }));

      try {
        const res = await fetch("/api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectType: "repo",
            objectId: repoFullName,
            reactionType: type,
          }),
        });
        if (res.status === 401 || res.status === 503) {
          setAuthMissing(true);
          // Roll back the optimistic update.
          setMine((prev) =>
            prev
              ? { ...prev, [type]: wasOn }
              : { build: false, use: false, buy: false, invest: false },
          );
          setCounts((prev) => ({
            ...prev,
            [type]: prev[type] + (wasOn ? 1 : -1),
          }));
          return;
        }
        const payload = (await res.json()) as ApiResponse | ApiError;
        if (!payload.ok) {
          throw new Error(payload.error);
        }
        setCounts(payload.counts);
        if (payload.mine) setMine(payload.mine);
      } catch (err) {
        // Roll back the optimistic update and surface a small inline error.
        setMine((prev) =>
          prev
            ? { ...prev, [type]: wasOn }
            : { build: false, use: false, buy: false, invest: false },
        );
        setCounts((prev) => ({
          ...prev,
          [type]: prev[type] + (wasOn ? 1 : -1),
        }));
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [busy, mine, repoFullName],
  );

  return (
    <div
      className="flex flex-col gap-2"
      aria-label="Builder reactions"
      data-testid="repo-reactions"
    >
      <div className="flex flex-wrap items-center gap-2">
        {REACTION_TYPES.map((type) => {
          const meta = META[type];
          const Icon = meta.icon;
          const active = Boolean(mine?.[type]);
          const count = counts[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => void handleToggle(type)}
              disabled={busy !== null}
              aria-pressed={active}
              title={meta.hint}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-button border font-mono text-xs font-medium transition-colors min-h-[36px]",
                compact ? "px-2 py-1" : "px-3 py-1.5",
                active
                  ? "bg-brand/15 border-brand text-brand"
                  : "bg-bg-card border-border-primary text-text-secondary hover:bg-bg-card-hover hover:text-text-primary",
                busy === type && "opacity-50 cursor-progress",
                busy && busy !== type && "opacity-70",
              )}
            >
              <Icon size={14} aria-hidden />
              {!compact ? <span>{meta.label}</span> : null}
              <span className="tabular-nums text-text-tertiary">{count}</span>
            </button>
          );
        })}
      </div>

      {authMissing ? (
        <p className="text-[11px] text-text-tertiary">
          Sign in to react. Reactions help builders see what to ship next.
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-down">Couldn&apos;t save: {error}</p>
      ) : null}
    </div>
  );
}

export default RepoReactions;
