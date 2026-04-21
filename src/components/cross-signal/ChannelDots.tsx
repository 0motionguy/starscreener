"use client";

// ChannelDots — five small inline dots representing GitHub / Reddit / HN /
// Bluesky / dev.to channel state. Filled = component > 0; outlined = inactive.
//
// Self-contained type so this can render anywhere a Repo is in scope
// without forcing an import of src/lib/pipeline/cross-signal.ts (the
// channel status is already on the Repo via channelsFiring; the per-
// channel breakdown for tooltip text is computed lazily by the lib
// at the consumer's site).

import {
  getChannelStatus,
  type ChannelStatusTarget,
} from "@/lib/pipeline/cross-signal";

interface ChannelDotsProps {
  /** Full Repo or any object carrying `fullName` + `movementStatus`. */
  repo: ChannelStatusTarget;
  /** Render `null` when no channel is firing. Default: false (show empty dots). */
  hideWhenEmpty?: boolean;
  size?: "sm" | "md";
}

const CHANNEL_COLORS = {
  github: "#22c55e",  // green-500 — matches accent-green in repo cards
  reddit: "#ff4500",  // canonical Reddit orange
  hn: "#ff6600",      // canonical HN orange
  bluesky: "#0085FF", // Bluesky blue
  devto: "#0a0a0a",   // dev.to brand black
};

function buildTooltip(
  status: ReturnType<typeof getChannelStatus>,
  firing: number,
): string {
  const labels: string[] = [];
  labels.push(`GitHub: ${status.github ? "active" : "—"}`);
  labels.push(`Reddit: ${status.reddit ? "active" : "—"}`);
  labels.push(`HN: ${status.hn ? "active" : "—"}`);
  labels.push(`Bluesky: ${status.bluesky ? "active" : "—"}`);
  labels.push(`dev.to: ${status.devto ? "active" : "—"}`);
  return `${firing}/5 channels firing\n${labels.join(" · ")}`;
}

export function ChannelDots({
  repo,
  hideWhenEmpty = false,
  size = "sm",
}: ChannelDotsProps) {
  const status = getChannelStatus(repo);
  const firing =
    (status.github ? 1 : 0) +
    (status.reddit ? 1 : 0) +
    (status.hn ? 1 : 0) +
    (status.bluesky ? 1 : 0) +
    (status.devto ? 1 : 0);
  if (firing === 0 && hideWhenEmpty) return null;

  const dotSize = size === "md" ? "w-2 h-2" : "w-1.5 h-1.5";
  const gap = size === "md" ? "gap-1" : "gap-0.5";

  const dot = (active: boolean, color: string) => (
    <span
      className={`${dotSize} rounded-full transition-colors`}
      style={{
        backgroundColor: active ? color : "transparent",
        border: active
          ? `1px solid ${color}`
          : "1px solid var(--color-border-primary)",
      }}
    />
  );

  return (
    <span
      className={`inline-flex items-center ${gap} shrink-0`}
      title={buildTooltip(status, firing)}
      aria-label={`${firing} of 5 cross-signal channels firing`}
    >
      {dot(status.github, CHANNEL_COLORS.github)}
      {dot(status.reddit, CHANNEL_COLORS.reddit)}
      {dot(status.hn, CHANNEL_COLORS.hn)}
      {dot(status.bluesky, CHANNEL_COLORS.bluesky)}
      {dot(status.devto, CHANNEL_COLORS.devto)}
    </span>
  );
}

export default ChannelDots;
