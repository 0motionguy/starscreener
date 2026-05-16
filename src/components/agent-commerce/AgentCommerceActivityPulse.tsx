// Agent Commerce — activity pulse (12w entities-tracked spark + protocol pulse
// rows). Extracted from `src/app/agent-commerce/page.tsx` as part of A8-P2.
//
// Pure presentation: the growth curve and stats arrive via props so the page
// keeps responsibility for the data math and this component focuses on layout.

import { Card, CardBody, CardHeader } from "@/components/ui/Card";

import type { AgentCommerceStats } from "@/lib/agent-commerce/types";

import { Sparkline } from "./Sparkline";

export interface AgentCommerceActivityPulseProps {
  /** Growth curve for the "entities tracked" sparkline (12-week shape). */
  activitySeries: number[];
  stats: AgentCommerceStats;
}

export function AgentCommerceActivityPulse({
  activitySeries,
  stats,
}: AgentCommerceActivityPulseProps) {
  return (
    <>
      <div className="sec-head">
        <span className="sec-num">{"// 02"}</span>
        <h2 className="sec-title">Activity pulse</h2>
        <span className="sec-meta">
          12-week trend · <b>{stats.totalItems}</b> tracked
        </span>
      </div>
      <div className="grid">
        <Card className="col-8">
          <CardHeader
            showCorner
            right={
              <span style={{ color: "#34d399" }}>
                +{stats.thisWeekCount} this week
              </span>
            }
          >
            Entities tracked
          </CardHeader>
          <CardBody>
            <div style={{ padding: "10px 14px 6px" }}>
              <div style={{ color: "#34d399" }}>
                <Sparkline
                  data={activitySeries}
                  width={520}
                  height={64}
                  color="#34d399"
                  fillOpacity={0.18}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: 10,
                  color: "var(--color-text-faint)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                <span>12w ago</span>
                <span>8w</span>
                <span>4w</span>
                <span>now</span>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card className="col-4">
          <CardHeader showCorner right={<span>protocol pulse</span>}>
            Protocol-active
          </CardHeader>
          <CardBody>
            {[
              {
                label: "x402",
                n: stats.x402EnabledCount,
                color: "#f59e0b",
              },
              {
                label: "MCP",
                n: stats.mcpServerCount,
                color: "#22d3ee",
              },
              {
                label: "Portal",
                n: stats.portalReadyCount,
                color: "#34d399",
              },
              {
                label: "Actionable",
                n: stats.agentActionableCount,
                color: "#a78bfa",
              },
            ].map((row) => {
              // 2026-05-15: synthetic pulse data removed; Sparkline
              // renders nothing when the array is empty.
              const data: number[] = [];
              return (
                <div
                  key={row.label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px minmax(0, 1fr) 36px",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 12px",
                    borderBottom: "1px solid var(--color-border-subtle)",
                  }}
                >
                  <span
                    style={{
                      color: row.color,
                      fontFamily: "var(--font-mono, ui-monospace)",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {row.label}
                  </span>
                  <span style={{ color: row.color }}>
                    <Sparkline
                      data={data}
                      color={row.color}
                      width={120}
                      height={20}
                    />
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontFamily: "var(--font-mono, ui-monospace)",
                      fontWeight: 700,
                      color: "var(--color-text-default)",
                    }}
                  >
                    {row.n}
                  </span>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
