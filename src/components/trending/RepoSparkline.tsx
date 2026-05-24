// RepoSparkline — emits <div class="spark <variant>" data-points="...">
// shell.js auto-renders Catmull-Rom-smoothed SVG inside on mount + resize.
// Server component (no client JS); React simply emits the markup contract.

import type { Repo } from "@/lib/types";

interface RepoSparklineProps {
  data?: number[] | null;
  /** Sample from Repo.sparklineData when data not passed directly. */
  repo?: Pick<Repo, "sparklineData" | "starsDelta24h"> | null;
  variant?: "up" | "down" | "muted";
  className?: string;
}

export function RepoSparkline({ data, repo, variant, className }: RepoSparklineProps) {
  const points = data && data.length > 1 ? data : repo?.sparklineData ?? [];
  if (!points || points.length < 2) {
    // Render an empty placeholder so the column doesn't collapse.
    // suppressHydrationWarning because shell.js mutates the div on mount
    // (injects SVG + sets data-rendered) — that mutation is intentional and
    // owned by the imperative shell-script layer, not React.
    return (
      <div className="spark muted" data-points="" aria-hidden="true" suppressHydrationWarning />
    );
  }
  const v =
    variant ??
    (repo?.starsDelta24h !== undefined
      ? repo.starsDelta24h >= 0
        ? "up"
        : "down"
      : "up");
  const cls = `spark ${v}${className ? " " + className : ""}`;
  return (
    <div
      className={cls}
      data-points={points.join(",")}
      aria-hidden="true"
      suppressHydrationWarning
    />
  );
}
