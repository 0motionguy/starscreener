// BreakoutHero - page-head with honest freshness and time-window tabs.

import Link from "next/link";

import { classifyFreshness, getStatusLabel } from "@/lib/news/freshness";

const WINDOWS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
] as const;

export type BreakoutWindow = (typeof WINDOWS)[number]["id"];

interface BreakoutHeroProps {
  window: BreakoutWindow;
  totalCount: number;
  fetchedAt: string | null;
}

export function BreakoutHero({
  window: timeWindow,
  totalCount,
  fetchedAt,
}: BreakoutHeroProps) {
  const fresh = classifyFreshness("repos", fetchedAt ?? null);
  const statusLabel = getStatusLabel(fresh.status);

  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">
          <span className={`live-dot ${fresh.status}`} /> <b>{statusLabel}</b> -{" "}
          {totalCount.toLocaleString()} breakouts - {timeWindow} velocity-weighted -
          scanned {fresh.ageLabel}
        </div>
        <h1 className="page-title">Breakout - before it goes mainstream</h1>
        <p className="page-sub">
          Repos accelerating disproportionately to their star base. Velocity, consensus,
          and mention diversity, not absolute count. Big projects do not break out;
          small ones do.
        </p>
      </div>
      <div className="row gap-2">
        <div className="segmented" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <Link
              key={w.id}
              href={{ query: { window: w.id } }}
              className={w.id === timeWindow ? "on" : ""}
              prefetch={false}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export { WINDOWS };
