// Bridge: pipeline-scope `AlertEvent[]` → user-scope router.
//
// The pipeline already evaluates 8 global trigger types and pushes them to
// `deliverAlertsViaEmail` (operator scope). This module is the parallel
// per-user fan-out: it adapts each fired event into the shape expected by
// `routeAlertEventsToUsers`, filters out triggers that have no user-rule
// analogue (e.g. daily/weekly digest cadences), and dispatches the call as
// a fire-and-forget side-effect with structured logging on completion.
//
// Kept out of pipeline.ts so the call site stays a one-liner — the adapter
// is non-trivial enough that inlining made earlier auto-format passes prune
// "unused" symbols mid-edit.
//
// Operator-trigger → user-rule-type mapping (best-effort match against the
// 4 user-scope rule types in `src/lib/db/schema/alerts.ts`):
//
//   star_spike          → breakout         (stars-velocity surge)
//   breakout_detected   → breakout         (cross-source classification)
//   momentum_threshold  → breakout         (general momentum signal)
//   new_release         → release          (1:1)
//   rank_jump           → rank_threshold   (1:1, threshold-direction lost)
//   discussion_spike    → mention_spike    (1:1)
//   daily_digest        → SKIP             (no user-rule analogue)
//   weekly_digest       → SKIP             (no user-rule analogue)

import {
  routeAlertEventsToUsers,
  type FiredAlertEvent,
} from "../alerts/event-router";
import type { AlertEvent, AlertTriggerType } from "./types";

const TRIGGER_TO_USER_RULE_TYPE: Partial<
  Record<AlertTriggerType, FiredAlertEvent["ruleType"]>
> = {
  star_spike: "breakout",
  breakout_detected: "breakout",
  momentum_threshold: "breakout",
  new_release: "release",
  rank_jump: "rank_threshold",
  discussion_spike: "mention_spike",
};

/**
 * Convert pipeline AlertEvent[] → user-router FiredAlertEvent[].
 * Skips events whose trigger has no user-rule analogue, or whose repo is
 * absent from the supplied `repoLookup` (the fullName is required to
 * cross-reference user `watchlist_items.repo_full_name`).
 */
function adapt(
  events: AlertEvent[],
  repoLookup: Map<string, { fullName: string }>,
): FiredAlertEvent[] {
  const out: FiredAlertEvent[] = [];
  for (const ev of events) {
    const ruleType = TRIGGER_TO_USER_RULE_TYPE[ev.trigger];
    if (!ruleType) continue;
    const repo = repoLookup.get(ev.repoId);
    if (!repo) continue;
    out.push({
      entityType: "repo",
      entityId: repo.fullName,
      ruleType,
      payload: {
        title: ev.title,
        body: ev.body,
        url: ev.url,
        value: ev.conditionValue,
        threshold: ev.threshold,
      },
      firedAt: new Date(ev.firedAt),
    });
  }
  return out;
}

/**
 * Fire-and-forget: dispatch matching events to the per-user alert router.
 * Logs router metrics on success, and the failure reason on rejection —
 * never throws, so the caller can drop this in beside `deliverAlertsViaEmail`
 * without worrying about operator-alert failure isolation.
 */
export function fanOutToUserRouter(
  events: AlertEvent[],
  repoLookup: Map<string, { fullName: string }>,
): void {
  const userScope = adapt(events, repoLookup);
  if (userScope.length === 0) return;
  routeAlertEventsToUsers(userScope)
    .then((metrics) => {
      console.log(
        JSON.stringify({
          scope: "alert:user-router",
          level: metrics.errors > 0 ? "warn" : "info",
          ...metrics,
        }),
      );
    })
    .catch((err) => {
      console.error(
        JSON.stringify({
          scope: "alert:user-router",
          level: "error",
          message: err instanceof Error ? err.message : String(err),
          eventsConsidered: userScope.length,
        }),
      );
    });
}
