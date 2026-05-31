// SignalsHero - page-head + segmented 1H|24H|7D|30D window switcher.
// Server component. Freshness chrome routes through FreshnessPill, which
// calls classifyFreshness from news/freshness.

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
  totalMentions: number;
}

export function SignalsHero({
  window: timeWindow,
  src,
  fetchedAt,
  totalSources,
  liveSources,
  totalMentions,
}: SignalsHeroProps) {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FreshnessPill source="repos" fetchedAt={fetchedAt ?? null} />
          <span style={{ color: "var(--fg-faint)" }}>
            {totalMentions.toLocaleString()} mentions - {liveSources}/{totalSources} mention sources - {timeWindow}
          </span>
        </div>
        <h1 className="page-title">Market signals - the cockpit</h1>
        <p className="page-sub">
          Cross-source view across HN, Reddit, X, Bluesky, Dev.to, ProductHunt, npm downloads,
          arXiv papers and their cited repos, Hugging Face, AI labs, and more. One screen,
          all signals, ranked by consensus x velocity.
        </p>
      </div>
      <div className="row gap-2">
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
        <button className="btn ghost sm" type="button" aria-label="Market signal filters">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M2 4h12M4 8h8M6 12h4" />
          </svg>
          Filters
        </button>
      </div>
    </div>
  );
}

export { WINDOWS };
