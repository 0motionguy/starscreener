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

const KIND_COLOR: Record<TickerKind, string> = {
  "token-up": "#34d399",
  "token-down": "#f87171",
  "github-push": "#fbbf24",
  "x402-new": "#f59e0b",
  social: "#a78bfa",
};

const KIND_GLYPH: Record<TickerKind, ReactNode> = {
  "token-up": "?",
  "token-down": "?",
  "github-push": <BrandStar size={10} className="text-[var(--v4-amber)]" />,
  "x402-new": "x402",
  social: "�",
};

export function AgentCommerceTicker({
  items,
}: {
  items: AgentCommerceTickerItem[];
}) {
  const doubled = items.length > 0 ? [...items, ...items] : [];

  return (
    <div
      style={{
        margin: "10px 0 14px",
        border: "1px solid var(--color-border-default)",
        background: "var(--color-bg-shell)",
        overflow: "hidden",
        height: "36px",
        display: "flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          flex: "none",
          height: "100%",
          padding: "0 14px",
          background: "var(--color-accent)",
          color: "var(--color-bg-canvas)",
          fontSize: "10.5px",
          letterSpacing: "0.20em",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono, ui-monospace)",
        }}
      >
        <i
          aria-hidden
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "99px",
            background: "var(--color-bg-canvas)",
            animation: "ac-ticker-pulse 1.4s ease-in-out infinite",
          }}
        />
        LIVE � AGENT COMMERCE
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          fontSize: "11px",
          letterSpacing: "0.04em",
          color: "var(--color-text-subtle)",
          fontFamily: "var(--font-mono, ui-monospace)",
        }}
      >
        {doubled.length > 0 ? (
          <div
            style={
              {
                display: "flex",
                gap: "24px",
                padding: "0 24px",
                whiteSpace: "nowrap",
                animation: "ac-ticker-scroll 80s linear infinite",
              } as CSSProperties
            }
          >
            {doubled.map((t, i) => (
              <a
                key={`${t.kind}-${i}-${t.text}`}
                href={t.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <i
                  aria-hidden
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "99px",
                    background: KIND_COLOR[t.kind],
                    flex: "none",
                  }}
                />
                <b
                  style={{
                    color: KIND_COLOR[t.kind],
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {KIND_GLYPH[t.kind]} {t.label}
                </b>
                <span style={{ color: "var(--color-text-default)" }}>
                  {t.text}
                </span>
                <em
                  style={{
                    fontStyle: "normal",
                    color: t.down ? "#f87171" : "#34d399",
                  }}
                >
                  {t.value}
                </em>
              </a>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: "0 24px",
              color: "var(--color-text-faint)",
            }}
          >
            no recent agent-commerce signals - collectors warming up
          </div>
        )}
      </div>
      <style>{`
        @keyframes ac-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes ac-ticker-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
