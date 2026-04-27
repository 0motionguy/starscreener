"use client";

// Generic builder-reactions strip — works against any reaction-eligible
// object type (repo today, idea today, more later). Shared between
// <RepoReactions /> on repo cards and <IdeaCard /> on /ideas.
//
// Optimistic updates with reconciliation from the server response. The
// server returns the full counts + per-user state on every POST so we
// never need a separate "did I already react" call.

import { useCallback, useEffect, useId, useRef, useState } from "react";
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
  // UI-09: high-commitment confirm modal state. Replaces window.confirm
  // (page-blocking, not screen-reader friendly).
  const [pendingType, setPendingType] = useState<ReactionType | null>(null);

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

  const performToggle = useCallback(
    async (type: ReactionType) => {
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
    [mine, objectType, objectId],
  );

  const handleToggle = useCallback(
    (type: ReactionType) => {
      if (busy) return;
      setError(null);
      // High-commitment reactions (Buy/Invest) gate behind a confirm
      // modal — only when the user is turning the reaction ON.
      if (
        HIGH_COMMITMENT_REACTIONS.has(type) &&
        !mine?.[type] &&
        META[type].confirmCopy
      ) {
        setPendingType(type);
        return;
      }
      void performToggle(type);
    },
    [busy, mine, performToggle],
  );

  const confirmPending = useCallback(() => {
    if (!pendingType) return;
    const type = pendingType;
    setPendingType(null);
    void performToggle(type);
  }, [pendingType, performToggle]);

  const cancelPending = useCallback(() => {
    setPendingType(null);
  }, []);

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
                "v2-btn",
                active ? "v2-btn-primary" : "v2-btn-ghost",
                busy === type && "opacity-50 cursor-progress",
                busy && busy !== type && "opacity-70",
              )}
              style={{
                minHeight: 36,
                height: compact ? 32 : 36,
                padding: compact ? "0 10px" : "0 14px",
                fontSize: compact ? 10 : 11,
              }}
            >
              <Icon size={13} aria-hidden style={{ marginRight: 6 }} />
              {!compact ? <span>{meta.label}</span> : null}
              <span
                className="tabular-nums"
                style={{
                  marginLeft: 8,
                  color: active ? "inherit" : "var(--v2-ink-300)",
                  opacity: active ? 0.85 : 1,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {authMissing ? (
        <p
          className="v2-mono"
          style={{
            fontSize: 10,
            color: "var(--v2-ink-400)",
          }}
        >
          {"// SIGN IN TO REACT · reactions help builders see what to ship next"}
        </p>
      ) : null}
      {error ? (
        <p
          className="v2-mono"
          style={{
            fontSize: 10,
            color: "var(--v2-sig-red)",
          }}
        >
          {`// SAVE FAILED · ${error}`}
        </p>
      ) : null}
      {pendingType ? (
        <ConfirmReactionModal
          type={pendingType}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      ) : null}
    </div>
  );
}

/**
 * Accessible confirm modal for high-commitment reactions (UI-09 — replaces
 * window.confirm). Renders inline so the click context (the button the
 * user pressed) stays on screen behind the dialog. Focus moves to the
 * Confirm button on mount; Escape cancels.
 */
function ConfirmReactionModal({
  type,
  onConfirm,
  onCancel,
}: {
  type: ReactionType;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const meta = META[type];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="v2-card max-w-md w-full"
        style={{
          background: "var(--v2-bg-100)",
          border: "1px solid var(--v2-line-300)",
          borderRadius: 8,
          padding: 20,
        }}
      >
        <h2
          id={titleId}
          className="font-display text-lg font-bold"
          style={{ color: "var(--v2-ink-100)", marginBottom: 8 }}
        >
          {`Confirm: ${meta.label}`}
        </h2>
        <p
          id={bodyId}
          className="text-sm"
          style={{ color: "var(--v2-ink-200)", marginBottom: 16 }}
        >
          {meta.confirmCopy}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="v2-btn v2-btn-ghost"
            style={{ minHeight: 36, padding: "0 14px" }}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className="v2-btn v2-btn-primary"
            style={{ minHeight: 36, padding: "0 14px" }}
            data-testid="confirm-reaction"
          >
            {`Yes, mark as ${meta.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ObjectReactions;
