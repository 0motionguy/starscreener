// Cross-signal breakdown card — six horizontal bars, one per channel.
//
// V4. Server component. Reads per-channel raw component values via the
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
  key: "github" | "reddit" | "hn" | "bluesky" | "devto" | "twitter";
  label: string;
  color: string;
  value: number; // 0..1
  active: boolean;
  hint: string;
}

// Source-canonical brand colors. Same palette ChannelDots uses so the
// bars and dots stay visually anchored together. These are locked
// signal-state colors (semantic, not arbitrary hex).
const CHANNEL_COLORS = {
  github: "#22c55e",
  reddit: "#ff4500",
  hn: "#ff6600",
  bluesky: "#0085FF",
  devto: "#0a0a0a",
  twitter: "#1d9bf0",
};

/**
 * Approximate the reddit component value for a single repo (0..1) without
 * needing the full corpus min-max normalization.
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
  const twitterVal = crossSignalInternals.twitterComponent(repo.fullName);

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
    {
      key: "twitter",
      label: "X (Twitter)",
      color: CHANNEL_COLORS.twitter,
      value: twitterVal,
      active: status.twitter,
      hint:
        twitterVal === 1.0
          ? "≥10 mentions / 24h (1.0)"
          : twitterVal === 0.7
            ? "3-9 mentions / 24h (0.7)"
            : twitterVal === 0.4
              ? "1-2 mentions / 24h (0.4)"
              : "no X chatter",
    },
  ];

  const score = repo.crossSignalScore ?? 0;
  const firing = repo.channelsFiring ?? 0;

  return (
    <section
      aria-label="Cross-signal breakdown"
      style={{
        border: "1px solid var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--v4-line-200)",
          background: "var(--v4-bg-050)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--v4-ink-200)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// CROSS-SIGNAL BREAKDOWN · PER-CHANNEL COMPONENTS"}
        </span>
        <span
          className="tabular-nums"
          style={{
            flexShrink: 0,
            color: "var(--v4-ink-300)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
          title="Cross-signal score (0-5): weighted sum of per-channel components. 5.0 = strong signal across >=4 channels in 7d. 4.0 = strong on >=3. 3.0 = strong on >=2. 2.0+ = active on 1+. Below 1.0 = low or no cross-channel activity."
        >
          <span style={{ color: "var(--v4-acc)" }}>{score.toFixed(2)}</span>
          {"/5.0 · "}
          <span style={{ color: "var(--v4-ink-100)" }}>{firing}</span>
          {"/5 FIRING"}
        </span>
      </div>

      <div className="p-4">
        {/* Scoring rubric — collapsed by default. */}
        <div className="mb-3">
          <RubricPopover summary="How is this scored?">
            <dl
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5"
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 11,
              }}
            >
              <dt
                style={{
                  color: "var(--v4-ink-400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                5.0
              </dt>
              <dd style={{ color: "var(--v4-ink-200)" }}>
                strong signal across &ge;4 of 5 channels
              </dd>
              <dt
                style={{
                  color: "var(--v4-ink-400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                4.0
              </dt>
              <dd style={{ color: "var(--v4-ink-200)" }}>
                strong signal across &ge;3 of 5 channels
              </dd>
              <dt
                style={{
                  color: "var(--v4-ink-400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                3.0
              </dt>
              <dd style={{ color: "var(--v4-ink-200)" }}>
                strong signal across &ge;2 of 5 channels
              </dd>
              <dt
                style={{
                  color: "var(--v4-ink-400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                2.0+
              </dt>
              <dd style={{ color: "var(--v4-ink-200)" }}>
                active on at least 1 channel
              </dd>
              <dt
                style={{
                  color: "var(--v4-ink-400)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                &lt;1.0
              </dt>
              <dd style={{ color: "var(--v4-ink-200)" }}>
                low or no cross-channel activity
              </dd>
            </dl>
            <p
              className="mt-2 leading-snug"
              style={{ fontSize: 10, color: "var(--v4-ink-400)" }}
            >
              Each channel contributes 0-1. Per-channel tiers: GitHub (breakout
              1.0 / hot 0.7 / rising 0.4), HN (front-page 1.0 / &ge;3 mentions
              0.7 / 1-2 mentions 0.4), Bluesky (&ge;5 mentions 1.0 / 2-4 0.7 /
              1 0.4), dev.to (&ge;3 articles 1.0 / 2 0.7 / 1 0.4), Reddit
              (corpus-normalized 48h velocity).
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
                <span
                  className="truncate"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11,
                    color: "var(--v4-ink-200)",
                  }}
                >
                  {row.label}
                </span>
              </div>

              {/* Bar */}
              <div
                className="relative h-2 rounded-full overflow-hidden"
                style={{ background: "var(--v4-bg-100)" }}
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
              <span
                className="tabular-nums text-right"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 11,
                  color: "var(--v4-ink-300)",
                }}
              >
                {row.value.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>

        <p
          className="mt-3 leading-snug"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            color: "var(--v4-ink-400)",
          }}
        >
          <span>*</span> Reddit bar shows a per-repo velocity proxy (raw score
          / 100); the score formula uses the corpus-normalized version so a
          single repo&apos;s bar may not match its contribution to the
          corpus-wide ranking.
        </p>
      </div>
    </section>
  );
}

export default CrossSignalBreakdown;
