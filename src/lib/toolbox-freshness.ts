const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function getToolboxTimestampAgeMs(
  timestamp: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return nowMs - parsed;
}

export function isToolboxTimestampFresh(
  timestamp: string | null | undefined,
  freshnessBudgetMs: number,
  nowMs: number = Date.now(),
): boolean {
  const ageMs = getToolboxTimestampAgeMs(timestamp, nowMs);
  if (ageMs === null) return false;
  if (ageMs < -MAX_FUTURE_CLOCK_SKEW_MS) return false;
  return Math.max(0, ageMs) <= freshnessBudgetMs;
}

export function shouldUseToolboxPayload(args: {
  source: string;
  timestamp: string | null | undefined;
  freshnessBudgetMs: number;
  nowMs?: number;
}): boolean {
  const nowMs = args.nowMs ?? Date.now();
  const fresh = isToolboxTimestampFresh(
    args.timestamp,
    args.freshnessBudgetMs,
    nowMs,
  );
  if (!fresh) {
    const ageMs = getToolboxTimestampAgeMs(args.timestamp, nowMs);
    console.warn("[toolbox:reader] stale payload rejected; falling back", {
      source: args.source,
      timestamp: args.timestamp ?? null,
      ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
      freshnessBudgetSeconds: Math.floor(args.freshnessBudgetMs / 1000),
    });
  }
  return fresh;
}
