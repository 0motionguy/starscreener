// SketchArt — xkcd-style hand-drawn star-history chart.
//
// Rendered as a custom SVG (not ECharts) because ECharts has no native rough-
// line support. The wobble is a single feTurbulence + feDisplacementMap
// filter applied to the path strokes — cheap, scalable, and visually
// indistinguishable from a hand-drawn marker line at chart sizes.
//
// Shares geometry with the rest of the page via the ChartGeometry type so
// the math (cumulative line + tick positions + peak marker) stays consistent
// across themes. Geometry is built once in page.tsx, passed in.

import type { ChartGeometry } from "./geometry";

interface SketchArtProps {
  geom: ChartGeometry;
  repoFullName: string;
  /** Filter seed — keep stable per chart so the wobble doesn't shimmer
   * across re-renders of the same data. Defaults to a deterministic hash of
   * the repo name so two renders of the same repo overlay perfectly. */
  seed?: number;
  /** SVG viewBox geometry must match the geometry builder's coordinate space. */
  viewBox?: { w: number; h: number; padLeft: number; padBottom: number };
}

const DEFAULT_VIEWBOX = { w: 1000, h: 340, padLeft: 56, padBottom: 32 };

function seedFromName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i += 1) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return (h % 9999) + 1;
}

export function SketchArt({
  geom,
  repoFullName,
  seed,
  viewBox = DEFAULT_VIEWBOX,
}: SketchArtProps) {
  const actualSeed = seed ?? seedFromName(repoFullName);
  // Filter IDs must be unique per instance so multiple SketchArts on the same
  // page (e.g. ThemeLab tile + main chart) don't collide.
  const uid = `sk-${actualSeed}`;

  const baselineY = viewBox.h - viewBox.padBottom;

  return (
    <svg
      viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${repoFullName} star history (sketch)`}
      style={{ display: "block", width: "100%", height: "auto", background: "#FCFBF7" }}
    >
      <defs>
        {/* Rough-line filter — turbulence + small displacement gives the
         * authentic xkcd marker wobble. baseFrequency tuning: too high looks
         * static-y, too low looks smooth. 0.012 hits the sweet spot at chart
         * scale. */}
        <filter id={`${uid}-rough`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves="2"
            seed={actualSeed}
          />
          <feDisplacementMap in="SourceGraphic" scale="3.2" />
        </filter>
        {/* Slightly coarser wobble for axis lines so they read as separate strokes. */}
        <filter id={`${uid}-rough-axis`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018"
            numOctaves="2"
            seed={actualSeed + 7}
          />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
      </defs>

      {/* Grid lines — subtle, dashed, wobbled */}
      <g filter={`url(#${uid}-rough-axis)`} stroke="#D8D2C5" strokeWidth="1" fill="none">
        {geom.yTicks.map((t, i) => (
          <line
            key={`yg-${i}`}
            x1={viewBox.padLeft}
            x2={viewBox.w - 22}
            y1={t.y}
            y2={t.y}
            strokeDasharray="3 5"
          />
        ))}
      </g>

      {/* Axis lines — hand-drawn horizontal + vertical */}
      <g filter={`url(#${uid}-rough-axis)`} stroke="#0A0A09" strokeWidth="2" strokeLinecap="round" fill="none">
        <line x1={viewBox.padLeft} y1={18} x2={viewBox.padLeft} y2={baselineY} />
        <line x1={viewBox.padLeft} y1={baselineY} x2={viewBox.w - 22} y2={baselineY} />
      </g>

      {/* Star history line — the headline stroke, rough-filtered */}
      <path
        d={geom.linePath}
        filter={`url(#${uid}-rough)`}
        fill="none"
        stroke="#EA4A1F"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last-value dot, also wobbled so it sits visually with the line */}
      {geom.lastDot ? (
        <g filter={`url(#${uid}-rough)`}>
          <circle
            cx={geom.lastDot.x.toFixed(2)}
            cy={geom.lastDot.y.toFixed(2)}
            r="6"
            fill="#EA4A1F"
            stroke="#0A0A09"
            strokeWidth="2"
          />
        </g>
      ) : null}

      {/* Y-axis labels — marker handwriting feel via Comic-style fallback chain */}
      <g
        fill="#0A0A09"
        style={{
          fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'Patrick Hand', cursive",
          fontSize: "12px",
        }}
      >
        {geom.yTicks.map((t, i) => (
          <text
            key={`yl-${i}`}
            x={viewBox.padLeft - 8}
            y={t.y + 4}
            textAnchor="end"
          >
            {t.label}
          </text>
        ))}
      </g>

      {/* X-axis labels */}
      <g
        fill="#0A0A09"
        style={{
          fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'Patrick Hand', cursive",
          fontSize: "12px",
        }}
      >
        {geom.xTicks.map((t, i) => (
          <text
            key={`xl-${i}`}
            x={t.x}
            y={baselineY + 18}
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}
      </g>

      {/* Repo title is now rendered by the chart-card header above this SVG
       *  so we deliberately don't draw a duplicate Comic-Sans caption here.
       *  The ThemeLab tile (where there's no card header) still gets its own
       *  caption — that variant keeps the SVG-internal label via its own
       *  conditional in ThemeLab.tsx. */}
    </svg>
  );
}
