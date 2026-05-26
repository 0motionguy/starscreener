// PvTools — 3-col mini tool tile grid. Pixel-faithful to index.html:559-565.
import { Icon } from "@/lib/icons";

export function PvTools() {
  return (
    <div
      className="scrn-preview pv-tools"
      style={{
        background: "linear-gradient(180deg, var(--surface), var(--bg))",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 6,
        padding: 14,
      }}
    >
      {/* Star history mini */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="36" height="22" viewBox="0 0 60 34" fill="none" aria-hidden="true">
          <path
            d="M2 30 L14 22 L26 24 L38 12 L50 6 L58 2"
            stroke="var(--accent)"
            strokeWidth="1.6"
          />
        </svg>
      </div>
      {/* Treemap mini */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: 4,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 2,
        }}
      >
        <div
          style={{ background: "var(--accent)", gridColumn: "1/3", gridRow: "1/3" }}
        />
        <div style={{ background: "var(--cyan)" }} />
        <div style={{ background: "var(--up)" }} />
      </div>
      {/* Bar chart mini */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: 6,
          display: "flex",
          gap: 3,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: 1, height: "40%", background: "var(--accent)", opacity: 0.5 }} />
        <div style={{ flex: 1, height: "70%", background: "var(--accent)" }} />
        <div style={{ flex: 1, height: "55%", background: "var(--accent)", opacity: 0.65 }} />
        <div style={{ flex: 1, height: "88%", background: "var(--accent)" }} />
      </div>
      {/* Tier list mini */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {[
          { tier: "var(--accent)" },
          { tier: "var(--cyan)" },
          { tier: "var(--up)" },
        ].map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 3 }}>
            <div style={{ width: 12, height: 7, background: row.tier, borderRadius: 1 }} />
            <div style={{ flex: 1, height: 7, background: "var(--surface-3)" }} />
          </div>
        ))}
      </div>
      {/* Watch counter */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: 6,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--accent)",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          <Icon name="star" size={8} />
          WATCH
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-bright)",
          }}
        >
          18
        </div>
      </div>
      {/* Compare counter */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: 6,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--cyan)",
          }}
        >
          ⇄ COMPARE
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-bright)",
          }}
        >
          24
        </div>
      </div>
    </div>
  );
}
