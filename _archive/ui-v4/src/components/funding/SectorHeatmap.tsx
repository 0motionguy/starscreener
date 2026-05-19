// V4 — SectorHeatmap
//
// Sector × stage matrix used in funding.html § 03 "Sector heatmap · capital
// × stage". 7 rows (sectors) × 6 columns (stages). Each cell shows the $
// raised in that bucket, tinted by intensity (low → bg-100, high → acc).
//
// The mockup-canonical layout is a CSS grid with:
//   - 130px sector label column
//   - 6 equal stage columns
//   - 80px sector total column on the right
//
// Pure presentation — caller computes the values and pip colors.
//
// Usage:
//   <SectorHeatmap
//     stages={["SEED","SERIES A","SERIES B","SERIES C","SERIES D+","GROWTH"]}
//     sectors={[
//       { key: "agents", label: "AI · agents", pip: "var(--v4-violet)",
//         values: [120, 480, 920, 2400, 3800, 2200], total: "$10.1B" },
//       ...
//     ]}
//   />

import { cn } from "@/lib/utils";

export interface SectorRow {
  key: string;
  label: string;
  pip: string;
  values: number[];
  total: string;
}

export interface SectorHeatmapProps {
  stages: string[];
  sectors: SectorRow[];
  className?: string;
}

export function SectorHeatmap({ stages, sectors, className }: SectorHeatmapProps) {
  const max = Math.max(
    1,
    ...sectors.flatMap((s) => s.values),
  );

  return (
    <div className={cn("v4-sector-heatmap", className)} role="table">
      <div className="v4-sector-heatmap__row v4-sector-heatmap__row--head" role="row">
        <div className="v4-sector-heatmap__label-head" role="columnheader">
          SECTOR ↓ · STAGE →
        </div>
        {stages.map((s) => (
          <div className="v4-sector-heatmap__col-head" key={s} role="columnheader">
            {s}
          </div>
        ))}
        <div className="v4-sector-heatmap__total-head" role="columnheader">
          TOTAL
        </div>
      </div>
      {sectors.map((row) => (
        <div className="v4-sector-heatmap__row" key={row.key} role="row">
          <div className="v4-sector-heatmap__label" role="rowheader">
            <span
              className="v4-sector-heatmap__pip"
              style={{ background: row.pip }}
              aria-hidden="true"
            />
            {row.label}
          </div>
          {row.values.map((v, i) => {
            const op = 0.20 + (v / max) * 0.78;
            const fmt =
              v >= 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v}M`;
            return (
              <div
                key={i}
                className="v4-sector-heatmap__cell"
                role="cell"
                title={`${row.label} · ${stages[i]} · ${fmt}`}
                style={{
                  background: `rgba(255,107,53,${op.toFixed(2)})`,
                  borderColor: `rgba(255,107,53,${(op * 0.6).toFixed(2)})`,
                }}
              >
                <span className="v4-sector-heatmap__cell-v">{fmt}</span>
              </div>
            );
          })}
          <div className="v4-sector-heatmap__total" role="cell">
            {row.total}
            <span className="v4-sector-heatmap__total-lbl">SECTOR</span>
          </div>
        </div>
      ))}
    </div>
  );
}
