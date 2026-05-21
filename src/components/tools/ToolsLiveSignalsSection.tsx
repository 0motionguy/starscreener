import { FreshnessPill } from "@/components/shell/FreshnessPill";
import type { NewsSource } from "@/lib/news/freshness";
import { SectionEyebrow } from "./ToolCard";

interface LiveSignalRow {
  /** Display label (UPPERCASE micro-eyebrow). */
  label: string;
  /** Big numeric value, already formatted. */
  value: string;
  /** Sub-line description. */
  desc: string;
  /** Optional FreshnessPill source — keeps the row honest. */
  source: NewsSource;
  /** ISO fetchedAt that classifyFreshness consumes. */
  fetchedAt: string | null;
  /** Highlight the value in accent color when set. */
  tone?: "accent" | "up" | "default";
}

export interface ToolsLiveSignalsSectionProps {
  /** Sum of stars across every tracked repo. */
  totalStars: number;
  /** Last trending fetchedAt — drives the repos pip. */
  trendingFetchedAt: string | null;
  /** Funding stats — totals + this-week count. */
  fundingSignalCount: number;
  fundingThisWeekCount: number;
  fundingTotalUsd: number | null;
  fundingFetchedAt: string | null;
  /** Agent commerce stats — total + x402 + MCP. */
  agentCommerceTotal: number;
  agentCommerceX402: number;
  agentCommerceMcp: number;
  agentCommerceFetchedAt: string | null;
  /** HuggingFace surface coverage. */
  hfModels: number;
  hfDatasets: number;
  hfSpaces: number;
  hfFetchedAt: string | null;
  /** Research signals: arxiv papers + cited repos. */
  arxivPapers: number;
  arxivCitedRepos: number;
  arxivFetchedAt: string | null;
  /** NPM tracked packages. */
  npmPackages: number;
  npmFetchedAt: string | null;
  /** Twitter — repos with mentions in the rolling window. */
  twitterRepos: number;
  twitterFetchedAt: string | null;
  /** Scanner health summary. */
  scannersOk: number;
  scannersDegraded: number;
  scannersStale: number;
  scannersTotal: number;
}

function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

function fmtUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function ToolsLiveSignalsSection(props: ToolsLiveSignalsSectionProps) {
  const {
    totalStars,
    trendingFetchedAt,
    fundingSignalCount,
    fundingThisWeekCount,
    fundingTotalUsd,
    fundingFetchedAt,
    agentCommerceTotal,
    agentCommerceX402,
    agentCommerceMcp,
    agentCommerceFetchedAt,
    hfModels,
    hfDatasets,
    hfSpaces,
    hfFetchedAt,
    arxivPapers,
    arxivCitedRepos,
    arxivFetchedAt,
    npmPackages,
    npmFetchedAt,
    twitterRepos,
    twitterFetchedAt,
    scannersOk,
    scannersDegraded,
    scannersStale,
    scannersTotal,
  } = props;

  const rows: LiveSignalRow[] = [
    {
      label: "Tracked-repo stars",
      value: fmtCount(totalStars),
      desc: "Sum of stars across every tracked repo (deltas.json)",
      source: "repos",
      fetchedAt: trendingFetchedAt,
      tone: "accent",
    },
    {
      label: "Funding signals",
      value: fmtCount(fundingSignalCount),
      desc: `${fundingThisWeekCount} this week — ${fmtUsd(fundingTotalUsd)} total raised`,
      source: "funding",
      fetchedAt: fundingFetchedAt,
    },
    {
      label: "Agent-commerce entities",
      value: fmtCount(agentCommerceTotal),
      desc: `${agentCommerceX402} x402-enabled — ${agentCommerceMcp} MCP servers`,
      source: "agent_commerce",
      fetchedAt: agentCommerceFetchedAt,
    },
    {
      label: "HuggingFace coverage",
      value: fmtCount(hfModels + hfDatasets + hfSpaces),
      desc: `${fmtCount(hfModels)} models — ${fmtCount(hfDatasets)} datasets — ${fmtCount(hfSpaces)} spaces`,
      source: "huggingface",
      fetchedAt: hfFetchedAt,
    },
    {
      label: "Research signals",
      value: fmtCount(arxivPapers),
      desc: `${arxivCitedRepos} papers cite a tracked repo`,
      source: "arxiv",
      fetchedAt: arxivFetchedAt,
    },
    {
      label: "NPM packages",
      value: fmtCount(npmPackages),
      desc: "Tracked across repos with package.json metadata",
      source: "npm",
      fetchedAt: npmFetchedAt,
    },
    {
      label: "Twitter — repos w/ mentions",
      value: fmtCount(twitterRepos),
      desc: "Distinct repos with tweet mentions in window",
      source: "twitter",
      fetchedAt: twitterFetchedAt,
    },
    {
      label: "Scanner health",
      value: `${scannersOk}/${scannersTotal}`,
      desc: `${scannersDegraded} degraded — ${scannersStale} stale`,
      source: "repos",
      fetchedAt: trendingFetchedAt,
      tone:
        scannersStale > 0
          ? "default"
          : scannersDegraded > 0
            ? "default"
            : "up",
    },
  ];

  const okPct = scannersTotal === 0 ? 0 : Math.round((scannersOk / scannersTotal) * 100);

  return (
    <section>
      <SectionEyebrow
        num="01"
        title="Live signals"
        meta={
          <>
            Backend coverage — <b>{okPct}%</b> scanners healthy
          </>
        }
      />
      <div className="tools-live-signals fade-up">
        {rows.map((row) => (
          <div className="ls-cell" key={row.label}>
            <div className="ls-head">
              <span className="ls-label">{row.label}</span>
              <FreshnessPill source={row.source} fetchedAt={row.fetchedAt} />
            </div>
            <div className={`ls-value ${row.tone === "accent" ? "lava" : row.tone === "up" ? "up" : ""}`}>
              {row.value}
            </div>
            <div className="ls-desc">{row.desc}</div>
          </div>
        ))}
      </div>
      <style>{`
        .tools-live-signals {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1px;
          background: var(--border-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: var(--r-1);
          margin: 0 0 22px;
        }
        @media (max-width: 1100px) {
          .tools-live-signals { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .tools-live-signals { grid-template-columns: 1fr; }
        }
        .tools-live-signals .ls-cell {
          background: var(--surface);
          padding: 13px 15px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tools-live-signals .ls-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 2px;
        }
        .tools-live-signals .ls-label {
          font-family: var(--font-mono);
          font-size: 9.5px;
          color: var(--fg-faint);
          text-transform: uppercase;
          letter-spacing: 0.10em;
        }
        .tools-live-signals .ls-value {
          font-family: var(--font-mono);
          font-size: 22px;
          color: var(--fg-bright);
          font-variant-numeric: tabular-nums;
          font-weight: 500;
          line-height: 1.15;
        }
        .tools-live-signals .ls-value.lava { color: var(--accent); }
        .tools-live-signals .ls-value.up { color: var(--up); }
        .tools-live-signals .ls-desc {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--fg-muted);
          line-height: 1.35;
        }
      `}</style>
    </section>
  );
}
