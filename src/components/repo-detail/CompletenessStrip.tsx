import type { JSX } from "react";
import { cn } from "@/lib/utils";

export interface CompletenessStripItem {
  label: string;
  ready: boolean;
}

interface CompletenessStripProps {
  items: CompletenessStripItem[];
}

function scoreCompleteness(items: CompletenessStripItem[]): number {
  if (items.length === 0) return 0;
  const readyCount = items.filter((item) => item.ready).length;
  return Math.round((readyCount / items.length) * 100);
}

function scoreTone(score: number): "good" | "warn" | "bad" {
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

export function CompletenessStrip({ items }: CompletenessStripProps): JSX.Element {
  const score = scoreCompleteness(items);
  const tone = scoreTone(score);

  return (
    <section className="v2-card p-3" aria-label="Profile completeness">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-tertiary">
          {"// PROFILE COMPLETENESS"}
        </span>
        <span
          className={cn(
            "badge",
            tone === "good"
              ? "badge--positive"
              : tone === "warn"
                ? "badge--warning"
                : "badge--danger",
          )}
        >
          {score}% ready
        </span>
        <span className="text-[11px] text-text-tertiary">
          {items.filter((item) => item.ready).length}/{items.length} sections populated
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.label}
            className={cn("badge", item.ready ? "badge--positive" : "badge--muted")}
          >
            {item.label}: {item.ready ? "ready" : "missing"}
          </span>
        ))}
      </div>
    </section>
  );
}

export default CompletenessStrip;
