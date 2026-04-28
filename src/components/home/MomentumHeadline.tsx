// MomentumHeadline — server-rendered live momentum strip (V2 typography).
//
// Renders above the homepage H1 so the first 400px of the page carries
// immediate proof of life: count of tracked repos, breakouts in the active
// window, top mover, and data freshness. Everything is computed on the
// server from the repos array (plus data/trending.json's fetchedAt stamp)
// so there's no client-side flash.
//
// Visual: V2 mono ticker — uppercase, 0.18em tracking via `.v2-mono`,
// tabular-nums on the counts, mid-dot separators in `--v2-line-300`,
// breakouts highlighted in `--v2-acc`, top-mover delta in `--v2-sig-green`,
// freshness prefixed by a `.v2-live-dot`.
//
// No props are client-reactive — the page is ISR-cached for 30 min, which
// is tighter than the scraper cadence (20 min) so the copy stays accurate
// within one revalidation window.

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
      className="v2-mono flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[color:var(--v2-ink-300)]"
      aria-label="Live pipeline status"
    >
      <span
        aria-hidden="true"
        className="v2-live-dot"
      />

      <span>
        <span className="tabular-nums text-[color:var(--v2-ink-100)]">
          {total.toLocaleString("en-US")}
        </span>{" "}
        repos tracked
      </span>

      {breakouts > 0 && (
        <>
          <span aria-hidden="true" className="text-[color:var(--v2-line-300)]">
            ·
          </span>
          <span className="text-[color:var(--v2-acc)]">
            <span className="tabular-nums">+{breakouts}</span>{" "}
            <span className="text-[color:var(--v2-ink-300)]">breakouts</span>
          </span>
        </>
      )}

      {hot > 0 && (
        <>
          <span aria-hidden="true" className="text-[color:var(--v2-line-300)]">
            ·
          </span>
          <span className="text-[color:var(--v2-sig-green)]">
            <span className="tabular-nums">+{hot}</span>{" "}
            <span className="text-[color:var(--v2-ink-300)]">hot</span>
          </span>
        </>
      )}

      {topMover && (
        <>
          <span aria-hidden="true" className="text-[color:var(--v2-line-300)]">
            ·
          </span>
          <span>
            <span className="text-[color:var(--v2-ink-300)]">top:</span>{" "}
            <a
              href={`/repo/${topMover.owner}/${topMover.name}`}
              className="text-[color:var(--v2-ink-100)] tracking-normal normal-case transition-colors hover:text-[color:var(--v2-acc)]"
            >
              {topMover.fullName}
            </a>{" "}
            <span className="tabular-nums text-[color:var(--v2-sig-green)]">
              +{topMover.starsDelta24h.toLocaleString("en-US")}
            </span>
            <span className="text-[color:var(--v2-ink-400)]"> /24h</span>
          </span>
        </>
      )}

      {freshness && (
        <>
          <span aria-hidden="true" className="text-[color:var(--v2-line-300)]">
            ·
          </span>
          <span
            title={`Last scraper run: ${lastFetchedAt}`}
            className="text-[color:var(--v2-ink-300)]"
          >
            data{" "}
            <span className="text-[color:var(--v2-ink-100)]">{freshness}</span>
          </span>
        </>
      )}
    </div>
  );
}
