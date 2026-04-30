// 12-tag by 24-hour momentum heatmap.
//
// Each cell encodes intensity 0..1 via inline `--a` custom property; heat
// vs cool is split by trend classification ("hot" / "warm" -> orange,
// "cool" -> cyan).

import type { ReactNode } from "react";

import type { TagRow } from "@/lib/signals/tag-momentum";
import { Card, CardHeader } from "@/components/ui/Card";

export interface TagMomentumHeatmapProps {
  rows: TagRow[];
}

export function TagMomentumHeatmap({ rows }: TagMomentumHeatmapProps) {
  return (
    <Card variant="panel" className="signals-panel">
      <CardHeader
        showCorner
        right={
          <>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
              }}
            >
              <i
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  background: "rgba(var(--heat-cool), 0.5)",
                  display: "inline-block",
                }}
              />
              cool
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
              }}
            >
              <i
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  background: "rgba(var(--heat-hot), 0.7)",
                  display: "inline-block",
                }}
              />
              hot
            </span>
          </>
        }
      >
        <span>{"// HEATMAP / MENTIONS PER HOUR"}</span>
        <span
          style={{
            color: "var(--color-text-subtle)",
            marginLeft: 8,
          }}
        >
          / INTENSITY = SHARE OF SIGNAL VOLUME
        </span>
      </CardHeader>

      <div
        className="ds-card-body"
        style={{ padding: "8px 12px 12px", overflowX: "auto" }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              padding: "20px 8px",
              color: "var(--color-text-subtle)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
            }}
          >
            no tag momentum yet - collectors warming up
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px repeat(24, 1fr)",
                gap: 2,
                alignItems: "center",
                minWidth: 680,
              }}
            >
              {rows.map((tag) => {
                const isCool = tag.trend === "cool";
                return (
                  <FullRow key={tag.tag}>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        color: "var(--color-text-muted)",
                        letterSpacing: "0.04em",
                        padding: "4px 8px 4px 4px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        borderRight: "1px solid var(--color-border-subtle)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <b style={{ color: "var(--color-text-default)" }}>
                        #{tag.tag}
                      </b>
                      <span
                        style={{
                          marginLeft: "auto",
                          color: "var(--color-text-subtle)",
                          fontSize: 9.5,
                        }}
                      >
                        {tag.count}
                      </span>
                    </div>
                    {tag.pattern.map((v, i) => (
                      <div
                        key={i}
                        style={{
                          height: 18,
                          borderRadius: 2,
                          background: isCool
                            ? `rgba(var(--heat-cool), ${v.toFixed(2)})`
                            : `rgba(var(--heat-hot), ${v.toFixed(2)})`,
                          border: isCool
                            ? `1px solid rgba(var(--heat-cool), ${(v * 0.5).toFixed(2)})`
                            : `1px solid rgba(var(--heat-hot), ${(v * 0.5).toFixed(2)})`,
                        }}
                      />
                    ))}
                  </FullRow>
                );
              })}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px repeat(24, 1fr)",
                gap: 2,
                paddingTop: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.10em",
                color: "var(--color-text-subtle)",
                textTransform: "uppercase",
              }}
            >
              <div style={{ paddingLeft: 4 }}>UTC -&gt;</div>
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  {i % 4 === 0 ? String(i).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function FullRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "contents" }}>{children}</div>;
}

export default TagMomentumHeatmap;
