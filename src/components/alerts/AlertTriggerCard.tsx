"use client";

// V4 — AlertTriggerCard
//
// Display + edit one AlertRule. Used on /alerts settings tab:
//
//   ┌────────────────────────────────────────────────┐
//   │ ●  STAR_SPIKE              [ON]   [REMOVE]      │
//   │ anthropic/claude-code · threshold 100/24h       │
//   │ cooldown 60m · last fired 4h ago                │
//   └────────────────────────────────────────────────┘
//
// Pure presentation; caller wires onToggle / onDelete.

import { cn } from "@/lib/utils";

import type { AlertRule, AlertTriggerType } from "@/lib/pipeline/types";

const TRIGGER_LABELS: Record<AlertTriggerType, string> = {
  star_spike: "STAR SPIKE",
  new_release: "NEW RELEASE",
  rank_jump: "RANK JUMP",
  discussion_spike: "DISCUSSION SPIKE",
  momentum_threshold: "MOMENTUM",
  breakout_detected: "BREAKOUT",
  daily_digest: "DAILY DIGEST",
  weekly_digest: "WEEKLY DIGEST",
};

const TRIGGER_TONES: Record<AlertTriggerType, string> = {
  star_spike: "var(--v4-money)",
  new_release: "var(--v4-cyan)",
  rank_jump: "var(--v4-acc)",
  discussion_spike: "var(--v4-violet)",
  momentum_threshold: "var(--v4-amber)",
  breakout_detected: "var(--v4-acc)",
  daily_digest: "var(--v4-blue)",
  weekly_digest: "var(--v4-blue)",
};

export interface AlertTriggerCardProps {
  rule: AlertRule;
  onToggle?: (rule: AlertRule, next: boolean) => void;
  onDelete?: (rule: AlertRule) => void;
  /** Optional repo-name lookup (caller resolves repoId → display name). */
  repoLabel?: string;
  /** Optional last-fired-ago label (caller formats). */
  lastFiredLabel?: string;
  className?: string;
}

export function AlertTriggerCard({
  rule,
  onToggle,
  onDelete,
  repoLabel,
  lastFiredLabel,
  className,
}: AlertTriggerCardProps) {
  const triggerLabel = TRIGGER_LABELS[rule.trigger] ?? rule.trigger.toUpperCase();
  const tone = TRIGGER_TONES[rule.trigger] ?? "var(--v4-ink-300)";
  return (
    <div className={cn("v4-trigger-card", !rule.enabled && "v4-trigger-card--off", className)}>
      <header className="v4-trigger-card__head">
        <span
          className="v4-trigger-card__pip"
          style={{ background: tone }}
          aria-hidden="true"
        />
        <span className="v4-trigger-card__type">{triggerLabel}</span>
        <div className="v4-trigger-card__actions">
          {onToggle ? (
            <button
              type="button"
              className={cn(
                "v4-trigger-card__toggle",
                rule.enabled && "v4-trigger-card__toggle--on",
              )}
              onClick={() => onToggle(rule, !rule.enabled)}
              aria-pressed={rule.enabled}
            >
              {rule.enabled ? "ON" : "OFF"}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="v4-trigger-card__delete"
              onClick={() => onDelete(rule)}
              aria-label="Remove this alert"
            >
              REMOVE
            </button>
          ) : null}
        </div>
      </header>
      <div className="v4-trigger-card__target">
        {repoLabel ?? rule.repoId ?? "all repos"} · threshold {rule.threshold}
      </div>
      <div className="v4-trigger-card__meta">
        cooldown {rule.cooldownMinutes}m
        {lastFiredLabel ? ` · last fired ${lastFiredLabel}` : ""}
      </div>
    </div>
  );
}
