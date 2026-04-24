// MomentumHeadline — server-rendered live eyebrow stat strip.
//
// Renders above the homepage H1 so the first 400px of the page carries
// immediate proof of life: count of tracked repos, breakouts in the active
// window, top mover, and data freshness. Everything is computed on the
// server from the repos array (plus data/trending.json's fetchedAt stamp)
// so there's no client-side flash.
//
// No props are client-reactive — the page is ISR-cached for 30 min, which
// is tighter than the scraper cadence (20 min) so the copy stays accurate
// within one revalidation window.

import { Flame, Zap } from "lucide-react";
import type { Repo } from "@/lib/types";
import { getRelativeTime } from "@/lib/utils";

interface MomentumHeadlineProps {
  repos: Repo[];
  /** ISO timestamp of the last trending.json fetch (from data/trending.json). */
  lastFetchedAt: string | null;
}

export function MomentumHeadline({ repos, lastFetchedAt }: MomentumHeadlineProps) {
  const total = repos.length;
  const breakouts = repos.filter((r) => r.movementStatus === "breakout").length;
  const hot = repos.filter((r) => r.movementStatus === "hot").length;

  // Top mover by 24h star delta — used for the live ticker mid-strip.
  const topMover = [...repos]
    .filter((r) => r.starsDelta24h > 0)
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)[0];

  const freshness = lastFetchedAt ? getRelativeTime(lastFetchedAt) : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-text-tertiary"
      aria-label="Live pipeline status"
    >
      <span>
        <span className="text-text-primary tabular-nums">
          {total.toLocaleString("en-US")}
        </span>{" "}
        repos tracked
      </span>

      {breakouts > 0 && (
        <>
          <span aria-hidden="true" className="text-border-primary">
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-warning">
            <Zap size={11} aria-hidden="true" />
            <span className="tabular-nums">{breakouts}</span>
            <span className="text-text-tertiary">breakouts</span>
          </span>
        </>
      )}

      {hot > 0 && (
        <>
          <span aria-hidden="true" className="text-border-primary">
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-brand">
            <Flame size={11} aria-hidden="true" />
            <span className="tabular-nums">{hot}</span>
            <span className="text-text-tertiary">hot now</span>
          </span>
        </>
      )}

      {topMover && (
        <>
          <span aria-hidden="true" className="text-border-primary">
            ·
          </span>
          <span>
            <span className="text-text-secondary">top:</span>{" "}
            <a
              href={`/repo/${topMover.owner}/${topMover.name}`}
              className="text-text-primary normal-case tracking-normal hover:text-brand"
            >
              {topMover.fullName}
            </a>{" "}
            <span className="text-functional tabular-nums">
              +{topMover.starsDelta24h.toLocaleString("en-US")}
            </span>
            <span className="text-text-tertiary"> /24h</span>
          </span>
        </>
      )}

      {freshness && (
        <>
          <span aria-hidden="true" className="text-border-primary">
            ·
          </span>
          <span
            title={`Last scraper run: ${lastFetchedAt}`}
            className="inline-flex items-center gap-1"
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-functional"
            />
            <span>data {freshness}</span>
          </span>
        </>
      )}
    </div>
  );
}
