// StarHistoryChart — server-rendered inline SVG with a 12-month star
// history line, smooth gradient fill, and event markers overlaid as
// vertical guides + label chips.
//
// Generates the path d-string deterministically from the input series so
// SSR + hydration agree. No client JS dependency — purely an SVG snapshot.

import type { Repo } from "@/lib/types";
import type { StarActivityPayload } from "@/lib/star-activity";

interface ChartEvent {
  /** 0..1 along x axis (left edge → right edge of plot area). */
  x: number;
  /** 0..1 from top of plot area. */
  y: number;
  label: string;
  color: string;
}

interface StarHistoryChartProps {
  repo: Repo;
  starActivity?: StarActivityPayload | null;
  events?: ChartEvent[];
}

const VIEW_W = 1000;
const VIEW_H = 280;
const PLOT = { x: 40, y: 20, w: 920, h: 220 };

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  }
  // Catmull-Rom -> cubic Bezier
  const ctrl = 0.18;
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * ctrl;
    const c1y = p1.y + (p2.y - p0.y) * ctrl;
    const c2x = p2.x - (p3.x - p1.x) * ctrl;
    const c2y = p2.y - (p3.y - p1.y) * ctrl;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function projectSeries(series: number[]): {
  line: { x: number; y: number }[];
  min: number;
  max: number;
} {
  if (series.length === 0) {
    return { line: [], min: 0, max: 0 };
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const line = series.map((v, i) => {
    const x =
      series.length === 1
        ? PLOT.x + PLOT.w / 2
        : PLOT.x + (PLOT.w * i) / (series.length - 1);
    const y = PLOT.y + PLOT.h - ((v - min) / range) * PLOT.h;
    return { x, y };
  });
  return { line, min, max };
}

function formatStarLabel(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString();
}

export function StarHistoryChart({
  repo,
  starActivity,
  events = [],
}: StarHistoryChartProps) {
  // Build a numeric series — prefer 12mo star-activity, fall back to
  // sparklineData if star-activity is missing or insufficient.
  const series = (() => {
    if (starActivity?.points && starActivity.points.length > 1) {
      // Sample down to ~52 points so the SVG stays light.
      const pts = starActivity.points.map((p) => p.s);
      if (pts.length <= 60) return pts;
      const step = Math.ceil(pts.length / 60);
      return pts.filter((_, i) => i % step === 0);
    }
    return repo.sparklineData ?? [];
  })();

  const { line, min, max } = projectSeries(series);
  const linePath = smoothPath(line);
  const areaPath =
    line.length > 0
      ? `${linePath} L${line[line.length - 1].x.toFixed(2)},${PLOT.y + PLOT.h} L${line[0].x.toFixed(2)},${PLOT.y + PLOT.h} Z`
      : "";

  const yLabels = (() => {
    const range = max - min || 1;
    return [0.25, 0.5, 0.75].map((t) => ({
      y: PLOT.y + PLOT.h - t * PLOT.h,
      label: formatStarLabel(Math.round(min + t * range)),
    }));
  })();

  const finalDot = line.length > 0 ? line[line.length - 1] : null;

  return (
    <div className="hero-chart-wrap">
      <div className="hero-chart-head">
        <h2 className="hero-chart-title">
          ▌ <b>Star history</b> · 12 months · annotated with release + mention events
        </h2>
        <div className="grow" />
        <div className="legend-row">
          <span className="lg">
            <span
              className="lg-sw"
              style={{ background: "var(--accent)" }}
            />{" "}
            Stars
          </span>
          <span className="lg">
            <span
              className="lg-sw"
              style={{
                background: "var(--info)",
                height: 8,
                width: 8,
                borderRadius: "50%",
              }}
            />{" "}
            Events
          </span>
        </div>
      </div>
      <div className="hero-chart-body">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block", width: "100%" }}
          aria-label={`${repo.fullName} star history`}
        >
          <defs>
            <linearGradient id="starGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--accent)"
                stopOpacity="0.45"
              />
              <stop
                offset="60%"
                stopColor="var(--accent)"
                stopOpacity="0.10"
              />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g className="hero-chart-grid">
            {yLabels.map((g) => (
              <line
                key={`grid-${g.y}`}
                x1={PLOT.x}
                x2={PLOT.x + PLOT.w}
                y1={g.y}
                y2={g.y}
              />
            ))}
          </g>

          <g className="hero-chart-axis">
            {yLabels.map((g) => (
              <text
                key={`yl-${g.y}`}
                x={PLOT.x - 5}
                y={g.y + 4}
                textAnchor="end"
              >
                {g.label}
              </text>
            ))}
          </g>

          {areaPath ? <path d={areaPath} fill="url(#starGrad)" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {events.map((e, i) => {
            const cx = PLOT.x + e.x * PLOT.w;
            const cy = PLOT.y + e.y * PLOT.h;
            return (
              <g
                key={`ev-${i}-${e.label}`}
                transform={`translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`}
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={(PLOT.y + PLOT.h - cy).toFixed(2)}
                  stroke={e.color}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.7"
                />
                <circle
                  cx="0"
                  cy="0"
                  r="5"
                  fill="var(--surface)"
                  stroke={e.color}
                  strokeWidth="2"
                />
                <circle cx="0" cy="0" r="2" fill={e.color} />
                <g transform="translate(8, -8)">
                  <rect
                    x="-2"
                    y="-12"
                    width={Math.max(40, e.label.length * 6 + 8)}
                    height="16"
                    fill="var(--surface-2)"
                    stroke="var(--border-subtle)"
                    rx="1"
                  />
                  <text
                    x="2"
                    y="-1"
                    fontFamily="var(--font-mono)"
                    fontSize="9"
                    fill={e.color}
                  >
                    {e.label}
                  </text>
                </g>
              </g>
            );
          })}

          {finalDot ? (
            <>
              <circle
                cx={finalDot.x.toFixed(2)}
                cy={finalDot.y.toFixed(2)}
                r="4"
                fill="var(--accent)"
              />
              <circle
                cx={finalDot.x.toFixed(2)}
                cy={finalDot.y.toFixed(2)}
                r="8"
                fill="var(--accent)"
                opacity="0.25"
              />
            </>
          ) : null}
        </svg>
      </div>

      {events.length > 0 ? (
        <div className="hero-chart-foot">
          {events.slice(0, 4).map((e, i) => (
            <div key={`evcard-${i}-${e.label}`} className="event-card">
              <div
                className="event-mark"
                style={{
                  background: e.color,
                  color: "var(--surface)",
                }}
              >
                ▲
              </div>
              <div>
                <div className="event-title">{e.label}</div>
                <div className="event-meta">
                  event marker · {Math.round(e.x * 12)}mo
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type { ChartEvent };
