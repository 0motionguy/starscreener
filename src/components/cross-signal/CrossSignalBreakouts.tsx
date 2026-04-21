// Cross-Signal Breakouts — homepage section showing repos that fire across
// multiple channels (GitHub momentum + Reddit velocity + HN presence).
//
// Server component. Filters the supplied repo list to channelsFiring >= MIN
// (defaults to 2 per mission spec), sorts by crossSignalScore desc, caps
// at 5 rows. If fewer than 5 repos qualify, shows what exists — no filler.
// If zero qualify, the entire section is omitted (no empty state) so quiet
// days don't leave a dead block on the page.
//
// Each row links to the repo detail page, shows ChannelDots prominently,
// and surfaces stars + 24h delta for context.

import Link from "next/link";
import { Star } from "lucide-react";
import type { Repo } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { ChannelDots } from "./ChannelDots";
import { HnBadge } from "@/components/hackernews/HnBadge";
import { getHnMentions } from "@/lib/hackernews";

interface CrossSignalBreakoutsProps {
  repos: Repo[];
  /** Minimum channelsFiring to qualify. Default 2. */
  minChannels?: number;
  /** Max rows to render. Default 5. */
  limit?: number;
}

export function CrossSignalBreakouts({
  repos,
  minChannels = 2,
  limit = 5,
}: CrossSignalBreakoutsProps) {
  const candidates = repos
    .filter((r) => (r.channelsFiring ?? 0) >= minChannels)
    .sort((a, b) => (b.crossSignalScore ?? 0) - (a.crossSignalScore ?? 0))
    .slice(0, limit);

  if (candidates.length === 0) return null;

  return (
    <section
      aria-labelledby="cross-signal-breakouts-heading"
      className="rounded-card border border-border-primary bg-bg-card shadow-card"
    >
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2
          id="cross-signal-breakouts-heading"
          className="font-mono text-[11px] uppercase tracking-wider text-text-secondary"
        >
          Cross-Signal Breakouts
        </h2>
        <p className="text-[11px] text-text-tertiary">
          Firing across multiple channels
        </p>
      </header>

      <ol className="divide-y divide-border-primary/40">
        {candidates.map((repo, i) => {
          const hnMention = getHnMentions(repo.fullName);
          const delta24 = repo.starsDelta24h;
          const deltaClass =
            delta24 > 0
              ? "text-up"
              : delta24 < 0
                ? "text-down"
                : "text-text-tertiary";
          const deltaLabel =
            delta24 > 0
              ? `+${formatNumber(delta24)}`
              : delta24 < 0
                ? formatNumber(delta24)
                : "0";
          // 🚀 Hot launch: firing across multiple channels AND launched on
          // ProductHunt in the last 7 days. Rare but a strong "this one is
          // breaking out right now" indicator — shown inline before the name.
          const hotLaunch = repo.producthunt?.launchedOnPH === true;
          return (
            <li key={repo.id}>
              <Link
                href={`/repo/${repo.owner}/${repo.name}`}
                className="grid grid-cols-[20px_auto_1fr_auto] md:grid-cols-[20px_auto_1fr_auto_auto_auto] gap-2 items-center px-3 md:px-4 min-h-[44px] md:h-10 hover:bg-bg-card-hover transition-colors"
              >
                <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
                  {i + 1}
                </span>
                <ChannelDots repo={repo} size="md" />
                <span className="text-[12px] text-text-primary truncate font-medium inline-flex items-center gap-2 min-w-0">
                  {hotLaunch ? (
                    <span
                      className="shrink-0 rounded-sm bg-brand/15 text-brand font-mono text-[9px] px-1 py-px uppercase tracking-wider"
                      title={`Hot launch — ${repo.producthunt?.launch?.votesCount ?? 0} PH votes, ${repo.producthunt?.launch?.daysSinceLaunch ?? 0}d ago`}
                    >
                      🚀 Hot launch
                    </span>
                  ) : null}
                  <span className="truncate">{repo.fullName}</span>
                </span>
                {/* HN badge + stars hidden on mobile to keep rows from
                    overflowing. The 24h delta is the load-bearing signal. */}
                <span className="hidden md:inline-flex"><HnBadge mention={hnMention} size="sm" /></span>
                <span className="hidden md:inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary tabular-nums">
                  <Star size={11} className="text-warning shrink-0" fill="currentColor" />
                  {formatNumber(repo.stars)}
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums whitespace-nowrap ${deltaClass}`}
                  title={`${deltaLabel} stars / 24h`}
                >
                  {deltaLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default CrossSignalBreakouts;
