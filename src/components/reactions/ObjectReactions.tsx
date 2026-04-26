"use client";

// Generic builder-reactions strip — works against any reaction-eligible
// object type (repo today, idea today, more later). Shared between
// <RepoReactions /> on repo cards and <IdeaCard /> on /ideas.
//
// Optimistic updates with reconciliation from the server response. The
// server returns the full counts + per-user state on every POST so we
// never need a separate "did I already react" call.

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
  type ReactionObjectType,
  type ReactionType,
  type UserReactionState,
} from "@/lib/reactions-shape";
import { cn } from "@/lib/utils";

interface ObjectReactionsProps {
  objectType: ReactionObjectType;
  /**
   * For repos this is the GitHub fullName ("owner/name") — the API
   * lower-cases it. For ideas it's the short id; case is preserved.
   */
  objectId: string;
  initialCounts?: ReactionCounts;
  initialMine?: UserReactionState | null;
  /** Compact mode strips the labels — for inline use on dense rows. */
  compact?: boolean;
  variant?: "default" | "mono";
}

interface ReactionMeta {
  label: string;
  icon: LucideIcon;
  confirmCopy: string | null;
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
      "Tag yourself as a potential paying user? Builders see this as a buyer-intent signal.",
    hint: "I would pay for this",
  },
  invest: {
    label: "Invest",
    icon: TrendingUp,
    confirmCopy:
      "Tag yourself as a potential investor? Investor-intent signals are surfaced to founders publicly.",
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

export function ObjectReactions({
  objectType,
  objectId,
  initialCounts,
  initialMine,
  compact = false,
  variant = "default",
}: ObjectReactionsProps) {
  const [counts, setCounts] = useState<ReactionCounts>(
    initialCounts ?? emptyReactionCounts(),
  );
  const [mine, setMine] = useState<UserReactionState | null>(
    initialMine ?? null,
  );
  const [busy, setBusy] = useState<ReactionType | null>(null);
  const [authMissing, setAuthMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCounts) return;
    let cancelled = false;
    void (async () => {
      try {
        const url =
          `/api/reactions?objectType=${encodeURIComponent(objectType)}` +
          `&objectId=${encodeURIComponent(objectId)}`;
        const res = await fetch(url, { cache: "no-store" });
        const payload = (await res.json()) as ApiResponse | ApiError;
        if (!cancelled && payload.ok) {
          setCounts(payload.counts);
          setMine(payload.mine);
        }
      } catch {
        // counts are non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [objectType, objectId, initialCounts]);

  const handleToggle = useCallback(
    async (type: ReactionType) => {
      if (busy) return;
      setError(null);
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
            objectType,
            objectId,
            reactionType: type,
          }),
        });
        if (res.status === 401 || res.status === 503) {
          setAuthMissing(true);
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
        if (!payload.ok) throw new Error(payload.error);
        setCounts(payload.counts);
        if (payload.mine) setMine(payload.mine);
      } catch (err) {
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
    [busy, mine, objectType, objectId],
  );

  return (
    <div
      className="flex flex-col gap-2"
      aria-label="Builder reactions"
      data-testid={`object-reactions-${objectType}`}
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
                variant === "mono"
                  ? active
                    ? "border-white/25 bg-white/10 text-white"
                    : "border-white/10 bg-transparent text-text-tertiary hover:border-white/20 hover:text-text-primary"
                  : active
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

export default ObjectReactions;
