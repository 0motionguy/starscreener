import Link from "next/link";

import type { ConsensusRibbonReport } from "@/lib/consensus-verdicts";

interface DailyVerdictPanelProps {
  ribbon: ConsensusRibbonReport;
  generator: "kimi" | "template";
  computedAt: string;
}

export function DailyVerdictPanel({
  ribbon,
  generator,
  computedAt,
}: DailyVerdictPanelProps) {
  const stamp = computedAt
    ? new Date(computedAt).toISOString().slice(11, 19) + " UTC"
    : "warming";
  const generatorLabel = generator === "kimi" ? "AI / KIMI K2" : "AUTO / TEMPLATE";

  if (!ribbon.headline && ribbon.bullets.length === 0) {
    return (
      <section className="panel">
        <div className="panel-head">
          <span className="key">{"// DAILY VERDICT"}</span>
          <span className="right" style={{ color: "var(--ink-400, #84909b)" }}>
            {generatorLabel}
          </span>
        </div>
        <div className="dv-list">
          <p>
            Awaiting first analyst run - verdict will appear after the next
            worker tick.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="key">{"// DAILY VERDICT"}</span>
        <span className="right" style={{ color: "var(--ink-400, #84909b)" }}>
          {generatorLabel} / {stamp}
        </span>
      </div>
      <div className="dv-list">
        {ribbon.headline ? (
          <p style={{ fontWeight: 600, color: "var(--ink-100, #eef0f2)" }}>
            {ribbon.headline}
          </p>
        ) : null}
        {ribbon.bullets.map((bullet, i) => (
          <p key={i}>{bullet}</p>
        ))}
        {ribbon.poolNote ? (
          <p style={{ color: "var(--ink-300, #84909b)", fontStyle: "italic" }}>
            {ribbon.poolNote}
          </p>
        ) : null}
      </div>
    </section>
  );
}

interface VerdictRibbonProps {
  ribbon: ConsensusRibbonReport;
  computedAt: string;
  poolSize: number;
  bandCounts: {
    strong_consensus: number;
    early_call: number;
    divergence: number;
  };
}

export function VerdictRibbon({
  ribbon,
  computedAt,
  poolSize,
  bandCounts,
}: VerdictRibbonProps) {
  const stamp = computedAt
    ? new Date(computedAt).toISOString().replace("T", " / ").slice(0, 16)
    : "warming";
  const ago = computedAt
    ? `${Math.floor((Date.now() - new Date(computedAt).getTime()) / 60000)}m ago`
    : "";

  const text =
    ribbon.headline ||
    `${bandCounts.strong_consensus} strong consensus picks today across 8 sources / ` +
      `${bandCounts.early_call} early calls / ${bandCounts.divergence} divergences to watch.`;

  return (
    <section className="verdict">
      <div className="v-stamp">
        <span>{"// TODAY'S VERDICT"}</span>
        <span className="ts">{stamp}</span>
        <span className="ago">
          {ago ? `computed ${ago} / ${poolSize} candidates` : `${poolSize} candidates`}
        </span>
      </div>
      <div className="v-text">{text}</div>
      <div className="v-actions">
        <Link href="/api/scoring/consensus?limit=100">JSON -&gt;</Link>
      </div>
    </section>
  );
}
