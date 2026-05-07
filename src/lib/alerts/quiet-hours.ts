// Quiet-hours math — pure, dependency-free.
//
// Profiles store `quiet_hours: { startMin: 0..1439, endMin: 0..1439 } | null`
// alongside `timezone: string` (IANA, e.g. "America/Los_Angeles"). The
// shape encodes minutes-since-midnight in the user's timezone so day
// rollovers across DST shifts stay sane.
//
// Cross-midnight ranges are supported: `{ startMin: 22*60, endMin: 8*60 }`
// = 22:00–08:00 (quiet through the night).
//
// Why Intl-only (no luxon, no date-fns-tz): the worker bundle stays
// small; the only thing we need from the host's tz database is "what is
// the local hour:minute right now in <tz>?" — which Intl.DateTimeFormat
// gives us directly via formatToParts.

export interface QuietHoursWindow {
  startMin: number; // 0..1439
  endMin: number; // 0..1439
}

export type QuietHoursInput = QuietHoursWindow | null | undefined;

/**
 * Return the current local time as minutes-since-midnight in the given
 * IANA timezone. Falls back to UTC if the host's Intl database doesn't
 * recognise the tz string (Node 22 ships full ICU, so this is just a
 * defensive fallback).
 */
export function nowMinutesInTz(timezone: string, now: Date = new Date()): number {
  const tz = timezone || "UTC";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
  } catch {
    // Bad tz string → use UTC.
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl returns "24" for midnight in en-US; coerce.
  return ((hour % 24) * 60 + minute) % 1440;
}

/**
 * Return true when the current local time falls inside the quiet-hours
 * window. Null/undefined input → never quiet (default "always send").
 */
export function isWithinQuietHours(
  window: QuietHoursInput,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!window) return false;
  const { startMin, endMin } = window;
  if (
    !Number.isFinite(startMin) ||
    !Number.isFinite(endMin) ||
    startMin < 0 ||
    startMin > 1439 ||
    endMin < 0 ||
    endMin > 1439
  ) {
    return false;
  }
  if (startMin === endMin) return false; // zero-width window
  const cur = nowMinutesInTz(timezone, now);
  if (startMin < endMin) {
    // Same-day window, e.g. 09:00–17:00.
    return cur >= startMin && cur < endMin;
  }
  // Cross-midnight window, e.g. 22:00–08:00.
  return cur >= startMin || cur < endMin;
}

/**
 * Compute the next minute the window OPENS at, expressed as a Date
 * relative to `now`. Used by the dispatcher to defer pending alerts
 * until quiet hours end. If we're already outside the window, returns
 * `null` (no defer needed).
 */
export function nextWakeAfterQuiet(
  window: QuietHoursInput,
  timezone: string,
  now: Date = new Date(),
): Date | null {
  if (!isWithinQuietHours(window, timezone, now)) return null;
  if (!window) return null;
  const cur = nowMinutesInTz(timezone, now);
  let minutesUntilEnd: number;
  if (window.startMin < window.endMin) {
    minutesUntilEnd = window.endMin - cur;
  } else {
    // Cross-midnight: we're either before midnight (cur >= startMin)
    // or after midnight (cur < endMin). Distance to endMin is the
    // wrap-around distance.
    if (cur >= window.startMin) {
      minutesUntilEnd = 1440 - cur + window.endMin;
    } else {
      minutesUntilEnd = window.endMin - cur;
    }
  }
  return new Date(now.getTime() + minutesUntilEnd * 60_000);
}
