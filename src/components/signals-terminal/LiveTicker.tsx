"use client";

import type { CSSProperties } from "react";
import type { SourceKey } from "@/lib/signals/types";
import { SourceMark, SOURCE_BRAND_COLOR } from "./SourceMark";

export interface TickerItem {
  source: SourceKey;
  label: string;
  text: string;
  value: string;
  down?: boolean;
}

export interface LiveTickerProps {
  items: TickerItem[];
}

export function LiveTicker({ items }: LiveTickerProps) {
  // Duplicate the list to make the loop seamless without a gap-jump.
  const doubled = items.length > 0 ? [...items, ...items] : [];

  return (
    <div
      style={{
        marginTop: "14px",
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
        }}
      >
        <i
          aria-hidden
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "99px",
            background: "var(--color-bg-canvas)",
            animation: "pulse-dark 1.4s ease-in-out infinite",
          }}
        />
        LIVE · 24H WIRE
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          fontSize: "11px",
          letterSpacing: "0.06em",
          color: "var(--color-text-muted)",
        }}
      >
        {doubled.length > 0 ? (
          <div
            className="signals-ticker-track"
            style={
              {
                display: "flex",
                gap: "24px",
                padding: "0 24px",
                whiteSpace: "nowrap",
                animation: "signals-ticker-scroll 60s linear infinite",
              } as CSSProperties
            }
          >
            {doubled.map((t, i) => (
              <span
                key={`${t.source}-${i}-${t.text}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "3px",
                    background: `color-mix(in srgb, ${SOURCE_BRAND_COLOR[t.source]} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${SOURCE_BRAND_COLOR[t.source]} 45%, transparent)`,
                    color: SOURCE_BRAND_COLOR[t.source],
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SourceMark source={t.source} size={9} monochrome />
                </span>
                <b
                  style={{
                    color: "var(--color-text-default)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {t.label}
                </b>
                <span>{t.text}</span>
                <em
                  style={{
                    fontStyle: "normal",
                    color: t.down
                      ? "var(--color-negative)"
                      : "var(--color-positive)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {t.value}
                </em>
              </span>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: "0 24px",
              color: "var(--color-text-subtle)",
              fontFamily: "var(--font-mono)",
            }}
          >
            no recent signals — collectors warming up
          </div>
        )}
      </div>
      {/* Inline keyframes — scoped via a unique animation name. */}
      <style>{`
        @keyframes signals-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pulse-dark {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

export default LiveTicker;
