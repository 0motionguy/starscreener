// /papers — full arXiv trending paper feed.
//
// Renders data/arxiv-trending.json, produced by scripts/scrape-arxiv.mjs.
// Mirrors /lobsters' shape: V3 page header → V3 metric strip → list.
// No leaderboard aside in MVP — paper↔repo cross-link surface is Phase B.

import type { Metadata } from "next";
import {
  arxivAbsHref,
  getArxivTopPapers,
  getArxivTrendingFile,
  refreshArxivTrendingFromStore,
  type ArxivPaper,
} from "@/lib/arxiv-trending";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildArxivHeader } from "@/components/news/newsTopMetrics";

const ARXIV_ACCENT = "rgba(178, 31, 36, 0.85)"; // arXiv crimson, slightly muted
const ARXIV_RED = "#b21f24";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "TrendingRepo — arXiv Trending",
  description:
    "Recent arXiv papers across cs.AI / cs.LG / cs.CL / cs.CV / cs.SE / stat.ML, ranked by recency and surfaced alongside trending GitHub repositories.",
};

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "-";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

function authorLine(authors: string[]): string {
  if (!authors || authors.length === 0) return "—";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return authors.join(", ");
  return `${authors[0]}, ${authors[1]} +${authors.length - 2}`;
}

export default async function PapersPage() {
  await refreshArxivTrendingFromStore();
  const file = getArxivTrendingFile();
  const papers = getArxivTopPapers(50);
  const allPapers = file.papers ?? [];
  const cold = allPapers.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* V3 page header — mono eyebrow + title + tight subtitle. */}
        <header
          className="mb-5 pb-4 border-b"
          style={{ borderColor: "var(--v3-line-100)" }}
        >
          <div
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// ACADEMIC PAPERS · CS.AI / CS.LG / CS.CL / CS.CV / CS.SE / STAT.ML"}
          </div>
          <h1
            className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2"
            style={{ color: "var(--v3-ink-000)" }}
          >
            <span style={{ color: ARXIV_RED }} aria-hidden>
              arXiv
            </span>
            / TRENDING PAPERS
          </h1>
          <p
            className="mt-2 text-[13px] leading-relaxed max-w-3xl"
            style={{ color: "var(--v3-ink-300)" }}
          >
            Recent arXiv papers across the ML / CS / NLP / CV / SE / stat.ML
            categories. Papers are ranked by recency over the last{" "}
            {file.windowDays ?? 14} days. arXiv has no native engagement
            signal, so this surface is honest about that — order is age, not
            popularity.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 top header — 3 charts + 3 hero papers. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// ARXIV · TRENDING PAPERS"
                status={`${allPapers.length.toLocaleString("en-US")} TRACKED · ${file.windowDays ?? 14}D`}
                {...buildArxivHeader(file, getArxivTopPapers(3))}
                accent={ARXIV_ACCENT}
              />
            </div>

            <PaperFeed papers={papers} />
          </>
        )}
      </div>
    </main>
  );
}

function PaperFeed({ papers }: { papers: ArxivPaper[] }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      {/* CATS column dropped per design audit — single int 1-5 per paper
          isn't worth a column; cross-listing is implicit in the category
          chip + abstract. Title now gets a 1.6fr ratio so long arXiv
          titles stop truncating at md. */}
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1.6fr)_120px_60px] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>TITLE / AUTHORS</div>
        <div>CATEGORY</div>
        <div className="text-right">AGE</div>
      </div>
      <div className="grid md:hidden grid-cols-[32px_minmax(0,1fr)_56px] gap-2 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>TITLE</div>
        <div className="text-right">AGE</div>
      </div>
      <ul>
        {papers.map((paper, index) => (
          <PaperRow key={paper.arxivId} rank={index + 1} paper={paper} />
        ))}
      </ul>
    </section>
  );
}

function PaperRow({ rank, paper }: { rank: number; paper: ArxivPaper }) {
  const absHref = paper.absUrl || arxivAbsHref(paper.arxivId);
  const isTopTen = rank <= 10;
  const primary = (paper.primaryCategory || "—").toLowerCase();

  return (
    <li className="border-b border-border-primary/40 last:border-b-0">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1.6fr)_120px_60px] gap-3 items-center px-3 min-h-[48px] py-2 hover:bg-bg-card-hover transition-colors">
        <div
          className="text-xs tabular-nums font-semibold"
          style={isTopTen ? { color: ARXIV_RED } : undefined}
        >
          #{rank}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <a
              href={absHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-text-primary hover:text-accent-green truncate"
              title={paper.title}
            >
              {paper.title}
            </a>
            {paper.pdfUrl ? (
              <a
                href={paper.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[10px] text-text-tertiary hover:text-accent-green"
                title="PDF"
              >
                pdf
              </a>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary truncate">
            {authorLine(paper.authors ?? [])}
          </div>
        </div>
        <div className="min-w-0">
          <span
            className="inline-flex items-center max-w-full truncate text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary"
            title={primary}
          >
            {primary}
          </span>
        </div>
        <div className="text-right text-xs tabular-nums text-text-tertiary">
          {formatAgeHours(paper.ageHours)}
        </div>
      </div>

      <div className="grid md:hidden grid-cols-[32px_minmax(0,1fr)_56px] gap-2 items-center px-3 py-2 min-h-[58px] hover:bg-bg-card-hover transition-colors">
        <div
          className="text-xs tabular-nums font-semibold"
          style={isTopTen ? { color: ARXIV_RED } : undefined}
        >
          #{rank}
        </div>
        <div className="min-w-0">
          <a
            href={absHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text-primary hover:text-accent-green truncate"
            title={paper.title}
          >
            {paper.title}
          </a>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-tertiary truncate">
            <span className="truncate">{authorLine(paper.authors ?? [])}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{primary}</span>
          </div>
        </div>
        <div className="text-right text-xs tabular-nums text-text-tertiary">
          {formatAgeHours(paper.ageHours)}
        </div>
      </div>
    </li>
  );
}

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: ARXIV_RED }}
      >
        {"// no arxiv data yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        The arXiv scraper has not produced data yet. Run{" "}
        <code className="text-text-primary">npm run scrape:arxiv</code>{" "}
        locally to populate{" "}
        <code className="text-text-primary">data/arxiv-trending.json</code>,
        then refresh this page.
      </p>
    </section>
  );
}
