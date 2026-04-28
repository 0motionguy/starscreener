// Compact liveness pill for MCP rows. Shape mirrors SignalBadge so it can
// sit alongside the existing pills without restyling.
//
// State logic (Chunk F MVP):
//   - liveness === undefined        → gray "?" pill, "pending" tooltip
//   - liveness.isStdio === true     → blue "stdio" pill (inferred from
//                                     commit velocity, no HTTP probe)
//   - liveness.uptime7d >= 0.95     → green "A↑" pill
//   - liveness.uptime7d >= 0.5      → amber "B" pill
//   - liveness.uptime7d <  0.5      → red   "↓" pill
//
// The MCP-ping job from Chunk C populates `uptime7d`; until then every MCP
// item lands at the "pending" branch. UI is ready for the data swap.

import type { LivenessInfo } from "@/lib/ecosystem-leaderboards";

interface LivenessPillProps {
  liveness?: LivenessInfo;
}

export function LivenessPill({ liveness }: LivenessPillProps) {
  let label: string;
  let cls: string;
  let title: string;

  if (liveness === undefined) {
    label = "?";
    cls = "border-border-primary bg-bg-muted text-text-tertiary";
    title = "Liveness check pending (Chunk C)";
  } else if (liveness.isStdio) {
    label = "stdio";
    cls = "border-functional/60 bg-functional/10 text-functional";
    title = "stdio transport — liveness inferred from commit velocity";
  } else if (typeof liveness.uptime7d === "number" && liveness.uptime7d >= 0.95) {
    label = "A↑";
    cls = "border-up/60 bg-up/10 text-up";
    title = `Uptime 7d: ${(liveness.uptime7d * 100).toFixed(1)}%`;
  } else if (typeof liveness.uptime7d === "number" && liveness.uptime7d >= 0.5) {
    label = "B";
    cls = "border-warning/60 bg-warning/10 text-warning";
    title = `Uptime 7d: ${(liveness.uptime7d * 100).toFixed(1)}%`;
  } else if (typeof liveness.uptime7d === "number") {
    label = "↓";
    cls = "border-down/60 bg-down/10 text-down";
    title = `Uptime 7d: ${(liveness.uptime7d * 100).toFixed(1)}%`;
  } else {
    label = "?";
    cls = "border-border-primary bg-bg-muted text-text-tertiary";
    title = "Liveness check pending (Chunk C)";
  }

  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${cls}`}
      title={title}
    >
      {label}
    </span>
  );
}

export default LivenessPill;
