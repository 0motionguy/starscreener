import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getConsensusTrendingItems,
  refreshConsensusTrendingFromStore,
  type ConsensusItem,
  type ConsensusExternalSource,
} from "@/lib/consensus-trending";
import {
  getConsensusItemReport,
  refreshConsensusVerdictsFromStore,
  type ConsensusItemReport,
} from "@/lib/consensus-verdicts";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";

export const runtime = "nodejs";
export const revalidate = 600;

const SOURCE_ORDER: ConsensusExternalSource[] = ["gh", "hf", "hn", "x", "r", "pdh", "dev", "bs"];
const SOURCE_NAMES: Record<ConsensusExternalSource, string> = {
  gh: "GitHub",
  hf: "Hugging Face",
  hn: "Hacker News",
  x: "X / Twitter",
  r: "Reddit",
  pdh: "Product Hunt",
  dev: "Dev.to",
  bs: "Bluesky",
};

const ACTION_LABEL: Record<ConsensusItemReport["whatToDo"], string> = {
  watch: "WATCH",
  build: "BUILD",
  ignore: "IGNORE",
  research: "RESEARCH DEEPER",
};

const VERDICT_LABEL: Record<ConsensusItemReport["verdict"], string> = {
  strong: "STRONG SIGNAL",
  early: "EARLY SIGNAL",
  weak: "WEAK SIGNAL",
  noise: "NOISE",
};

const VERDICT_COLOR: Record<ConsensusItemReport["verdict"], string> = {
  strong: "#22c55e",
  early: "#a78bfa",
  weak: "#909caa",
  noise: "#ff4d4d",
};

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
}

export default async function ConsensusDetailPage({ params }: PageProps) {
  const { owner, name } = await params;
  const fullName = `${owner}/${name}`;

  await Promise.all([
    refreshConsensusTrendingFromStore(),
    refreshConsensusVerdictsFromStore(),
  ]);

  const item = getConsensusTrendingItems(500).find(
    (i) => i.fullName.toLowerCase() === fullName.toLowerCase(),
  );
  if (!item) notFound();

  const report = getConsensusItemReport(item.fullName);

  return (
    <main className="home-surface">
      <section className="page-head">
        <div>
          <div className="crumb">
            <Link href="/consensus">CONSENSUS</Link> · DETAIL · /{owner}/{name}
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <EntityLogo src={repoLogoUrl(item.fullName, 40)} name={item.fullName} size={40} shape="square" alt="" />
            {item.fullName}
          </h1>
          <p className="lede">
            Consensus rank #{item.rank} · score {item.consensusScore.toFixed(1)} · confidence{" "}
            {item.confidence}% · {item.sourceCount}/8 sources present.
          </p>
        </div>
        <div className="clock">
          <span className="big">{VERDICT_LABEL[report?.verdict ?? "weak"]}</span>
          <span style={{ color: VERDICT_COLOR[report?.verdict ?? "weak"] }}>
            {report ? `confidence ${report.confidence}%` : "no analyst report yet"}
          </span>
        </div>
      </section>

      {!report ? (
        <section
          className="verdict"
          style={{ borderColor: "var(--line-300)", background: "var(--bg-025)" }}
        >
          <div className="v-stamp">
            <span>{"// ANALYST"}</span>
            <span className="ts">PENDING</span>
            <span className="ago">runs hourly · top 14 only</span>
          </div>
          <div className="v-text">
            No AI Analyst report yet for <b>{item.fullName}</b>. Reports are generated for the top 14 consensus picks each hour. Stats below come from the consensus engine directly.
          </div>
          <div className="v-actions" />
        </section>
      ) : (
        <ItemReportSections report={report} />
      )}

      <SignalsBlock item={item} />
    </main>
  );
}

function ItemReportSections({ report }: { report: ConsensusItemReport }) {
  return (
    <>
      <section className="verdict">
        <div className="v-stamp">
          <span>{"// SUMMARY"}</span>
          <span className="ts">{VERDICT_LABEL[report.verdict]}</span>
          <span className="ago">confidence {report.confidence}%</span>
        </div>
        <div className="v-text">{report.summary}</div>
        <div className="v-actions">
          <span style={{ color: VERDICT_COLOR[report.verdict] }}>
            {ACTION_LABEL[report.whatToDo]}
          </span>
        </div>
      </section>

      <div className="sec-head">
        <span className="sec-num">{"// 01"}</span>
        <h2 className="sec-title">Signal breakdown</h2>
        <span className="sec-meta">six dimensions · 0–100</span>
      </div>
      <div className="kpi-band" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
        <ScoreCell label="Momentum" value={report.scores.momentum} />
        <ScoreCell label="Credibility" value={report.scores.credibility} />
        <ScoreCell label="Cross-source" value={report.scores.crossSource} />
        <ScoreCell label="Dev adoption" value={report.scores.developerAdoption} />
        <ScoreCell label="Market relevance" value={report.scores.marketRelevance} />
        <ScoreCell label="Hype risk" value={report.scores.hypeRisk} invert />
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 02 · EVIDENCE"}</span>
          </div>
          <div className="dv-list">
            {report.evidence.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </section>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 03 · CONTRARIAN VIEW"}</span>
          </div>
          <div className="dv-list">
            <p>{report.contrarian}</p>
          </div>
        </section>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 04 · WHY NOW"}</span>
          </div>
          <div className="dv-list">
            <p>{report.whyNow}</p>
          </div>
        </section>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 05 · WHAT TO DO"}</span>
            <span className="right" style={{ color: VERDICT_COLOR[report.verdict] }}>
              {ACTION_LABEL[report.whatToDo]}
            </span>
          </div>
          <div className="dv-list">
            <p>{report.whatToDoDetail}</p>
          </div>
        </section>
      </div>
    </>
  );
}

function ScoreCell({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  // Hype risk is inverted — high = bad. Color accordingly.
  const goodColor = "#22c55e";
  const badColor = "#ff4d4d";
  const fill = invert ? (value >= 60 ? badColor : goodColor) : value >= 60 ? goodColor : "var(--acc, #ff6b35)";
  return (
    <div className="kpi" style={{ padding: "12px 14px" }}>
      <div className="lbl">
        <span className="pip" aria-hidden="true" style={{ background: fill }} />
        {label}
      </div>
      <div className="val" style={{ color: fill }}>
        {Math.round(value)}
      </div>
      <div className="sub" style={{ height: 3, background: "var(--bg-200, #1d242b)", marginTop: 4 }}>
        <i style={{ display: "block", width: `${value}%`, height: "100%", background: fill }} />
      </div>
    </div>
  );
}

function SignalsBlock({ item }: { item: ConsensusItem }) {
  return (
    <>
      <div className="sec-head">
        <span className="sec-num">{"// 06"}</span>
        <h2 className="sec-title">Per-source signals</h2>
        <span className="sec-meta">
          weight · rank · normalized
        </span>
      </div>
      <div className="src-strip">
        {SOURCE_ORDER.map((k) => {
          const c = item.sources[k];
          return (
            <div className="src-cell" key={k}>
              <div className="src-top">
                <span className={`sd sd-${k}`}>{k.toUpperCase()}</span>
                <span className="nm">{SOURCE_NAMES[k]}</span>
                <span className="wt">{c.present ? `#${c.rank}` : "—"}</span>
              </div>
              <div className="ct">{c.present ? c.normalized.toFixed(2) : "—"}</div>
              <div className="meta">
                {c.present ? (c.score != null ? `score ${Math.round(c.score)}` : "rank-based") : "absent"}
              </div>
              <span className="bar">
                <i
                  style={{
                    width: `${Math.round(c.normalized * 100)}%`,
                    background: c.present ? "var(--acc, #ff6b35)" : "transparent",
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
