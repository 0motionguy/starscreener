// CompositeMoversBoard — 10-row leaderboard ranked by composite score.
// Each row: rank · logo glyph · name+desc · badges (X402 | MCP | A2A | PORTAL) ·
// composite score · social-delta proxy.
//
// "Delta" is a soft proxy: items with high social-mentions and recent
// lastUpdatedAt trend "up"; those with stale activity trend "down". We
// don't have a true t-1 score series yet, so this is rendered as a relative
// score-band signal, not a strict per-period delta.

import Link from "next/link";

import type { AgentCommerceItem } from "@/lib/agent-commerce/types";

interface CompositeMoversBoardProps {
  items: AgentCommerceItem[];
  limit?: number;
}

function getDeltaProxy(it: AgentCommerceItem): { sign: "up" | "down"; magnitude: number } {
  const social = it.live?.socialTotal ?? 0;
  const stars = it.live?.stars ?? 0;
  const composite = it.scores.composite;
  const pushedAt = it.live?.pushedAt ? Date.parse(it.live.pushedAt) : null;
  const recencyDays = pushedAt ? (Date.now() - pushedAt) / (1000 * 60 * 60 * 24) : 999;
  const recencyBoost = recencyDays < 7 ? 1.5 : recencyDays < 30 ? 1.0 : -0.5;
  const score =
    (composite > 70 ? 2 : composite > 50 ? 1 : 0) +
    (social > 100 ? 1.5 : social > 20 ? 0.8 : 0) +
    (stars > 5000 ? 1 : 0) +
    recencyBoost;
  if (score >= 1) return { sign: "up", magnitude: Math.min(9.9, score) };
  return { sign: "down", magnitude: Math.min(9.9, Math.abs(score)) };
}

function shortDesc(it: AgentCommerceItem): string {
  if (it.brief) return it.brief.length > 80 ? it.brief.slice(0, 79) + "…" : it.brief;
  if (it.links.website) {
    return it.links.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return `${it.category} · ${it.kind}`;
}

export function CompositeMoversBoard({ items, limit = 10 }: CompositeMoversBoardProps) {
  const ranked = [...items]
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, limit);

  return (
    <div className="panel fade-up" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <span className="ph-eyebrow">{"// 05"}</span>
        <span className="ph-title">Composite movers · top {limit}</span>
        <span className="ph-meta">
          ranked by composite score · github velocity × social × api clarity × portal-ready
        </span>
      </div>
      <div>
        {ranked.length === 0 ? (
          <div
            style={{
              padding: "20px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-muted)",
            }}
          >
            no items in the corpus yet — TODO: trigger agent-commerce fetcher.
          </div>
        ) : (
          ranked.map((it, idx) => {
            const delta = getDeltaProxy(it);
            const href = it.links.website ?? it.links.github ?? "#";
            return (
              <div className="mover" key={it.id} style={moverStyle}>
                <span className="r" style={rStyle}>
                  {idx + 1}
                </span>
                <div className="lg" style={lgStyle}>
                  {it.name.charAt(0).toUpperCase()}
                </div>
                <div className="co" style={coStyle}>
                  <Link
                    href={href}
                    prefetch={false}
                    className="nm"
                    style={nmStyle}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  >
                    {it.name}
                  </Link>
                  <span className="desc" style={descStyle}>
                    {shortDesc(it)}
                  </span>
                </div>
                <div className="badges" style={badgesStyle}>
                  {it.badges.x402Enabled ? (
                    <span className="x402" style={{ ...badgeStyle, ...badgeX402 }}>
                      X402
                    </span>
                  ) : null}
                  {it.badges.mcpServer ? (
                    <span className="mcp" style={{ ...badgeStyle, ...badgeMcp }}>
                      MCP
                    </span>
                  ) : null}
                  {it.protocols?.includes("a2a") ? (
                    <span className="a2a" style={{ ...badgeStyle, ...badgeA2a }}>
                      A2A
                    </span>
                  ) : null}
                  {it.badges.portalReady ? (
                    <span className="portal" style={{ ...badgeStyle, ...badgePortal }}>
                      PORTAL
                    </span>
                  ) : null}
                </div>
                <span className="score" style={scoreStyle}>
                  {it.scores.composite.toFixed(1)}
                </span>
                <span
                  className={`delta ${delta.sign}`}
                  style={{
                    ...deltaStyle,
                    color: delta.sign === "up" ? "var(--up)" : "var(--down)",
                  }}
                >
                  {delta.sign === "up" ? "▲ +" : "▼ -"}
                  {delta.magnitude.toFixed(1)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const moverStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 36px 1fr 60px 80px 90px",
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
};
const badgeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  padding: "1px 4px",
  borderRadius: 1,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontWeight: 600,
};
const badgeX402: React.CSSProperties = {
  background: "rgba(255,107,53,0.18)",
  color: "var(--accent)",
};
const badgeMcp: React.CSSProperties = {
  background: "rgba(77,212,255,0.12)",
  color: "var(--cyan)",
};
const badgeA2a: React.CSSProperties = {
  background: "rgba(74,222,128,0.12)",
  color: "var(--up)",
};
const badgePortal: React.CSSProperties = {
  background: "rgba(245,158,11,0.14)",
  color: "#f59e0b",
};
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
