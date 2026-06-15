// WhyTrendingExpander — per-repo "AI verdict" surface on /repo/[owner]/[name].
//
// Why this exists: the consensus-analyst fetcher generates per-repo "why now"
// + "what to do" narratives (ConsensusItemReport from
// src/lib/consensus-verdicts.ts) and those narratives are surfaced on the
// /consensus index + /consensus/[owner]/[name] detail page — but never on
// the standard repo detail page that 95% of users land on. Closes part of
// the v3 audit's OSSInsight depth gap (impact 3.0 + 4.0): depth-hunting
// users now get the same analyst-quality detail directly on the repo page
// without context-switching.
//
// Server component. Self-refreshes the consensus-verdicts data-store entry
// (30s rate-limit + in-flight dedupe means calling it from the expander is
// effectively free even if /consensus is loaded in a parallel tab).
//
// Stale-hide contract: getConsensusItemReport(fullName) returns null for
// repos outside the analyst's top-N pool OR for any payload past the
// 48h stale-hide gate (set in the data-store reader by L1 PR #3172). The
// expander renders nothing in either case — no stale verdict ever leaks
// onto the page. Single source of truth for "is this verdict fresh enough
// to show" stays in consensus-verdicts.ts; this surface just trusts the
// null signal.
//
// Generator field on the payload is "kimi" | "template" today; L1 PR #3172
// widens that union to include "nanogpt". The footer reads whatever value
// the payload exposes, so this PR works against either union without
// blocking on #3172 landing first.

import type { JSX } from "react";

import {
  getConsensusItemReport,
  refreshConsensusVerdictsFromStore,
  getConsensusVerdictsPayload,
  type ConsensusItemReport,
} from "@/lib/consensus-verdicts";

interface WhyTrendingExpanderProps {
  fullName: string;
}

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
  strong: "var(--v4-money, #22c55e)",
  early: "var(--v4-violet, #a78bfa)",
  weak: "var(--v4-ink-300, rgba(255,255,255,0.7))",
  noise: "var(--v4-red, #ef4444)",
};

const SCORE_AXES: Array<{
  key: keyof ConsensusItemReport["scores"];
  label: string;
  /** Hype risk is inverted — high score = bad signal. */
  invert?: boolean;
}> = [
  { key: "momentum", label: "MOMENTUM" },
  { key: "credibility", label: "CREDIBILITY" },
  { key: "crossSource", label: "CROSS-SOURCE" },
  { key: "developerAdoption", label: "DEV ADOPTION" },
  { key: "marketRelevance", label: "MARKET RELEVANCE" },
  { key: "hypeRisk", label: "HYPE RISK", invert: true },
];

function clamp01_100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function scoreBarColor(value: number, invert: boolean): string {
  if (invert) {
    return value >= 60 ? "var(--v4-red, #ef4444)" : "var(--v4-money, #22c55e)";
  }
  return value >= 60 ? "var(--v4-money, #22c55e)" : "var(--v4-acc, #ff5e1a)";
}

export async function WhyTrendingExpander({
  fullName,
}: WhyTrendingExpanderProps): Promise<JSX.Element | null> {
  // Refresh the consensus-verdicts data-store entry. The 30s rate-limit +
  // in-flight dedupe inside createPayloadReader makes this effectively free
  // when /consensus has already warmed the cache.
  await refreshConsensusVerdictsFromStore();

  const report = getConsensusItemReport(fullName);

  // No report → analyst hasn't covered this repo, OR the payload is past
  // the 48h stale-hide gate. Either way: render nothing. Honors the
  // "no publicly stale batches" rule end-to-end.
  if (!report) return null;

  // Generator footer label. Reads whatever the payload exposes — works
  // against both the current "kimi" | "template" union and the
  // "kimi" | "nanogpt" | "template" union once L1 PR #3172 lands.
  const payload = getConsensusVerdictsPayload();
  const generatorLabel = (() => {
    const gen = payload.generator;
    if (gen === "kimi") return "Kimi-K2";
    // The current `ConsensusVerdictsPayload["generator"]` union is
    // 'kimi' | 'template'. L1 PR #3172 widens it to include 'nanogpt'
    // but hasn't merged — accept the string at runtime without a type
    // cast that would blow up against today's union.
    if (typeof gen === "string" && gen === ("nanogpt" as string)) {
      return "NanoGPT (Kimi-K2)";
    }
    return "deterministic template";
  })();

  return (
    <details
      className="repo-why-expander"
      aria-label="AI verdict — why this repo is trending"
    >
      <summary>
        <span className="rwe-num">{"//"}</span>
        <span className="rwe-title">AI verdict — why this is trending</span>
        <span
          className="rwe-badge"
          style={{ color: VERDICT_COLOR[report.verdict] }}
        >
          {VERDICT_LABEL[report.verdict]}
        </span>
        <span className="rwe-conf">confidence {Math.round(report.confidence)}%</span>
      </summary>

      <div className="rwe-stack">
        {/* Summary — top line, prose */}
        {report.summary ? (
          <p className="rwe-summary">{report.summary}</p>
        ) : null}

        {/* Why now */}
        {report.whyNow ? (
          <section className="rwe-section">
            <div className="rwe-eyebrow">{"// WHY NOW"}</div>
            <p className="rwe-prose">{report.whyNow}</p>
          </section>
        ) : null}

        {/* Contrarian — small + italic */}
        {report.contrarian ? (
          <section className="rwe-section">
            <div className="rwe-eyebrow">{"// CONTRARIAN VIEW"}</div>
            <p className="rwe-contrarian">{report.contrarian}</p>
          </section>
        ) : null}

        {/* 6-axis scores */}
        <section className="rwe-section">
          <div className="rwe-eyebrow">{"// SIGNAL BREAKDOWN · 0–100"}</div>
          <ul className="rwe-scores">
            {SCORE_AXES.map(({ key, label, invert }) => {
              const value = clamp01_100(report.scores[key]);
              const fill = scoreBarColor(value, Boolean(invert));
              return (
                <li className="rwe-score" key={key}>
                  <div className="rwe-score-head">
                    <span className="rwe-score-label">{label}</span>
                    <span className="rwe-score-value">{Math.round(value)}</span>
                  </div>
                  <span
                    className="rwe-bar"
                    role="img"
                    aria-label={`${label} score ${Math.round(value)} out of 100`}
                  >
                    <i style={{ width: `${value}%`, background: fill }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Evidence bullets */}
        {report.evidence.length > 0 ? (
          <section className="rwe-section">
            <div className="rwe-eyebrow">{"// EVIDENCE"}</div>
            <ul className="rwe-evidence">
              {report.evidence.map((bullet, i) => (
                // Evidence strings come from the analyst payload — they are
                // free-form prose, not stable IDs. Index keys are safe here
                // because the list is server-rendered once per ISR cycle
                // and never reordered.
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* What to do — CTA */}
        {report.whatToDoDetail ? (
          <section className="rwe-cta">
            <div className="rwe-cta-head">
              <span className="rwe-eyebrow">{"// WHAT TO DO"}</span>
              <span
                className="rwe-cta-action"
                style={{ color: VERDICT_COLOR[report.verdict] }}
              >
                {ACTION_LABEL[report.whatToDo]}
              </span>
            </div>
            <p className="rwe-prose">{report.whatToDoDetail}</p>
          </section>
        ) : null}

        {/* Footer — generator + refresh cadence */}
        <p className="rwe-footer">
          Generated by {generatorLabel}. Refresh every hour.
        </p>
      </div>

      <style>{`
        .repo-why-expander {
          border: 1px solid var(--v4-line-100, var(--v3-line-100, rgba(255,255,255,0.08)));
          border-left: 3px solid var(--v4-acc, var(--v3-acc, #ff5e1a));
          border-radius: 3px;
          background: var(--v4-bg-050, var(--v3-bg-050, rgba(255,255,255,0.025)));
        }
        .repo-why-expander > summary {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          font-family: var(--v4-mono, var(--font-geist-mono, ui-monospace, monospace));
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--v4-ink-300, var(--v3-ink-300, rgba(255,255,255,0.7)));
          list-style: none;
        }
        .repo-why-expander > summary::-webkit-details-marker { display: none; }
        .repo-why-expander > summary::before {
          content: "▶";
          display: inline-block;
          font-size: 9px;
          color: var(--v4-ink-400, var(--v3-ink-400));
          transition: transform 120ms;
        }
        .repo-why-expander[open] > summary::before { transform: rotate(90deg); }
        .repo-why-expander .rwe-num {
          color: var(--v4-acc, var(--v3-acc, #ffcb05));
          font-weight: 700;
        }
        .repo-why-expander .rwe-title {
          color: var(--v4-ink-100, var(--v3-ink-100, #fff));
          flex: 1;
        }
        .repo-why-expander .rwe-badge {
          font-weight: 700;
          letter-spacing: 0.14em;
        }
        .repo-why-expander .rwe-conf {
          color: var(--v4-ink-400, var(--v3-ink-400));
          font-size: 10px;
        }
        .rwe-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 14px 16px 16px;
          border-top: 1px solid var(--v4-line-100, var(--v3-line-100, rgba(255,255,255,0.08)));
        }
        .rwe-summary {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
          color: var(--v4-ink-100, var(--v3-ink-100, #fff));
        }
        .rwe-section { display: flex; flex-direction: column; gap: 6px; }
        .rwe-eyebrow {
          font-family: var(--v4-mono, ui-monospace, monospace);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--v4-ink-400, var(--v3-ink-400, rgba(255,255,255,0.6)));
        }
        .rwe-prose {
          margin: 0;
          font-size: 13px;
          line-height: 1.55;
          color: var(--v4-ink-200, var(--v3-ink-200, rgba(255,255,255,0.85)));
        }
        .rwe-contrarian {
          margin: 0;
          font-size: 12px;
          line-height: 1.5;
          font-style: italic;
          color: var(--v4-ink-300, var(--v3-ink-300, rgba(255,255,255,0.7)));
        }
        .rwe-scores {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
          gap: 10px 14px;
        }
        .rwe-score-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 4px;
        }
        .rwe-score-label {
          font-family: var(--v4-mono, ui-monospace, monospace);
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--v4-ink-300, var(--v3-ink-300));
        }
        .rwe-score-value {
          font-variant-numeric: tabular-nums;
          font-size: 12px;
          color: var(--v4-ink-100, var(--v3-ink-100, #fff));
          font-weight: 600;
        }
        .rwe-bar {
          display: block;
          height: 3px;
          background: var(--v4-bg-200, var(--v3-bg-200, rgba(255,255,255,0.1)));
        }
        .rwe-bar > i {
          display: block;
          height: 100%;
          min-width: 1px;
        }
        .rwe-evidence {
          margin: 0;
          padding-left: 18px;
          font-size: 13px;
          line-height: 1.55;
          color: var(--v4-ink-200, var(--v3-ink-200));
        }
        .rwe-evidence > li { margin-bottom: 2px; }
        .rwe-cta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid var(--v4-line-200, var(--v3-line-200, rgba(255,255,255,0.12)));
          background: var(--v4-bg-100, var(--v3-bg-100, rgba(255,255,255,0.04)));
        }
        .rwe-cta-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
        }
        .rwe-cta-action {
          font-family: var(--v4-mono, ui-monospace, monospace);
          font-size: 11px;
          letter-spacing: 0.14em;
          font-weight: 700;
        }
        .rwe-footer {
          margin: 0;
          font-family: var(--v4-mono, ui-monospace, monospace);
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--v4-ink-400, var(--v3-ink-400, rgba(255,255,255,0.55)));
        }
      `}</style>
    </details>
  );
}

export default WhyTrendingExpander;
