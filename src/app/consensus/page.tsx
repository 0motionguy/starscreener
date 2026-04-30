import Link from "next/link";

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
import { AgreementMatrix } from "@/components/consensus/AgreementMatrix";
import { ConsensusBoard } from "@/components/consensus/ConsensusBoard";
import { DailyVerdictPanel } from "@/components/consensus/DailyVerdictPanel";
import { SourceStrip } from "@/components/consensus/SourceStrip";

// V4 (CORPUS) primitives — page chrome + verdict + KPI band.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { LiveDot } from "@/components/ui/LiveDot";

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

  const computedAt = verdicts.computedAt || meta.computedAt;
  const computedClock = computedAt ? fmtClock(computedAt) : "warming";
  const computedAgo = computedAt
    ? `${Math.max(0, Math.floor((Date.now() - new Date(computedAt).getTime()) / 60000))}m ago`
    : "";

  // V4 verdict-ribbon copy: prefer the analyst headline, otherwise derive
  // a deterministic summary from band counts. Same fallback the V3 ribbon used.
  const verdictText =
    verdicts.ribbon.headline ||
    `${meta.bandCounts.strong_consensus} strong consensus picks today across 8 sources · ` +
      `${meta.bandCounts.early_call} early calls · ${meta.bandCounts.divergence} divergences to watch.`;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>CONSENSUS</b> · TERMINAL · /CONSENSUS
          </>
        }
        h1="What 8 signal feeds agree on — right now."
        lede="An AI-curated leaderboard. Every repo, model, skill, and MCP is cross-validated against eight independent discovery feeds. Composite score = weighted agreement."
        clock={
          <>
            <span className="big">{computedClock}</span>
            <span className="muted">UTC · COMPUTED</span>
            <LiveDot label="FEED LIVE" />
            <Link href="/api/scoring/consensus?limit=100" className="json-link">
              JSON →
            </Link>
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// TODAY'S VERDICT",
          headline: computedAt
            ? new Date(computedAt).toISOString().replace("T", " · ").slice(0, 16) + " UTC"
            : "warming",
          sub: computedAt
            ? `computed ${computedAgo} · ${meta.itemCount} candidates`
            : "awaiting first analyst run",
        }}
        text={verdictText}
        actionHref="#consensus-leaderboard"
        actionLabel="JUMP TO BOARD →"
      />

      <KpiBand
        className="kpi-band"
        cells={[
          {
            label: "POOL",
            value: meta.itemCount,
            sub: "candidates · 24h",
            pip: "var(--v4-ink-300)",
          },
          {
            label: "STRONG CONSENSUS",
            value: meta.bandCounts.strong_consensus,
            sub: "≥ 5 / 8 sources agree",
            tone: "money",
            pip: "var(--v4-money)",
          },
          {
            label: "EARLY CALLS",
            value: meta.bandCounts.early_call,
            sub: "we ranked first",
            tone: "acc",
            pip: "var(--v4-violet)",
          },
          {
            label: "DIVERGENCE",
            value: meta.bandCounts.divergence,
            sub: "feeds disagree · gap > 30",
            tone: "amber",
            pip: "var(--v4-amber)",
          },
          {
            label: "EXTERNAL-ONLY",
            value: meta.bandCounts.external_only,
            sub: "not yet on our radar",
            pip: "var(--v4-blue)",
          },
        ]}
      />

      <SourceStrip stats={meta.sourceStats} />

      <SectionHead
        num="// 01"
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
            <span style={{ color: "var(--v4-ink-400)" }}>· COLOR · VERDICT BAND</span>
            <span className="right">
              <LiveDot label="LIVE" />
            </span>
          </div>
          <div className="matrix-legend">
            <span>
              <i className="pip" style={{ background: "var(--v4-money)" }} /> Strong consensus
            </span>
            <span>
              <i className="pip" style={{ background: "var(--v4-violet)" }} /> Early call
            </span>
            <span>
              <i className="pip" style={{ background: "var(--v4-amber)" }} /> Divergence
            </span>
            <span>
              <i className="pip" style={{ background: "var(--v4-blue)" }} /> External-only
            </span>
            <span>
              <i className="pip" style={{ background: "var(--v4-ink-300)" }} /> Single source
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
        num="// 02"
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
            <span style={{ color: "var(--v4-ink-400)" }}>· OURS BEFORE EXTERNAL</span>
            <span className="right">
              <span style={{ color: "var(--v4-violet)" }}>↑ {earlyItems.length} ACTIVE</span>
            </span>
          </div>
          <EarlyCallList items={earlyItems} />
        </section>

        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// DIVERGENCE WATCH"}</span>
            <span style={{ color: "var(--v4-ink-400)" }}>· FEEDS DISAGREE &gt; 30 RANKS</span>
            <span className="right">
              <span style={{ color: "var(--v4-amber)" }}>⚠ {divItems.length} ACTIVE</span>
            </span>
          </div>
          <DivergenceList items={divItems} />
        </section>
      </div>

      <SectionHead
        num="// 03"
        title="Consensus leaderboard · 100 candidates"
        meta={
          <>
            grouped by verdict · <b>updated every 60s</b>
          </>
        }
      />

      <div id="consensus-leaderboard">
        {items.length === 0 ? (
          <div className="panel" style={{ padding: 24, color: "var(--v4-ink-300)" }}>
            Consensus pool is warming. The worker publishes after engagement-composite + 8 source
            fetchers refresh.
          </div>
        ) : (
          <ConsensusBoard items={items} perBand={20} />
        )}
      </div>
    </main>
  );
}
