import type { AlertEvent } from "@/lib/pipeline/types";

export const BROWSER_ALERTS_ENABLED_KEY = "trendingrepo-browser-alerts-enabled";
export const BROWSER_ALERTS_SEEN_KEY = "trendingrepo-browser-alerts-seen";
export const BROWSER_ALERTS_CHANGE_EVENT =
  "trendingrepo-browser-alerts-changed";

const MAX_SEEN_ALERT_IDS = 250;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function readBrowserAlertsEnabled(storage: StorageLike): boolean {
  return storage.getItem(BROWSER_ALERTS_ENABLED_KEY) === "1";
}

export function writeBrowserAlertsEnabled(
  storage: StorageLike,
  enabled: boolean,
): void {
  if (enabled) {
    storage.setItem(BROWSER_ALERTS_ENABLED_KEY, "1");
    return;
  }
  if (typeof storage.removeItem === "function") {
    storage.removeItem(BROWSER_ALERTS_ENABLED_KEY);
    return;
  }
  storage.setItem(BROWSER_ALERTS_ENABLED_KEY, "0");
}

export function parseSeenAlertIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function readSeenAlertIds(storage: StorageLike): string[] {
  return parseSeenAlertIds(storage.getItem(BROWSER_ALERTS_SEEN_KEY));
}

export function mergeSeenAlertIds(
  existingIds: string[],
  incomingIds: string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...existingIds, ...incomingIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  if (merged.length <= MAX_SEEN_ALERT_IDS) return merged;
  return merged.slice(merged.length - MAX_SEEN_ALERT_IDS);
}

export function writeSeenAlertIds(storage: StorageLike, ids: string[]): void {
  storage.setItem(
    BROWSER_ALERTS_SEEN_KEY,
    JSON.stringify(mergeSeenAlertIds([], ids)),
  );
}

export function getNewAlertEvents(
  events: AlertEvent[],
  seenIds: Iterable<string>,
): AlertEvent[] {
  const seen = new Set(seenIds);
  return events.filter((event) => event.readAt === null && !seen.has(event.id));
}

export function buildBrowserAlertTitle(
  event: AlertEvent,
  repoName?: string | null,
): string {
  const repoLabel = repoName?.trim() || event.repoId;
  return `${repoLabel} · ${event.title}`;
}

export function buildBrowserAlertBody(event: AlertEvent): string {
  return event.body?.trim() || "Open TrendingRepo for alert details.";
}
