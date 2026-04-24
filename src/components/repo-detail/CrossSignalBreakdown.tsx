// Cross-signal breakdown card — five horizontal bars, one per channel.
//
// Server component. Reads the per-channel raw component values via the
// __test export from src/lib/pipeline/cross-signal so we render the
// same numbers the score formula uses (no risk of drift). Each bar is
// 0..1 wide using the source-canonical brand color.
//
// The `reddit` component is corpus-normalized in the actual fusion step,
// so a single repo viewed in isolation can't reproduce that ratio. We
// fall back to a per-repo "raw / max-possible-tier" approximation that
// keeps the bar honest: it caps at 1.0 when the repo has any 48h
// activity and proportionally otherwise. Users get a directional read,
// not a ranked one — and the dot above the bar still reflects the
// authoritative "is firing" boolean from getChannelStatus.

import type { JSX } from "react";
import type { Repo } from "@/lib/types";
import {
  __test as crossSignalInternals,
  getChannelStatus,
} from "@/lib/pipeline/cross-signal";
import { RubricPopover } from "./RubricPopover";

interface CrossSignalBreakdownProps {
  repo: Repo;
}

interface ChannelRow {
  key: "github" | "reddit" | "hn" | "bluesky" | "devto";
  label: string;
  color: string;
  value: number; // 0..1
  active: boolean;
  hint: string;
}

// Source-canonical brand colors. Same palette ChannelDots uses so the
// bars and dots stay visually anchored together.
const CHANNEL_COLORS = {
  github: "#22c55e",
  reddit: "#ff4500",
  hn: "#ff6600",
  bluesky: "#0085FF",
  devto: "#0a0a0a",
};

/**
 * Approximate the reddit component value for a single repo (0..1) without
 * needing the full corpus min-max normalization. We use a per-repo cap of
 * trendingScore = 100 (typical breakout-tier) so:
 *   raw 0 → 0
 *   raw ≥ 100 → 1.0
 *   anything in between → linear ratio.
 * The label below the bar makes it explicit this is a raw activity proxy,
 * not the corpus-normalized component used in the final score.
 */
function approxRedditDisplay(rawScore: number): number {
  if (rawScore <= 0) return 0;
  return Math.min(1, rawScore / 100);
}

export function CrossSignalBreakdown({
  repo,
}: CrossSignalBreakdownProps): JSX.Element {
  const status = getChannelStatus(repo);
  const nowMs = Date.now();

  const githubVal = crossSignalInternals.githubComponent(repo.movementStatus);
  const redditRaw = crossSignalInternals.redditRawScore(repo.fullName, nowMs);
  const redditDisplay = approxRedditDisplay(redditRaw);
  const hnVal = crossSignalInternals.hnComponent(repo.fullName);
  const bskyVal = crossSignalInternals.blueskyComponent(repo.fullName);
  const devtoVal = crossSignalInternals.devtoComponent(repo.fullName);

  const rows: ChannelRow[] = [
    {
      key: "github",
      label: "GitHub momentum",
      color: CHANNEL_COLORS.github,
      value: githubVal,
      active: status.github,
      hint:
        repo.movementStatus === "breakout"
          ? "breakout (1.0)"
          : repo.movementStatus === "hot"
            ? "hot (0.7)"
            : repo.movementStatus === "rising"
              ? "rising (0.4)"
              : `${repo.movementStatus ?? "stable"} (0)`,
    },
    {
      key: "reddit",
      label: "Reddit",
      color: CHANNEL_COLORS.reddit,
      value: redditDisplay,
      active: status.reddit,
      hint:
        redditRaw > 0
          ? `raw 48h velocity ${redditRaw.toFixed(1)} (corpus-normalized in score)`
          : "no posts in last 48h",
    },
    {
      key: "hn",
      label: "HackerNews",
      color: CHANNEL_COLORS.hn,
      value: hnVal,
      active: status.hn,
      hint:
        hnVal === 1.0
          ? "front page hit (1.0)"
          : hnVal === 0.7
            ? "≥3 mentions / 7d (0.7)"
            : hnVal === 0.4
              ? "1-2 mentions / 7d (0.4)"
              : "no HN traction",
    },
    {
      key: "bluesky",
      label: "Bluesky",
      color: CHANNEL_COLORS.bluesky,
      value: bskyVal,
      active: status.bluesky,
      hint:
        bskyVal === 1.0
          ? "≥5 mentions / 7d (1.0)"
          : bskyVal === 0.7
            ? "2-4 mentions / 7d (0.7)"
            : bskyVal === 0.4
              ? "1 mention / 7d (0.4)"
              : "no Bluesky chatter",
    },
    {
      key: "devto",
      label: "dev.to",
      color: CHANNEL_COLORS.devto,
      value: devtoVal,
      active: status.devto,
      hint:
        devtoVal === 1.0
          ? "≥3 articles / 7d (1.0)"
          : devtoVal === 0.7
            ? "2 articles / 7d (0.7)"
            : devtoVal === 0.4
              ? "1 article / 7d (0.4)"
              : "no dev.to writeups",
    },
  ];

  const score = repo.crossSignalScore ?? 0;
  const firing = repo.channelsFiring ?? 0;

  return (
    <section
      aria-label="Cross-signal breakdown"
      className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
    >
      <header className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">
          Cross-signal breakdown
          <span className="ml-2 text-text-tertiary">
            {"// per-channel components"}
          </span>
        </h2>
        <span
          className="font-mono text-[11px] text-text-tertiary tabular-nums"
          title="Cross-signal score (0-5): weighted sum of per-channel components. 5.0 = strong signal across >=4 channels in 7d. 4.0 = strong on >=3. 3.0 = strong on >=2. 2.0+ = active on 1+. Below 1.0 = low or no cross-channel activity."
        >
          score{" "}
          <span className="text-text-primary">{score.toFixed(2)}</span>
          {" / 5.0  ·  "}
          <span className="text-text-primary">{firing}</span>/5 firing
        </span>
      </header>

      {/* Scoring rubric — collapsed by default so the card stays compact.
          Users who want to know how 0.80 / 5.0 was derived click the
          summary to reveal the full tier table. Zero-JS (<details>). */}
      <div className="mb-3">
        <RubricPopover summary="How is this scored?">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 font-mono text-[11px]">
            <dt className="text-text-tertiary uppercase tracking-wider">5.0</dt>
            <dd className="text-text-secondary">strong signal across &ge;4 of 5 channels</dd>
            <dt className="text-text-tertiary uppercase tracking-wider">4.0</dt>
            <dd className="text-text-secondary">strong signal across &ge;3 of 5 channels</dd>
            <dt className="text-text-tertiary uppercase tracking-wider">3.0</dt>
            <dd className="text-text-secondary">strong signal across &ge;2 of 5 channels</dd>
            <dt className="text-text-tertiary uppercase tracking-wider">2.0+</dt>
            <dd className="text-text-secondary">active on at least 1 channel</dd>
            <dt className="text-text-tertiary uppercase tracking-wider">&lt;1.0</dt>
            <dd className="text-text-secondary">low or no cross-channel activity</dd>
          </dl>
          <p className="mt-2 text-[10px] leading-snug text-text-tertiary">
            Each channel contributes 0-1. Per-channel tiers: GitHub (breakout 1.0 /
            hot 0.7 / rising 0.4), HN (front-page 1.0 / &ge;3 mentions 0.7 / 1-2
            mentions 0.4), Bluesky (&ge;5 mentions 1.0 / 2-4 0.7 / 1 0.4), dev.to
            (&ge;3 articles 1.0 / 2 0.7 / 1 0.4), Reddit (corpus-normalized 48h
            velocity).
          </p>
        </RubricPopover>
      </div>

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.key}
            title={`${row.label}: ${row.hint}${row.active ? "" : " (not firing)"}`}
            className="grid grid-cols-[120px_1fr_56px] sm:grid-cols-[160px_1fr_72px] items-center gap-3"
          >
            {/* Label + dot */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  backgroundColor: row.active ? row.color : "transparent",
                  border: `1px solid ${row.color}${row.active ? "" : "66"}`,
                }}
                aria-hidden
              />
              <span className="font-mono text-[11px] text-text-secondary truncate">
                {row.label}
              </span>
            </div>

            {/* Bar */}
            <div
              className="relative h-2 rounded-full bg-bg-secondary overflow-hidden"
              title={row.hint}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                style={{
                  width: `${Math.max(2, Math.round(row.value * 100))}%`,
                  backgroundColor: row.color,
                  opacity: row.active ? 1 : 0.18,
                }}
              />
            </div>

            {/* Value readout */}
            <span className="font-mono text-[11px] text-text-tertiary tabular-nums text-right">
              {row.value.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10px] text-text-tertiary leading-snug">
        <span className="font-mono">*</span> Reddit bar shows a per-repo
        velocity proxy (raw score / 100); the score formula uses the
        corpus-normalized version so a single repo&apos;s bar may not match
        its contribution to the corpus-wide ranking.
      </p>
    </section>
  );
}

export default CrossSignalBreakdown;
