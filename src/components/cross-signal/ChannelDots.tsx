"use client";

// ChannelDots — five small inline dots representing GitHub / Reddit / HN /
// Bluesky / dev.to channel state. Filled = component > 0; outlined = inactive.
//
// PREVIOUSLY this component imported getChannelStatus from
// @/lib/pipeline/cross-signal, which transitively pulled every per-source
// mention JSON (reddit + HN + bsky + devto = MB of data) into the CLIENT
// bundle. Sprint 1 audit flagged that as finding #3. Now the component
// accepts a precomputed `status` prop (or reads it from `repo.channelStatus`
// attached server-side by attachCrossSignal). No server-only imports;
// bundle stays thin.
//
// Self-contained type so surfaces that pass only a {fullName, channelStatus}
// subset (sidebar watchlist row etc.) keep working without constructing
// a full Repo.

interface ChannelStatus {
  github: boolean;
  reddit: boolean;
  hn: boolean;
  bluesky: boolean;
  devto: boolean;
}

interface ChannelDotsProps {
  /**
   * Source of truth for per-channel state. Three accepted shapes:
   *   - a Repo-like object carrying `channelStatus` on itself
   *   - a Repo without `channelStatus` yet (renders all-off, or null when
   *     hideWhenEmpty=true)
   *   - an explicit `status` prop (precomputed elsewhere)
   */
  repo?: { channelStatus?: ChannelStatus };
  status?: ChannelStatus | null;
  /** Render `null` when no channel is firing. Default: false (show empty dots). */
  hideWhenEmpty?: boolean;
  size?: "sm" | "md";
}

const CHANNEL_COLORS = {
  github: "#22c55e",
  reddit: "#ff4500",
  hn: "#ff6600",
  bluesky: "#0085FF",
  devto: "#0a0a0a",
};

function buildTooltip(status: ChannelStatus, firing: number): string {
  const parts = [
    `GitHub: ${status.github ? "active" : "—"}`,
    `Reddit: ${status.reddit ? "active" : "—"}`,
    `HN: ${status.hn ? "active" : "—"}`,
    `Bluesky: ${status.bluesky ? "active" : "—"}`,
    `dev.to: ${status.devto ? "active" : "—"}`,
  ];
  return `${firing}/5 channels firing\n${parts.join(" · ")}`;
}

const ZERO_STATUS: ChannelStatus = {
  github: false,
  reddit: false,
  hn: false,
  bluesky: false,
  devto: false,
};

function resolveStatus(props: ChannelDotsProps): ChannelStatus {
  if (props.status) return props.status;
  if (props.repo?.channelStatus) return props.repo.channelStatus;
  return ZERO_STATUS;
}

export function ChannelDots(props: ChannelDotsProps) {
  const { hideWhenEmpty = false, size = "sm" } = props;
  const status = resolveStatus(props);
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
