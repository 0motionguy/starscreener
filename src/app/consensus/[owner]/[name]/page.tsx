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

// V4 (CORPUS) primitives.
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { VerdictRibbon, type VerdictTone } from "@/components/ui/VerdictRibbon";
import { GaugeStrip, type GaugeCellState } from "@/components/ui/GaugeStrip";

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

const VERDICT_TOKEN: Record<ConsensusItemReport["verdict"], string> = {
  strong: "var(--v4-money)",
  early: "var(--v4-violet)",
  weak: "var(--v4-ink-300)",
  noise: "var(--v4-red)",
};

const VERDICT_TONE: Record<ConsensusItemReport["verdict"], VerdictTone> = {
  strong: "money",
  early: "acc",
  weak: "amber",
  noise: "amber",
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
  const verdict = report?.verdict ?? "weak";

  // 8-cell gauge strip — one cell per consensus source.
  const gaugeCells = SOURCE_ORDER.map<{ state: GaugeCellState; title: string }>((k) => {
    const c = item.sources[k];
    if (!c.present) {
      return { state: "off", title: `${SOURCE_NAMES[k]} · absent` };
    }
    const state: GaugeCellState = c.normalized >= 0.6 ? "on" : "weak";
    return {
      state,
      title: `${SOURCE_NAMES[k]} · #${c.rank} · ${c.normalized.toFixed(2)}`,
    };
  });

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <Link href="/consensus">CONSENSUS</Link> · DETAIL · /{owner}/{name}
          </>
        }
        h1={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
            <EntityLogo
              src={repoLogoUrl(item.fullName, 40)}
              name={item.fullName}
              size={40}
              shape="square"
              alt=""
            />
            {item.fullName}
          </span>
        }
        lede={
          <>
            Consensus rank #{item.rank} · score {item.consensusScore.toFixed(1)} · confidence{" "}
            {item.confidence}% · {item.sourceCount}/8 sources present.
          </>
        }
        clock={
          <>
            <span className="big">{VERDICT_LABEL[verdict]}</span>
            <span style={{ color: VERDICT_TOKEN[verdict] }}>
              {report ? `confidence ${report.confidence}%` : "no analyst report yet"}
            </span>
          </>
        }
      />

      {!report ? (
        <VerdictRibbon
          tone="amber"
          stamp={{
            eyebrow: "// ANALYST",
            headline: "PENDING",
            sub: "runs hourly · top 14 only",
          }}
          text={
            <>
              No AI Analyst report yet for <b>{item.fullName}</b>. Reports are generated for the
              top 14 consensus picks each hour. Stats below come from the consensus engine
              directly.
            </>
          }
        />
      ) : (
        <ItemReportSections report={report} item={item} gaugeCells={gaugeCells} />
      )}

      <SignalsBlock item={item} />
    </main>
  );
}

function ItemReportSections({
  report,
  item,
  gaugeCells,
}: {
  report: ConsensusItemReport;
  item: ConsensusItem;
  gaugeCells: Array<{ state: GaugeCellState; title: string }>;
}) {
  return (
    <>
      <VerdictRibbon
        tone={VERDICT_TONE[report.verdict]}
        stamp={{
          eyebrow: "// SUMMARY",
          headline: VERDICT_LABEL[report.verdict],
          sub: `confidence ${report.confidence}% · ${item.sourceCount}/8 sources`,
        }}
        text={report.summary}
        actionLabel={ACTION_LABEL[report.whatToDo]}
      />

      <SectionHead
        num="// 01"
        title="Signal breakdown"
        meta={<>six dimensions · 0–100</>}
      />
      <KpiBand
        cells={[
          {
            label: "MOMENTUM",
            value: Math.round(report.scores.momentum),
            sub: <ScoreBar value={report.scores.momentum} />,
            tone: report.scores.momentum >= 60 ? "money" : "default",
          },
          {
            label: "CREDIBILITY",
            value: Math.round(report.scores.credibility),
            sub: <ScoreBar value={report.scores.credibility} />,
            tone: report.scores.credibility >= 60 ? "money" : "default",
          },
          {
            label: "CROSS-SOURCE",
            value: Math.round(report.scores.crossSource),
            sub: <ScoreBar value={report.scores.crossSource} />,
            tone: report.scores.crossSource >= 60 ? "money" : "default",
          },
          {
            label: "DEV ADOPTION",
            value: Math.round(report.scores.developerAdoption),
            sub: <ScoreBar value={report.scores.developerAdoption} />,
            tone: report.scores.developerAdoption >= 60 ? "money" : "default",
          },
          {
            label: "MARKET RELEVANCE",
            value: Math.round(report.scores.marketRelevance),
            sub: <ScoreBar value={report.scores.marketRelevance} />,
            tone: report.scores.marketRelevance >= 60 ? "money" : "default",
          },
          {
            label: "HYPE RISK",
            value: Math.round(report.scores.hypeRisk),
            sub: <ScoreBar value={report.scores.hypeRisk} invert />,
            // Hype risk is inverted — high score = bad signal.
            tone: report.scores.hypeRisk >= 60 ? "red" : "money",
          },
        ]}
      />

      <SectionHead
        num="// 02"
        title="Source agreement strip"
        meta={
          <>
            <b>{item.sourceCount}</b>/8 active · click cells for source detail below
          </>
        }
      />
      <div style={{ padding: "8px 12px", border: "1px solid var(--v4-line-200)", background: "var(--v4-bg-025)" }}>
        <GaugeStrip cells={gaugeCells} cellWidth={36} cellHeight={20} gap={4} />
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 03 · EVIDENCE"}</span>
          </div>
          <div className="dv-list">
            {report.evidence.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </section>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 04 · CONTRARIAN VIEW"}</span>
          </div>
          <div className="dv-list">
            <p>{report.contrarian}</p>
          </div>
        </section>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 05 · WHY NOW"}</span>
          </div>
          <div className="dv-list">
            <p>{report.whyNow}</p>
          </div>
        </section>
        <section className="panel col-6">
          <div className="panel-head">
            <span className="key">{"// 06 · WHAT TO DO"}</span>
            <span className="right" style={{ color: VERDICT_TOKEN[report.verdict] }}>
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

function ScoreBar({ value, invert = false }: { value: number; invert?: boolean }) {
  // Hype risk is inverted — high = bad. Color accordingly.
  const fill = invert
    ? value >= 60
      ? "var(--v4-red)"
      : "var(--v4-money)"
    : value >= 60
      ? "var(--v4-money)"
      : "var(--v4-acc)";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        height: 3,
        background: "var(--v4-bg-200)",
        marginTop: 4,
      }}
    >
      <i
        style={{
          display: "block",
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: "100%",
          background: fill,
        }}
      />
    </span>
  );
}

function SignalsBlock({ item }: { item: ConsensusItem }) {
  return (
    <>
      <SectionHead
        num="// 07"
        title="Per-source signals"
        meta={<>weight · rank · normalized</>}
      />
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
                {c.present
                  ? c.score != null
                    ? `score ${Math.round(c.score)}`
                    : "rank-based"
                  : "absent"}
              </div>
              <span className="bar">
                <i
                  style={{
                    width: `${Math.round(c.normalized * 100)}%`,
                    background: c.present ? "var(--v4-acc)" : "transparent",
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
