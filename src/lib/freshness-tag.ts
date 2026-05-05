export type FreshnessTagTone = "fresh" | "stale" | "normal";

const FRESH_MAX_AGE_MINUTES = 30;
const STALE_MIN_AGE_MINUTES = 60;

export function getFreshnessTagTone(
  isoDate: string,
  nowMs: number = Date.now(),
): FreshnessTagTone {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) return "normal";
  const ageMinutes = (nowMs - then) / 60_000;
  if (ageMinutes <= FRESH_MAX_AGE_MINUTES) return "fresh";
  if (ageMinutes > STALE_MIN_AGE_MINUTES) return "stale";
  return "normal";
}
