// HomeHero — above-the-fold masthead for the trending terminal.
//
// Editorial block: display-font H1, serif accent subtitle, live-data
// status line with a pulsing green dot, and three mini-stats (tracked /
// breakouts / rising). Zero chrome — sits directly on the ambient canvas
// so the grid background reads through.

import { getRelativeTime } from "@/lib/utils";

interface HomeHeroProps {
  totalTracked: number;
  breakouts: number;
  rising: number;
  fetchedAt: string;
}

export function HomeHero({
  totalTracked,
  breakouts,
  rising,
  fetchedAt,
}: HomeHeroProps) {
  const relative = getRelativeTime(fetchedAt);

  return (
    <header className="mb-5 sm:mb-6">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 label-section mb-2">
            <span
              className="live-dot"
              aria-hidden="true"
            />
            <span className="text-text-tertiary">
              LIVE · UPDATED {relative.toUpperCase()}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-text-primary leading-[1.05]">
            Repo Momentum Terminal
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-[15px] text-text-secondary leading-relaxed">
            Real-time trend screener for GitHub&apos;s hottest repos.{" "}
            <span className="text-text-tertiary">
              Classified, scored, and ranked on every scrape cycle.
            </span>
          </p>
        </div>

        <dl className="flex items-stretch gap-5 sm:gap-6 font-mono">
          <Stat label="TRACKED" value={totalTracked.toLocaleString()} />
          <div className="w-px self-stretch bg-border-primary/60" aria-hidden />
          <Stat
            label="BREAKOUT"
            value={breakouts.toLocaleString()}
            tone="brand"
          />
          <div className="w-px self-stretch bg-border-primary/60" aria-hidden />
          <Stat
            label="RISING"
            value={rising.toLocaleString()}
            tone="accent"
          />
        </dl>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "brand" | "accent";
}) {
  const valueClass =
    tone === "brand"
      ? "text-brand"
      : tone === "accent"
        ? "text-accent-green"
        : "text-text-primary";
  return (
    <div className="flex flex-col items-end leading-tight">
      <dt className="label-micro text-text-muted mb-0.5">{label}</dt>
      <dd
        className={`text-xl sm:text-2xl font-bold tabular-nums ${valueClass}`}
      >
        {value}
      </dd>
    </div>
  );
}
