// V4 — AlertInbox
//
// Wraps a list of AlertEventRow with grouping by recency:
//   - Today
//   - This week
//   - Older
//
// Caller passes events sorted newest-first; we bucket by `firedAt`.
// Rendering uses SectionHead inside the inbox for the band labels.
// Pure presentation; no data fetching.

import { cn } from "@/lib/utils";

import type { AlertEvent } from "@/lib/pipeline/types";

import { AlertEventRow } from "./AlertEventRow";

export interface AlertInboxProps {
  events: AlertEvent[];
  /** Resolve repoId → display string. Defaults to repoId. */
  repoLabel?: (event: AlertEvent) => string;
  /** Format firedAt → "4h ago" etc. Defaults to ISO. */
  formatAge?: (event: AlertEvent) => string;
  onMarkRead?: (event: AlertEvent) => void;
  /** "now" timestamp for grouping (defaults to Date.now()). */
  nowMs?: number;
  /** Empty-state message. */
  emptyLabel?: string;
  className?: string;
}

export function AlertInbox({
  events,
  repoLabel,
  formatAge,
  onMarkRead,
  nowMs,
  emptyLabel = "No alerts yet — toggle alerts on a repo from the watchlist.",
  className,
}: AlertInboxProps) {
  if (events.length === 0) {
    return (
      <div className={cn("v4-alert-inbox", "v4-alert-inbox--empty", className)}>
        <p>{emptyLabel}</p>
      </div>
    );
  }
  const groups = bucketByRecency(events, nowMs ?? Date.now());
  return (
    <div className={cn("v4-alert-inbox", className)}>
      {groups.map((group) =>
        group.events.length === 0 ? null : (
          <section key={group.key} className="v4-alert-inbox__group">
            <header className="v4-alert-inbox__head">
              <span className="v4-alert-inbox__head-num">{group.eyebrow}</span>
              <h2 className="v4-alert-inbox__head-title">{group.title}</h2>
              <span className="v4-alert-inbox__head-meta">
                {group.events.length} ·{" "}
                {group.events.filter((e) => e.readAt === null).length} unread
              </span>
            </header>
            {group.events.map((e) => (
              <AlertEventRow
                key={e.id}
                event={e}
                ago={formatAge ? formatAge(e) : e.firedAt}
                repoLabel={repoLabel ? repoLabel(e) : undefined}
                onMarkRead={onMarkRead}
              />
            ))}
          </section>
        ),
      )}
    </div>
  );
}

interface InboxGroup {
  key: "today" | "week" | "older";
  eyebrow: string;
  title: string;
  events: AlertEvent[];
}

function bucketByRecency(events: AlertEvent[], nowMs: number): InboxGroup[] {
  const dayMs = 86_400_000;
  const today: AlertEvent[] = [];
  const week: AlertEvent[] = [];
  const older: AlertEvent[] = [];
  for (const e of events) {
    const t = Date.parse(e.firedAt);
    const diff = Number.isFinite(t) ? nowMs - t : Number.POSITIVE_INFINITY;
    if (diff < dayMs) today.push(e);
    else if (diff < dayMs * 7) week.push(e);
    else older.push(e);
  }
  return [
    { key: "today", eyebrow: "// 01", title: "Today", events: today },
    { key: "week", eyebrow: "// 02", title: "This week", events: week },
    { key: "older", eyebrow: "// 03", title: "Older", events: older },
  ];
}
