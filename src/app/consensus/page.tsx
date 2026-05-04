import Link from "next/link";
import type { ReactNode } from "react";

import {
  getConsensusTrendingItems,
  getConsensusTrendingMeta,
  refreshConsensusTrendingFromStore,
  type ConsensusItem,
} from "@/lib/consensus-trending";
import {
  getConsensusVerdictsPayload,
  refreshConsensusVerdictsFromStore,
} from "@/lib/consensus-verdicts";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { AgreementMatrix } from "@/components/consensus/AgreementMatrix";
import { ConsensusBoard } from "@/components/consensus/ConsensusBoard";
import { DailyVerdictPanel, VerdictRibbon } from "@/components/consensus/DailyVerdictPanel";
import { SourceStrip } from "@/components/consensus/SourceStrip";

export const runtime = "nodejs";
// ISR: page rebuilds every 10 minutes (consensus fetcher publishes hourly,
// analyst follows ~10 min later — 600s gives one cache miss per fetcher tick).
export const revalidate = 600;

function fmtClock(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(11, 19);
}

function consensusHref(fullName: string): string {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return "#";
  return `/consensus/${owner}/${name}`;
}

function SectionHead({ num, title, meta }: { num: string; title: string; meta?: ReactNode }) {
  return (
    <div className="sec-head">
      <span className="sec-num">{`// ${num}`}</span>
      <h2 className="sec-title">{title}</h2>
      {meta ? <span className="sec-meta">{meta}</span> : null}
    </div>
  );
}

function EarlyCallList({ items }: { items: ConsensusItem[] }) {
  if (items.length === 0) {
    return (
      <div className="sp-row">
        <div className="rk">—</div>
        <div className="nm">
          <div className="h">No early calls today</div>
          <div className="meta">Waiting for OURS to lead an external feed by ≥20 ranks.</div>
        </div>
      </div>
    );
  }
  return (
    <>
      {items.map((item, i) => {
        const lead =
          item.externalRank != null && item.oursRank != null
            ? Math.max(0, item.externalRank - item.oursRank)
            : 0;
        return (
          <Link href={consensusHref(item.fullName)} className="sp-row" key={item.fullName}>
            <div className="rk">
              {i === 0 ? <span className="star">★</span> : null}
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="nm">
              <div className="h">{item.fullName}</div>
              <div className="meta">
                OURS #{item.oursRank ?? "—"} · external #{item.externalRank ?? "—"} ·{" "}
                {item.sourceCount}/8 sources
              </div>
            </div>
            <div className="delta up">
              +{lead}
              <span className="lbl">RANKS LEAD</span>
            </div>
          </Link>
        );
      })}
    </>
  );
}

function DivergenceList({ items }: { items: ConsensusItem[] }) {
  if (items.length === 0) {
    return (
      <div className="sp-row">
        <div className="rk">—</div>
        <div className="nm">
          <div className="h">All sources align</div>
          <div className="meta">No divergences &gt; 30 rank gap right now.</div>
        </div>
      </div>
    );
  }
  return (
    <>
      {items.map((item, i) => (
        <Link href={consensusHref(item.fullName)} className="sp-row" key={item.fullName}>
          <div className="rk">{String(i + 1).padStart(2, "0")}</div>
          <div className="nm">
            <div className="h">{item.fullName}</div>
            <div className="meta">
              {item.sourceCount}/8 sources · ranks span {item.maxRankGap}
            </div>
          </div>
          <div className="delta dn">
            ≥ {item.maxRankGap}
            <span className="lbl">GAP</span>
          </div>
        </Link>
      ))}
    </>
  );
}

export default async function ConsensusPage() {
  // Refresh both data layers in parallel — both have 30s dedup, safe per-render.
  await Promise.all([
    refreshConsensusTrendingFromStore(),
    refreshConsensusVerdictsFromStore(),
  ]);

  const meta = getConsensusTrendingMeta();
  const items = getConsensusTrendingItems(100);
  const verdicts = getConsensusVerdictsPayload();

  const earlyItems = items.filter((i) => i.verdict === "early_call").slice(0, 7);
  const divItems = items.filter((i) => i.verdict === "divergence").slice(0, 7);

  const computed = meta.computedAt ? fmtClock(meta.computedAt) : "warming";

  return (
    <main className="home-surface">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>CONSENSUS</b> · TERMINAL · /
          </div>
          <h1>What 8 signal feeds agree on — right now.</h1>
          <p className="lede">
            An AI-curated leaderboard. Every repo, model, skill, and MCP is cross-validated against
            eight independent discovery feeds. Composite score = weighted agreement.
          </p>
        </div>
        <div className="clock">
          <span className="big">{computed}</span>
          UTC · COMPUTED
          <div style={{ marginTop: 4 }}>
            <span className="live">FEED LIVE</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <Link href="/api/scoring/consensus?limit=100" className="json-link">
              JSON →
            </Link>
          </div>
        </div>
      </section>

      <VerdictRibbon
        ribbon={verdicts.ribbon}
        computedAt={verdicts.computedAt || meta.computedAt}
        poolSize={meta.itemCount}
        bandCounts={{
          strong_consensus: meta.bandCounts.strong_consensus,
          early_call: meta.bandCounts.early_call,
          divergence: meta.bandCounts.divergence,
        }}
      />

      <MetricGrid columns={5} className="kpi-band">
        <Metric label="Pool" value={meta.itemCount} sub="candidates · 24h" pip />
        <Metric
          label="Strong consensus"
          value={meta.bandCounts.strong_consensus}
          sub="≥ 5 / 8 sources agree"
          tone="consensus"
          pip
        />
        <Metric
          label="Early calls"
          value={meta.bandCounts.early_call}
          sub="we ranked first"
          tone="early"
          pip
        />
        <Metric
          label="Divergence"
          value={meta.bandCounts.divergence}
          sub="feeds disagree · gap > 30"
          tone="divergence"
          pip
        />
        <Metric
          label="External-only"
          value={meta.bandCounts.external_only}
          sub="not yet on our radar"
          tone="external"
          pip
        />
      </MetricGrid>

      <SourceStrip stats={meta.sourceStats} />

      <SectionHead
        num="01"
        title="Agreement matrix · OURS rank × external composite"
        meta={
          <>
            <b>{items.length}</b> candidates · diagonal = agreement
          </>
        }
      />
      <div className="grid">
        <section className="panel col-8">
          <div className="panel-head">
            <span className="key">{"// MATRIX · X · OURS RANK → · Y · EXTERNAL RANK ↓"}</span>
            <span style={{ color: "var(--ink-400, #84909b)" }}>· COLOR · VERDICT BAND</span>
            <span className="right">
              <span className="live">LIVE</span>
            </span>
          </div>
          <div className="matrix-legend">
            <span>
              <i className="pip" style={{ background: "#22c55e" }} /> Strong consensus
            </span>
            <span>
              <i className="pip" style={{ background: "#a78bfa" }} /> Early call
            </span>
            <span>
              <i className="pip" style={{ background: "#ffb547" }} /> Divergence
            </span>
            <span>
              <i className="pip" style={{ background: "#60a5fa" }} /> External-only
            </span>
            <span>
              <i className="pip" style={{ background: "#84909b" }} /> Single source
            </span>
            <span className="right">click any band row · open detail</span>
          </div>
          <AgreementMatrix items={items} />
        </section>

        <div className="col-4">
          <DailyVerdictPanel
            ribbon={verdicts.ribbon}
            generator={verdicts.generator}
            computedAt={verdicts.computedAt}
          />
        </div>
      </div>

      <SectionHead
        num="02"
        title="Receipts · early calls and divergences"
        meta={
          <>
            cross-checked · <b>14d</b> window
          </>
        }
      />
      <div className="grid">
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// EARLY-CALL HALL OF FAME"}</span>
            <span style={{ color: "var(--ink-400, #84909b)" }}>· OURS BEFORE EXTERNAL</span>
            <span className="right">
              <span style={{ color: "#a78bfa" }}>↑ {earlyItems.length} ACTIVE</span>
            </span>
          </div>
          <EarlyCallList items={earlyItems} />
        </section>

        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// DIVERGENCE WATCH"}</span>
            <span style={{ color: "var(--ink-400, #84909b)" }}>· FEEDS DISAGREE &gt; 30 RANKS</span>
            <span className="right">
              <span style={{ color: "#ffb547" }}>⚠ {divItems.length} ACTIVE</span>
            </span>
          </div>
          <DivergenceList items={divItems} />
        </section>
      </div>

      <SectionHead
        num="03"
        title="Consensus leaderboard · 100 candidates"
        meta={
          <>
            grouped by verdict · <b>updated every 60s</b>
          </>
        }
      />

      {items.length === 0 ? (
        <div className="panel" style={{ padding: 24, color: "var(--ink-300, #84909b)" }}>
          Consensus pool is warming. The worker publishes after engagement-composite + 8 source
          fetchers refresh.
        </div>
      ) : (
        <ConsensusBoard items={items} perBand={20} />
      )}
    </main>
  );
}
