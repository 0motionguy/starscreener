// /research — research-cited repos.
//
// Surfaces every GitHub repo cited in a recent arXiv abstract (the last
// 14d window from data/arxiv-trending.json). This is the "academia
// flagged this before social momentum did" signal — papers cite their
// own code repos, which are publish-day-fresh and rarely show up on
// HN/Reddit/Twitter immediately.
//
// Sister surface to /papers (the firehose). Both pages read the same
// arxiv-trending.json — /papers shows individual papers, /research
// shows the repos those papers cite, ranked by paper count.

import type { Metadata } from "next";
import { Microscope } from "lucide-react";
import {
  getResearchCitedRepos,
  getTopResearchCitedRepos,
  type ResearchCitedRepo,
  type ResearchCitedRepoPaper,
} from "@/lib/arxiv-cited-repos";
import { refreshArxivTrendingFromStore } from "@/lib/arxiv-trending";
import { NewsTopHeaderV3 } from "@/components/news/NewsTopHeaderV3";
import { buildResearchHeader } from "@/components/news/newsTopMetrics";

const RESEARCH_ACCENT = "rgba(178, 31, 36, 0.85)"; // arXiv crimson
const RESEARCH_RED = "#b21f24";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "TrendingRepo — Research-Cited Repos",
  description:
    "GitHub repositories cited in recent arXiv papers (cs.AI / cs.LG / cs.CL / cs.CV / cs.SE / stat.ML). Academia's signal before social momentum.",
};

function formatAgeHours(ageHours: number | undefined): string {
  if (ageHours === undefined || !Number.isFinite(ageHours)) return "-";
  if (ageHours < 1) return "<1h";
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  return `${Math.round(ageHours / 24)}d`;
}

export default async function ResearchPage() {
  await refreshArxivTrendingFromStore();
  const file = getResearchCitedRepos();
  const repos = getTopResearchCitedRepos(50);
  const cold = repos.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* V3 page header */}
        <header
          className="mb-5 pb-4 border-b"
          style={{ borderColor: "var(--v3-line-100)" }}
        >
          <div
            className="v2-mono mb-2 text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--v3-ink-400)" }}
          >
            {"// REPOS CITED IN ARXIV ABSTRACTS · LAST 14 DAYS"}
          </div>
          <h1
            className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2"
            style={{ color: "var(--v3-ink-000)" }}
          >
            <Microscope size={22} style={{ color: RESEARCH_RED }} aria-hidden />
            RESEARCH-CITED REPOS
          </h1>
          <p
            className="mt-2 text-[13px] leading-relaxed max-w-3xl"
            style={{ color: "var(--v3-ink-300)" }}
          >
            GitHub repos cited in recent arXiv paper abstracts across cs.AI /
            cs.LG / cs.CL / cs.CV / cs.SE / stat.ML. Researchers flag their
            code on publish-day — usually weeks before HN, Reddit, or Twitter
            notices. Ranked by paper count, then by confidence-weighted
            recency.
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <>
            {/* V3 metric strip — sister to /papers' chrome. */}
            <div className="mb-6">
              <NewsTopHeaderV3
                eyebrow="// ARXIV · RESEARCH-CITED REPOS"
                status={`${file.totalCitedRepos.toLocaleString("en-US")} REPOS · ${file.windowDays}D`}
                {...buildResearchHeader(file, getTopResearchCitedRepos(3))}
                accent={RESEARCH_ACCENT}
              />
            </div>

            <RepoFeed repos={repos} />
          </>
        )}
      </div>
    </main>
  );
}

function RepoFeed({ repos }: { repos: ResearchCitedRepo[] }) {
  return (
    <section className="border border-border-primary rounded-md bg-bg-secondary overflow-hidden">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1.4fr)_120px_60px_minmax(0,2fr)] gap-3 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>REPO</div>
        <div>TOP CAT</div>
        <div className="text-right">PAPERS</div>
        <div>LATEST CITING PAPER</div>
      </div>
      <div className="grid md:hidden grid-cols-[32px_minmax(0,1fr)_42px] gap-2 items-center px-3 h-9 border-b border-border-primary text-[10px] uppercase tracking-wider text-text-tertiary">
        <div>#</div>
        <div>REPO</div>
        <div className="text-right">P</div>
      </div>
      <ul>
        {repos.map((repo, index) => (
          <RepoRow key={repo.fullName} rank={index + 1} repo={repo} />
        ))}
      </ul>
    </section>
  );
}

function RepoRow({ rank, repo }: { rank: number; repo: ResearchCitedRepo }) {
  const isTopTen = rank <= 10;
  const githubUrl = `https://github.com/${repo.fullName}`;
  const latestPaper = repo.papers[0];

  return (
    <li className="border-b border-border-primary/40 last:border-b-0">
      <div className="hidden md:grid grid-cols-[40px_minmax(0,1.4fr)_120px_60px_minmax(0,2fr)] gap-3 items-center px-3 min-h-[52px] py-2 hover:bg-bg-card-hover transition-colors">
        <div
          className="text-xs tabular-nums font-semibold"
          style={isTopTen ? { color: RESEARCH_RED } : undefined}
        >
          #{rank}
        </div>
        <div className="min-w-0">
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-primary hover:text-accent-green truncate block"
            title={repo.fullName}
          >
            {repo.fullName}
          </a>
          {repo.papers.length > 1 ? (
            <div className="mt-0.5 text-[10px] text-text-tertiary truncate">
              cited by {repo.papers.length} papers
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <span
            className="inline-flex items-center max-w-full truncate text-[10px] px-1.5 py-0.5 rounded border border-border-primary text-text-tertiary"
            title={repo.topCategory}
          >
            {repo.topCategory.toLowerCase() || "—"}
          </span>
        </div>
        <div
          className="text-right text-xs tabular-nums font-semibold"
          style={repo.paperCount >= 2 ? { color: RESEARCH_RED } : undefined}
        >
          {repo.paperCount}
        </div>
        <div className="min-w-0">
          {latestPaper ? <PaperInline paper={latestPaper} /> : null}
        </div>
      </div>

      <div className="grid md:hidden grid-cols-[32px_minmax(0,1fr)_42px] gap-2 items-center px-3 py-2 min-h-[58px] hover:bg-bg-card-hover transition-colors">
        <div
          className="text-xs tabular-nums font-semibold"
          style={isTopTen ? { color: RESEARCH_RED } : undefined}
        >
          #{rank}
        </div>
        <div className="min-w-0">
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text-primary hover:text-accent-green truncate"
            title={repo.fullName}
          >
            {repo.fullName}
          </a>
          <div className="mt-0.5 text-[10px] text-text-tertiary truncate">
            {latestPaper?.title ?? ""}
          </div>
        </div>
        <div
          className="text-right text-xs tabular-nums font-semibold"
          style={repo.paperCount >= 2 ? { color: RESEARCH_RED } : undefined}
        >
          {repo.paperCount}
        </div>
      </div>
    </li>
  );
}

function PaperInline({ paper }: { paper: ResearchCitedRepoPaper }) {
  return (
    <a
      href={paper.absUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] text-text-secondary hover:text-accent-green truncate block"
      title={paper.title}
    >
      {paper.title}
    </a>
  );
}

function ColdState() {
  return (
    <section className="border border-dashed border-border-primary rounded-md p-8 bg-bg-secondary/40">
      <h2
        className="text-lg font-bold uppercase tracking-wider"
        style={{ color: RESEARCH_RED }}
      >
        {"// no research signal yet"}
      </h2>
      <p className="mt-3 text-sm text-text-secondary max-w-xl">
        No GitHub repos cited in recent arXiv abstracts. Run{" "}
        <code className="text-text-primary">npm run scrape:arxiv</code> to
        populate <code className="text-text-primary">data/arxiv-trending.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}
