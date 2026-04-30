// V4 — AlertToggle
//
// Subscribe/unsubscribe toggle that lives on watchlist rows and the
// repo-detail page CTA. Wires to the existing /api/pipeline/alerts/rules
// CRUD endpoints — pass an `enabled` boolean, an `onToggle` handler that
// returns the new state asynchronously, and the trigger metadata used to
// craft the rule when subscribing.
//
// This component is presentation-only. The page that mounts it owns the
// fetch calls (POST to subscribe, DELETE to unsubscribe). The state lifts
// up so optimistic UI is the parent's responsibility.
//
// Usage:
//   <AlertToggle
//     enabled={hasRule}
//     repoId={repo.id}
//     trigger="star_spike"
//     onToggle={async (next) => { await postRule(...); return next; }}
//   />

"use client";

import { useState, useTransition, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { AlertTriggerType } from "@/lib/pipeline/types";

export interface AlertToggleProps {
  enabled: boolean;
  /** Async toggle handler — receives the desired next state, returns the
   * actual state after server round-trip. Throw to indicate failure. */
  onToggle: (next: boolean) => Promise<boolean>;
  /** Repo this toggle applies to (null = global rule). */
  repoId?: string | null;
  /** Trigger type used when creating a new rule. */
  trigger?: AlertTriggerType;
  /** Custom label override; defaults to "ALERT ME" / "ALERTING". */
  label?: { off: ReactNode; on: ReactNode };
  /** Compact mode — smaller, used inside watchlist rows. */
  compact?: boolean;
  className?: string;
}

const DEFAULT_LABELS = {
  off: "🔔 ALERT ME",
  on: "🔔 ALERTING",
};

export function AlertToggle({
  enabled,
  onToggle,
  label = DEFAULT_LABELS,
  compact = false,
  className,
}: AlertToggleProps) {
  // Local optimistic state so the click feels instant; reverts if the
  // server says no.
  const [optimistic, setOptimistic] = useState(enabled);
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    start(() => {
      void (async () => {
        try {
          const actual = await onToggle(next);
          setOptimistic(actual);
        } catch (e) {
          // Revert on failure.
          setOptimistic(!next);
          setError(e instanceof Error ? e.message : "alert toggle failed");
        }
      })();
    });
  };

  return (
    <button
      type="button"
      className={cn(
        "v4-alert-toggle",
        optimistic && "v4-alert-toggle--on",
        compact && "v4-alert-toggle--compact",
        isPending && "v4-alert-toggle--pending",
        className,
      )}
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={optimistic}
      aria-label={typeof label.on === "string" ? `Toggle ${label.on}` : "Toggle alert"}
      title={error ?? undefined}
    >
      {optimistic ? label.on : label.off}
    </button>
  );
}
