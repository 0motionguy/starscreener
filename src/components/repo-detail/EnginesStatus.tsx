// AGN-777 — [AISO-GAP-16] Engines status indicator
//
// Tiny visual showing health of each AI citation engine probe (ChatGPT,
// Claude, Perplexity, Gemini). Renders four pills with a colored dot
// each:
//   green  — engine probed and at least one prompt returned a usable result
//   amber  — engine probed but every prompt came back empty / un-cited
//            (probe is up, but no signal)
//   red    — engine was not probed at all in this scan (probe is down)
//
// Source data: the `promptTests[]` array on a completed AisoToolsScan
// already groups results by engine. We don't need a separate
// /api/health/engines route — the per-scan promptTests carry the same
// signal that AGN-777 asks us to surface, and the indicator only renders
// alongside the scan it describes (mounted inside ProjectSurfaceMap).
//
// Pure helpers (`computeEngineStatuses`, `dotColor`) live below the
// component so they can be unit-tested without rendering.

import type { JSX } from "react";

import type { AisoToolsScan } from "@/lib/aiso-tools";

export type EngineHealth = "up" | "degraded" | "down";

export interface EngineStatusEntry {
  engine: string;
  health: EngineHealth;
  total: number;
  cited: number;
}

const ENGINE_LABELS: ReadonlyArray<string> = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
];

export function computeEngineStatuses(
  promptTests: AisoToolsScan["promptTests"],
): EngineStatusEntry[] {
  return ENGINE_LABELS.map((engine) => {
    const rows = promptTests.filter((test) =>
      test.engine.toLowerCase().includes(engine.toLowerCase()),
    );
    const cited = rows.filter((test) => test.cited).length;
    const mentioned = rows.filter((test) => test.brandMentioned).length;
    const total = rows.length;
    let health: EngineHealth;
    if (total === 0) {
      // Probe never ran — treat as down so the user sees the gap.
      health = "down";
    } else if (cited === 0 && mentioned === 0) {
      // Probe ran but every result was empty/uncited — degraded signal.
      health = "degraded";
    } else {
      health = "up";
    }
    return { engine, health, total, cited };
  });
}

export function dotColor(health: EngineHealth): string {
  if (health === "up") return "var(--v3-sig-green)";
  if (health === "degraded") return "var(--v3-sig-amber)";
  return "var(--v3-sig-red)";
}

interface EnginesStatusProps {
  promptTests: AisoToolsScan["promptTests"];
}

export function EnginesStatus({
  promptTests,
}: EnginesStatusProps): JSX.Element | null {
  const statuses = computeEngineStatuses(promptTests);
  const anyDegraded = statuses.some((s) => s.health !== "up");

  return (
    <div
      role="group"
      aria-label="AI engine probe status"
      className="rounded-[2px] p-2.5"
      style={{
        background: "var(--v3-bg-050)",
        border: "1px solid var(--v3-line-100)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: "var(--v3-ink-400)" }}
        >
          Engine probes
        </p>
        {anyDegraded && (
          <p
            className="font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ color: "var(--v3-sig-amber)" }}
          >
            degraded
          </p>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {statuses.map((status) => (
          <li
            key={status.engine}
            className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{
              background: "var(--v3-bg-025)",
              border: "1px solid var(--v3-line-100)",
              color: "var(--v3-ink-200)",
            }}
            title={`${status.engine}: ${status.health} (${status.cited}/${status.total} cited)`}
          >
            <span
              aria-hidden
              className="block size-1.5 rounded-full"
              style={{ background: dotColor(status.health) }}
            />
            <span>{status.engine}</span>
            <span
              className="tabular-nums"
              style={{ color: "var(--v3-ink-400)" }}
            >
              {status.health === "down" ? "--" : `${status.cited}/${status.total}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default EnginesStatus;
