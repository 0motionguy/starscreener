"use client";

// ChannelDots — six small inline dots representing GitHub / Reddit / HN /
// Bluesky / dev.to / Twitter channel state. Filled = component > 0;
// outlined = inactive.
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
  twitter: boolean;
}

type ChannelKey = keyof ChannelStatus;

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
  /**
   * Optional per-channel tooltip copy. When provided for a given channel,
   * each individual dot renders its own `title` so hover surfaces
   * channel-specific metrics (e.g. "Reddit: 12 mentions in 7d · scored
   * 0.8 / 1.0"). Keys not present fall back to the composite tooltip on
   * the outer wrapper.
   */
  tooltips?: Partial<Record<ChannelKey, string>>;
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
  twitter: "#1d9bf0",
};

function buildTooltip(status: ChannelStatus, firing: number): string {
  const parts = [
    `GitHub: ${status.github ? "active" : "—"}`,
    `Reddit: ${status.reddit ? "active" : "—"}`,
    `HN: ${status.hn ? "active" : "—"}`,
    `Bluesky: ${status.bluesky ? "active" : "—"}`,
    `dev.to: ${status.devto ? "active" : "—"}`,
    `X: ${status.twitter ? "active" : "—"}`,
  ];
  return `${firing}/6 channels firing\n${parts.join(" · ")}`;
}

const ZERO_STATUS: ChannelStatus = {
  github: false,
  reddit: false,
  hn: false,
  bluesky: false,
  devto: false,
  twitter: false,
};

function resolveStatus(props: ChannelDotsProps): ChannelStatus {
  if (props.status) return props.status;
  if (props.repo?.channelStatus) return props.repo.channelStatus;
  return ZERO_STATUS;
}

const CHANNEL_DEFAULT_LABEL: Record<ChannelKey, string> = {
  github: "GitHub",
  reddit: "Reddit",
  hn: "HackerNews",
  bluesky: "Bluesky",
  devto: "dev.to",
  twitter: "X",
};

export function ChannelDots(props: ChannelDotsProps) {
  const { hideWhenEmpty = false, size = "sm", tooltips } = props;
  const status = resolveStatus(props);
  const firing =
    (status.github ? 1 : 0) +
    (status.reddit ? 1 : 0) +
    (status.hn ? 1 : 0) +
    (status.bluesky ? 1 : 0) +
    (status.devto ? 1 : 0) +
    (status.twitter ? 1 : 0);
  if (firing === 0 && hideWhenEmpty) return null;

  const dotSize = size === "md" ? "w-2 h-2" : "w-1.5 h-1.5";
  const gap = size === "md" ? "gap-1" : "gap-0.5";

  const dot = (key: ChannelKey, active: boolean, color: string) => {
    const override = tooltips?.[key];
    const perDotTitle =
      override ??
      `${CHANNEL_DEFAULT_LABEL[key]}: ${active ? "active" : "not firing"}`;
    return (
      <span
        key={key}
        className={`${dotSize} rounded-full transition-colors`}
        title={perDotTitle}
        style={{
          backgroundColor: active ? color : "transparent",
          border: active
            ? `1px solid ${color}`
            : "1px solid var(--color-border-primary)",
        }}
      />
    );
  };

  return (
    <span
      className={`inline-flex items-center ${gap} shrink-0`}
      title={buildTooltip(status, firing)}
      aria-label={`${firing} of 6 cross-signal channels firing`}
    >
      {dot("github", status.github, CHANNEL_COLORS.github)}
      {dot("reddit", status.reddit, CHANNEL_COLORS.reddit)}
      {dot("hn", status.hn, CHANNEL_COLORS.hn)}
      {dot("bluesky", status.bluesky, CHANNEL_COLORS.bluesky)}
      {dot("devto", status.devto, CHANNEL_COLORS.devto)}
      {dot("twitter", status.twitter, CHANNEL_COLORS.twitter)}
    </span>
  );
}

export default ChannelDots;
