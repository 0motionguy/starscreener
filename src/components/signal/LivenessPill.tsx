// Compact liveness pill for MCP rows. 4-state classifier:
//
//   - `live`     → uptime7d >= 0.95
//   - `degraded` → 0.5 <= uptime7d < 0.95
//   - `offline`  → uptime7d < 0.5
//   - `unknown`  → no manifest pings yet OR isStdio === true (stdio servers
//                  can't be HTTP-pinged, so liveness is intentionally
//                  unknown — pill renders as "stdio")
//
// CRITICAL: offline ≠ removed. Offline MCPs stay listed with the pill so an
// operator can see what was once live and decide whether to delist
// manually. No silent filtering.
//
// The shape mirrors SignalBadge so it slots in next to existing pills.

import type { LivenessInfo } from "@/lib/ecosystem-leaderboards";

export type LivenessState = "live" | "degraded" | "offline" | "unknown";

export interface LivenessClassification {
  state: LivenessState;
  /** True when the unknown state is because the server is stdio (no probe). */
  isStdio: boolean;
  uptime7d: number | null;
}

/**
 * Pure classifier — pages reuse it for filtering ("Liveness Champions"
 * tab) and tooltip text without re-deriving the same branches.
 */
export function classifyLiveness(liveness?: LivenessInfo): LivenessClassification {
  if (!liveness) {
    return { state: "unknown", isStdio: false, uptime7d: null };
  }
  if (liveness.isStdio) {
    return { state: "unknown", isStdio: true, uptime7d: null };
  }
  const uptime = typeof liveness.uptime7d === "number" ? liveness.uptime7d : null;
  if (uptime === null) {
    return { state: "unknown", isStdio: false, uptime7d: null };
  }
  if (uptime >= 0.95) return { state: "live", isStdio: false, uptime7d: uptime };
  if (uptime >= 0.5) return { state: "degraded", isStdio: false, uptime7d: uptime };
  return { state: "offline", isStdio: false, uptime7d: uptime };
}

interface LivenessPillProps {
  liveness?: LivenessInfo;
}

export function LivenessPill({ liveness }: LivenessPillProps) {
  const c = classifyLiveness(liveness);
  let label: string;
  let cls: string;
  let title: string;

  switch (c.state) {
    case "live":
      label = "LIVE";
      cls = "border-up/60 bg-up/10 text-up";
      title = `Live - uptime 7d: ${((c.uptime7d ?? 0) * 100).toFixed(1)}%`;
      break;
    case "degraded":
      label = "DEGRADED";
      cls = "border-warning/60 bg-warning/10 text-warning";
      title = `Degraded - uptime 7d: ${((c.uptime7d ?? 0) * 100).toFixed(1)}%`;
      break;
    case "offline":
      label = "OFFLINE";
      cls = "border-down/60 bg-down/10 text-down";
      title = `Offline - uptime 7d: ${((c.uptime7d ?? 0) * 100).toFixed(1)}%`;
      break;
    case "unknown":
    default:
      if (c.isStdio) {
        label = "STDIO";
        cls = "border-functional/60 bg-functional/10 text-functional";
        title = "stdio transport - no HTTP liveness probe";
      } else {
        label = "?";
        cls = "border-border-primary bg-bg-muted text-text-tertiary";
        title = "Liveness pending - no manifest pings yet";
      }
      break;
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
