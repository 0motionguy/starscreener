// V4 — AlertEventRow
//
// One fired alert event in the inbox. Mockup-canonical row:
//
//   [STAR_SPIKE]  anthropic/claude-code              4h ago
//   +824 stars / 24h crossed your threshold of 500
//   [→ OPEN] [✓ MARK READ]
//
// Unread events get a left rail and slightly heavier title weight.
// Marked-read events fade to ink-300.

import { cn } from "@/lib/utils";

import type { AlertEvent, AlertTriggerType } from "@/lib/pipeline/types";

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

export interface AlertEventRowProps {
  event: AlertEvent;
  /** Pre-formatted relative time (caller computes). */
  ago: string;
  /** Optional repo display label (caller resolves repoId → "anthropic/skills"). */
  repoLabel?: string;
  onMarkRead?: (event: AlertEvent) => void;
  className?: string;
}

export function AlertEventRow({
  event,
  ago,
  repoLabel,
  onMarkRead,
  className,
}: AlertEventRowProps) {
  const isUnread = event.readAt === null;
  const tone = TRIGGER_TONES[event.trigger] ?? "var(--v4-ink-300)";
  return (
    <article
      className={cn(
        "v4-alert-event",
        isUnread ? "v4-alert-event--unread" : "v4-alert-event--read",
        className,
      )}
    >
      <header className="v4-alert-event__head">
        <span
          className="v4-alert-event__pip"
          style={{ background: tone }}
          aria-hidden="true"
        />
        <span className="v4-alert-event__type">
          {event.trigger.toUpperCase().replace(/_/g, " ")}
        </span>
        <span className="v4-alert-event__repo">
          {repoLabel ?? event.repoId}
        </span>
        <span className="v4-alert-event__ago">{ago}</span>
      </header>
      <h3 className="v4-alert-event__title">{event.title}</h3>
      <p className="v4-alert-event__body">{event.body}</p>
      <footer className="v4-alert-event__actions">
        {event.url ? (
          <a className="v4-alert-event__open" href={event.url}>
            → OPEN
          </a>
        ) : null}
        {isUnread && onMarkRead ? (
          <button
            type="button"
            className="v4-alert-event__mark"
            onClick={() => onMarkRead(event)}
          >
            ✓ MARK READ
          </button>
        ) : null}
      </footer>
    </article>
  );
}
