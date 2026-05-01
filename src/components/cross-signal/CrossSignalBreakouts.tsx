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
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoDisplayLogoUrl } from "@/lib/logos";

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
      className="v2-card overflow-hidden"
    >
      <div className="v2-term-bar">
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="block h-1.5 w-1.5 rounded-full v2-live-dot" />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--v2-line-200)" }}
          />
        </span>
        <span
          id="cross-signal-breakouts-heading"
          className="flex-1 truncate"
          style={{ color: "var(--v2-ink-200)" }}
        >
          {"// CROSS-SIGNAL BREAKOUTS"}
        </span>
        <span
          className="v2-stat shrink-0"
          style={{ color: "var(--v2-ink-300)" }}
        >
          {candidates.length} FIRING
        </span>
      </div>

      <ol className="divide-y divide-border-primary/40">
        {candidates.map((repo, i) => {
          const hnMention = getHnMentions(repo.fullName);
          const delta24 = repo.starsDelta24h;
          const deltaClass =
            delta24 > 0
              ? "text-[var(--v4-money)]"
              : delta24 < 0
                ? "text-[var(--v4-red)]"
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
                <EntityLogo
                  src={repoDisplayLogoUrl(repo.fullName, repo.ownerAvatarUrl, 20)}
                  name={repo.fullName}
                  size={20}
                  shape="square"
                  alt=""
                />
                <span className="text-[12px] text-text-primary truncate font-medium inline-flex items-center gap-2 min-w-0">
                  {hotLaunch ? (
                    <span
                      className="v2-tag shrink-0"
                      style={{
                        fontSize: 9,
                        padding: "1px 4px",
                        background: "var(--v2-acc-soft)",
                        borderColor: "var(--v2-acc)",
                        color: "var(--v2-acc)",
                      }}
                      title={`Hot launch — ${repo.producthunt?.launch?.votesCount ?? 0} PH votes, ${repo.producthunt?.launch?.daysSinceLaunch ?? 0}d ago`}
                    >
                      🚀 HOT LAUNCH
                    </span>
                  ) : null}
                  <span className="truncate">{repo.fullName}</span>
                </span>
                <span className="hidden sm:inline-flex">
                  <ChannelDots repo={repo} size="md" />
                </span>
                {/* HN badge + stars hidden on mobile to keep rows from
                    overflowing. The 24h delta is the load-bearing signal. */}
                <span className="hidden md:inline-flex"><HnBadge mention={hnMention} size="sm" /></span>
                <span className="hidden md:inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary tabular-nums">
                  <Star size={11} className="text-[var(--v4-amber)] shrink-0" fill="currentColor" />
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
