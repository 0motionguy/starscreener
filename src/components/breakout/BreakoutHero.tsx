// BreakoutHero — page-head with live eyebrow + 1H/24H/7D segmented switcher.
// Freshness wires honest verdict via classifyFreshness("repos", fetchedAt).
//
// URL contract: ?window=1h|24h|7d (24h default).

import Link from "next/link";

import { classifyFreshness } from "@/lib/news/freshness";

const WINDOWS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
] as const;

export type BreakoutWindow = (typeof WINDOWS)[number]["id"];

interface BreakoutHeroProps {
  window: BreakoutWindow;
  /** Total breakouts surfaced this window (sum of all tiers). */
  totalCount: number;
  /** ISO of the underlying trending fetch; classified into LIVE/WARM/STALE. */
  fetchedAt: string | null;
}

export function BreakoutHero({ window: timeWindow, totalCount, fetchedAt }: BreakoutHeroProps) {
  const fresh = classifyFreshness("repos", fetchedAt ?? null);
  const statusLabel =
    fresh.status === "live" ? "LIVE" : fresh.status === "warn" ? "WARM" : "STALE";

  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">
          <span className="live-dot" /> <b>{statusLabel}</b> · {totalCount.toLocaleString()}{" "}
          breakouts · {timeWindow === "1h" ? "1h" : timeWindow === "7d" ? "7d" : "24h"}{" "}
          velocity-weighted · scanned {fresh.ageLabel}
        </div>
        <h1 className="page-title">Breakout — before it's mainstream</h1>
        <p className="page-sub">
          Repos accelerating disproportionately to their star base. Velocity × consensus ×
          mention diversity, not absolute count. Big projects don't break out; small ones do.
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
