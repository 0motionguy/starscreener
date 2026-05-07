"use client";

import type { CSSProperties, ReactNode } from "react";
import { BrandStar } from "@/components/shared/BrandStar";

export type TickerKind =
  | "token-up"
  | "token-down"
  | "github-push"
  | "x402-new"
  | "social";

export interface AgentCommerceTickerItem {
  kind: TickerKind;
  href: string;
  label: string;
  text: string;
  value: string;
  down?: boolean;
}

// Token-aware kind colors. Token-up/down use the canonical positive/negative
// rails so the ticker matches the rest of the dashboard. github / x402 / social
// stay in the warm/violet ramp because they are not directional p&l signals.
const KIND_COLOR: Record<TickerKind, string> = {
  "token-up": "var(--color-positive)",
  "token-down": "var(--color-negative)",
  "github-push": "var(--color-warning)",
  "x402-new": "var(--color-accent)",
  social: "var(--color-violet)",
};

// Glyph map: ASCII-safe so it survives any encoding round-trip.
// Triangles for directional, star for github push, x402 for new endpoints,
// hash for social. No emoji — terminal feel.
const KIND_GLYPH: Record<TickerKind, ReactNode> = {
  "token-up": "▲", // ▲
  "token-down": "▼", // ▼
  "github-push": <BrandStar size={10} className="text-[var(--color-warning)]" />,
  "x402-new": "x402",
  social: "#",
};

export function AgentCommerceTicker({
  items,
}: {
  items: AgentCommerceTickerItem[];
}) {
  const doubled = items.length > 0 ? [...items, ...items] : [];

  return (
    <div className="ac-ticker">
      <div className="ac-ticker-stamp">
        <i aria-hidden className="ac-ticker-pulse" />
        <span>LIVE / AGENT COMMERCE</span>
      </div>
      <div className="ac-ticker-track">
        {doubled.length > 0 ? (
          <div
            className="ac-ticker-stream"
            style={
              {
                animationDuration: "60s",
              } as CSSProperties
            }
          >
            {doubled.map((t, i) => (
              <a
                key={`${t.kind}-${i}-${t.text}`}
                href={t.href}
                className="ac-ticker-item"
                style={
                  {
                    "--tk-color": KIND_COLOR[t.kind],
                  } as CSSProperties
                }
              >
                <i aria-hidden className="ac-ticker-dot" />
                <b className="ac-ticker-label">
                  <span className="ac-ticker-glyph" aria-hidden>
                    {KIND_GLYPH[t.kind]}
                  </span>
                  {t.label}
                </b>
                <span className="ac-ticker-text">{t.text}</span>
                <em
                  className={`ac-ticker-value ${t.down ? "is-down" : "is-up"}`}
                >
                  {t.value}
                </em>
              </a>
            ))}
          </div>
        ) : (
          <div className="ac-ticker-empty">
            no recent agent-commerce signals — collectors warming up
          </div>
        )}
      </div>
    </div>
  );
}
