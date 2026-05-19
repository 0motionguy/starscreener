// FreshnessPill — emits .fresh.fresh-live|.fresh-warm|.fresh-cold markup.
// Always wires through classifyFreshness. No hardcoded green-dot LiveDot.

import { classifyFreshness, type NewsSource } from "@/lib/news/freshness";

interface FreshnessPillProps {
  source: NewsSource;
  fetchedAt: string | null | undefined;
  prefix?: string;
}

const STATUS_CLASS: Record<"live" | "warn" | "cold", string> = {
  live: "fresh-live",
  warn: "fresh-warm",
  cold: "fresh-cold",
};

const STATUS_LABEL: Record<"live" | "warn" | "cold", string> = {
  live: "LIVE",
  warn: "WARM",
  cold: "STALE",
};

export function FreshnessPill({ source, fetchedAt, prefix }: FreshnessPillProps) {
  const v = classifyFreshness(source, fetchedAt ?? null);
  const cls = STATUS_CLASS[v.status];
  const labelHead = prefix ?? STATUS_LABEL[v.status];
  return (
    <span className={`fresh ${cls}`}>
      <span className="pip" /> {labelHead} · {v.ageLabel}
    </span>
  );
}
