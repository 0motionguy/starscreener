import Link from "next/link";

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";
import { getCompositeMoverRows } from "./displayData";

interface CompositeMoversBoardProps {
  items: AgentCommerceItem[];
  limit?: number;
}

/**
 * Derive a tier classification for a composite-movers row.
 *
 * Tiers map to row treatment:
 *   - hot:   top third (rank ≤ ceil(limit/3)) — high-momentum / mover.
 *   - warm:  mid third — sustained signal.
 *   - early: bottom third — emerging signal, lower confidence.
 *
 * Returns the data-tier attribute value so the row carries both the
 * `tier-{hot|warm|early}` className and a corresponding data attribute
 * for shell.js / future binding.
 */
function tierFor(rank: number, total: number): "hot" | "warm" | "early" {
  const hotCutoff = Math.max(1, Math.ceil(total / 3));
  const warmCutoff = Math.max(hotCutoff + 1, Math.ceil((total * 2) / 3));
  if (rank <= hotCutoff) return "hot";
  if (rank <= warmCutoff) return "warm";
  return "early";
}

export function CompositeMoversBoard({ items, limit = 10 }: CompositeMoversBoardProps) {
  const ranked = getCompositeMoverRows(items, limit);
  const total = ranked.length;

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 05"}</span>
        <span className="ph-title">Composite movers - top {limit}</span>
        <span className="ph-meta">
          ranked by composite score - github velocity x social x api clarity x portal-ready
        </span>
      </div>
      <div>
        {ranked.map((it, idx) => {
          const rank = idx + 1;
          const tier = tierFor(rank, total);
          return (
          <div
            className={`mover composite-row tier-${tier}`}
            key={it.id}
            style={moverStyle}
            data-tier={tier}
            data-rank={rank}
          >
            <span className="r" style={rStyle}>
              {rank}
            </span>
            <div className="lg" style={lgStyle}>
              {it.glyph}
            </div>
            <div className="co" style={coStyle}>
              <Link
                href={it.href}
                prefetch={false}
                className="nm"
                style={nmStyle}
                target={it.href.startsWith("http") ? "_blank" : undefined}
                rel={it.href.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {it.name}
              </Link>
              <span className="desc" style={descStyle}>
                {it.description}
              </span>
            </div>
            <div className="badges" style={badgesStyle}>
              {it.badges.map((badge) => (
                <span key={badge} className={badge} style={{ ...badgeStyle, ...badgeTone[badge] }}>
                  {badge.toUpperCase()}
                </span>
              ))}
            </div>
            <span className="score" style={scoreStyle}>
              {it.score.toFixed(1)}
            </span>
            <span
              className={`delta ${it.delta >= 0 ? "up" : "down"}`}
              style={{
                ...deltaStyle,
                color: it.delta >= 0 ? "var(--up)" : "var(--down)",
              }}
            >
              {it.delta >= 0 ? "▲ +" : "▼ -"}
              {Math.abs(it.delta).toFixed(1)}
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

const moverStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 36px 1fr 92px 80px 90px",
  gap: 12,
  alignItems: "center",
  padding: "12px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  fontSize: 12,
};
const rStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  color: "var(--fg-faint)",
  fontSize: 11,
  textAlign: "right",
};
const lgStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  background: "var(--surface-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 4,
  display: "grid",
  placeItems: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  color: "var(--cyan)",
  fontWeight: 600,
};
const coStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};
const nmStyle: React.CSSProperties = {
  color: "var(--fg-bright)",
  fontWeight: 500,
  textDecoration: "none",
};
const descStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--fg-muted)",
  fontFamily: "var(--font-mono)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const badgesStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};
const badgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  padding: "1px 4px",
  borderRadius: 1,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontWeight: 600,
  background: "var(--surface-3)",
};
const badgeTone = {
  x402: {
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  mcp: {
    background: "color-mix(in oklch, var(--cyan) 14%, transparent)",
    color: "var(--cyan)",
  },
  a2a: {
    background: "color-mix(in oklch, var(--up) 14%, transparent)",
    color: "var(--up)",
  },
  portal: {
    background: "color-mix(in oklch, var(--warning) 16%, transparent)",
    color: "var(--warning)",
  },
} satisfies Record<string, React.CSSProperties>;
const scoreStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  color: "var(--accent)",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  fontWeight: 500,
};
const deltaStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textAlign: "right",
};
