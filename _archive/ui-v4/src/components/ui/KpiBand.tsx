// V4 — KpiBand
//
// The horizontal cell strip that appears at the top of every flagship page.
// Mockup-canonical shape (signals.html § KPI strip · 6 cells):
//
//   ┌──────────────┬──────────────┬──────────────┬──────────────┐
//   │ LABEL CAPS   │ LABEL CAPS   │ LABEL CAPS   │ LABEL CAPS   │
//   │ 42,184 +18%  │ 8 / 8 ●live  │ #claude-skil │ 87.4    ▲12  │
//   │ vs prev 24h  │ all healthy  │ +312% · 6.4K │ heat · realt │
//   └──────────────┴──────────────┴──────────────┴──────────────┘
//
// `cells` is an array; each cell is independently typed. Tones tint the
// big number (default → ink-000, money/amber/acc/red).
//
// Pip color (small 5×5 square left of label) is decorative — pass any
// CSS color value (e.g. "var(--v4-acc)" or "#22c55e"). Omit pip = no pip.
//
// Usage:
//   <KpiBand cells={[
//     { label: "Signal volume · 24h", value: "42,184", delta: "+18.2%",
//       sub: "vs prev 24h" },
//     { label: "Sources · live", value: "8 / 8",
//       sub: <LiveDot label="all healthy" /> },
//     { label: "Top tag", value: "#claude-skills", tone: "acc",
//       sub: <span style={{ color: "var(--v4-money)" }}>+312% · 6,401</span> },
//     { label: "Data freshness", value: "1m 12s", tone: "money",
//       sub: "→ realtime", pip: "var(--v4-acc)" },
//   ]} />

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type KpiTone = "default" | "money" | "amber" | "acc" | "red";

export interface KpiCell {
  label: ReactNode;
  value: ReactNode;
  /** Optional inline delta rendered to the right of the big value (e.g. "+18%"). */
  delta?: ReactNode;
  /** Caps subtitle below the value (max ~32 chars). Accepts a node for inline LiveDot etc. */
  sub?: ReactNode;
  /** Tints the big value. Default = ink-000. */
  tone?: KpiTone;
  /** 5×5 colored pip rendered left of the label. CSS color value. */
  pip?: string;
}

export interface KpiBandProps {
  cells: KpiCell[];
  className?: string;
}

export function KpiBand({ cells, className }: KpiBandProps) {
  return (
    <div className={cn("v4-kpi-band", className)} role="group" aria-label="KPIs">
      {cells.map((c, i) => (
        <div
          key={i}
          className={cn("v4-kpi-cell", c.tone && `v4-kpi-cell--${c.tone}`)}
        >
          <div className="v4-kpi-cell__label">
            {c.pip ? (
              <span
                className="v4-kpi-cell__pip"
                style={{ background: c.pip }}
                aria-hidden="true"
              />
            ) : null}
            {c.label}
          </div>
          <div className="v4-kpi-cell__row">
            <span className="v4-kpi-cell__value">{c.value}</span>
            {c.delta !== undefined ? (
              <span className="v4-kpi-cell__delta">{c.delta}</span>
            ) : null}
          </div>
          {c.sub !== undefined ? (
            <div className="v4-kpi-cell__sub">{c.sub}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
