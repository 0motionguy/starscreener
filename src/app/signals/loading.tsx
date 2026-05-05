// /signals — V4 unified-signals route-level skeleton.
//
// Rendered while the page server component resolves its first byte.
// Mirrors the real page layout so CLS stays near zero: PageHead band,
// filter bar, KPI strip, two cross-source widget rows, two 4-up panel
// grids, and the heatmap strip. Per-panel fallbacks are handled by
// inline Suspense boundaries in page.tsx; this is purely the cold-route
// shell.

import "./signals.css";

const placeholder = "var(--v3-bg-050)";
const placeholderStrong = "var(--v3-bg-100)";

function Block({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{ background: placeholder, borderRadius: 2, ...style }}
    />
  );
}

function PanelShell() {
  return (
    <div
      aria-hidden
      className="signals-panel"
      style={{
        border: "1px solid var(--color-border-subtle)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 28,
          borderBottom: "1px solid var(--color-border-subtle)",
          background: placeholderStrong,
        }}
      />
      <div style={{ padding: 10 }} className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} style={{ height: 22 }} />
        ))}
      </div>
      <div
        style={{
          height: 22,
          borderTop: "1px solid var(--color-border-subtle)",
          background: placeholder,
        }}
      />
    </div>
  );
}

export default function SignalsLoading() {
  return (
    <main className="signals-page" style={{ padding: "14px 16px 60px" }}>
      <div className="animate-pulse">
        {/* PageHead band */}
        <div className="space-y-2" style={{ marginBottom: 14 }}>
          <Block style={{ height: 12, width: 220 }} />
          <Block style={{ height: 28, width: 420, background: placeholderStrong }} />
          <Block style={{ height: 12, width: 560 }} />
        </div>

        {/* Filter bar */}
        <Block style={{ height: 40, marginBottom: 10 }} />

        {/* KPI strip */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Block key={i} style={{ height: 56 }} />
          ))}
        </div>

        {/* Row 1: Volume chart (col-7) + Consensus radar (col-5) */}
        <div className="grid" style={{ marginBottom: 10 }}>
          <div className="col-7">
            <Block style={{ height: 220 }} />
          </div>
          <div className="col-5">
            <Block style={{ height: 220 }} />
          </div>
        </div>

        {/* Row 2: Primary feeds — 4 panels */}
        <Block style={{ height: 18, width: 240, marginTop: 12, marginBottom: 8 }} />
        <div className="grid" style={{ marginBottom: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="col-3">
              <PanelShell />
            </div>
          ))}
        </div>

        {/* Row 3: Secondary feeds — 4 panels */}
        <Block style={{ height: 18, width: 240, marginTop: 12, marginBottom: 8 }} />
        <div className="grid" style={{ marginBottom: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="col-3">
              <PanelShell />
            </div>
          ))}
        </div>

        {/* Tag momentum heatmap */}
        <Block style={{ height: 18, width: 280, marginTop: 12, marginBottom: 8 }} />
        <Block style={{ height: 160, marginBottom: 10 }} />
      </div>
    </main>
  );
}
