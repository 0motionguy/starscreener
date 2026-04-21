"use client";

// Small inline ProductHunt badge for repo rows. Same self-contained shape
// as HnBadge/BskyBadge so surfaces can import without forcing the loader
// into their bundle when the badge is hidden. Sparse by design — only
// rendered when the repo has a linked PH launch in the last 7 days.

type PhLaunchForBadge = {
  id: string;
  name: string;
  votesCount: number;
  daysSinceLaunch: number;
  url: string;
};

interface PhBadgeProps {
  launch: PhLaunchForBadge | null;
  size?: "sm" | "md";
}

// ProductHunt brand orange. Matches the 'P' in their masthead so the
// monogram reads as ProductHunt at small sizes.
const PH_ORANGE = "#DA552F";

function formatAge(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function buildTooltip(l: PhLaunchForBadge): string {
  return `Launched on ProductHunt · ${l.votesCount} vote${l.votesCount === 1 ? "" : "s"} · ${formatAge(l.daysSinceLaunch)} · "${l.name}"`;
}

export function PhBadge({ launch, size = "sm" }: PhBadgeProps) {
  if (!launch) return null;

  const sizeClasses = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5";
  // Subtle fill tier mirrors HnBadge's everHitFrontPage — PH launches with
  // ≥200 votes get a soft wash so the row pops on scroll.
  const isHighSignal = launch.votesCount >= 200;
  const fillBg = isHighSignal ? `${PH_ORANGE}1A` : "transparent";

  // <button> not <a> — these badges live inside parent <Link> rows.
  // Nested <a> is invalid HTML and breaks Next hydration.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(launch.url, "_blank", "noopener,noreferrer");
      }}
      title={buildTooltip(launch)}
      aria-label={`Launched on ProductHunt — ${launch.votesCount} votes, ${formatAge(launch.daysSinceLaunch)}`}
      className={`inline-flex items-center gap-1 rounded-md font-mono text-[10px] border transition-colors cursor-pointer ${sizeClasses}`}
      style={{
        color: PH_ORANGE,
        borderColor: `${PH_ORANGE}4D`,
        backgroundColor: fillBg,
      }}
    >
      <span
        className="text-white text-[8px] font-bold w-3 h-3 leading-none rounded-sm flex items-center justify-center"
        style={{ backgroundColor: PH_ORANGE }}
        aria-hidden
      >
        P
      </span>
      <span aria-hidden>▲</span>
      {launch.votesCount}
    </button>
  );
}

export default PhBadge;
