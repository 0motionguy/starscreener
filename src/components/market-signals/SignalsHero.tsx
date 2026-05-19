// SignalsHero — page-head + segmented 1H|24H|7D|30D window switcher.
// Server component. Reads `?window=` from props; freshness pill wires
// through classifyFreshness from news/freshness — no hardcoded "LIVE".

import Link from "next/link";

import { FreshnessPill } from "@/components/shell/FreshnessPill";

const WINDOWS = [
  { id: "1h", label: "1H" },
  { id: "24h", label: "24H" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
] as const;

export type SignalsWindowId = (typeof WINDOWS)[number]["id"];

interface SignalsHeroProps {
  window: SignalsWindowId;
  src: string;
  fetchedAt: string | null;
  totalSources: number;
  liveSources: number;
}

export function SignalsHero({
  window: timeWindow,
  src,
  fetchedAt,
  totalSources,
  liveSources,
}: SignalsHeroProps) {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FreshnessPill source="repos" fetchedAt={fetchedAt ?? null} prefix="MARKET" />
          <span style={{ color: "var(--fg-faint)" }}>
            · {liveSources}/{totalSources} mention sources live · cross-signal scoring
          </span>
        </div>
        <h1 className="page-title">Market Signals</h1>
        <p className="page-sub">
          Live cross-source telemetry across {totalSources}+ feeds — GitHub, X, HN, Reddit, Bluesky,
          ProductHunt, Dev.to, Lobsters, npm, arXiv, Hugging Face and AI-lab announcement streams.
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Time window">
        {WINDOWS.map((w) => {
          const params = new URLSearchParams();
          params.set("window", w.id);
          if (src) params.set("src", src);
          return (
            <Link
              key={w.id}
              href={`/market-signals?${params.toString()}`}
              className={w.id === timeWindow ? "on" : ""}
              prefetch={false}
            >
              {w.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export { WINDOWS };
