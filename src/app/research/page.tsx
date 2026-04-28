// /research - Research signal terminal.
//
// Live sources:
//   - Hugging Face trending models.
//   - arXiv recent papers for cs.AI / cs.CL / cs.LG.
//
// Server component. Pulls fresh payloads from the data store on each render via
// refreshResearchSignalsFromStore(), which rate-limits Redis reads internally.

import type { Metadata } from "next";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Heart,
  Microscope,
} from "lucide-react";
import {
  getArxivRecent,
  getHuggingFaceTrending,
  refreshResearchSignalsFromStore,
} from "@/lib/research-signals";
import { BarcodeTicker, MonoLabel, TerminalBar } from "@/components/v2";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research - TrendingRepo",
  description:
    "Hugging Face trending models and arXiv cs.AI / cs.CL / cs.LG recent papers, with cross-links to tracked GitHub repos.",
  alternates: { canonical: "/research" },
};

const HF_TOP = 30;
const ARXIV_TOP = 30;

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default async function ResearchPage() {
  await refreshResearchSignalsFromStore();
  const hf = getHuggingFaceTrending();
  const arxiv = getArxivRecent();

  const hfModels = hf?.models?.slice(0, HF_TOP) ?? [];
  const papers = arxiv?.papers?.slice(0, ARXIV_TOP) ?? [];
  const linkedPapers = papers.filter((p) => p.linkedRepos.length > 0).length;
  const cold = hfModels.length === 0 && papers.length === 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="v2-frame overflow-hidden mb-4">
          <TerminalBar
            label="// RESEARCH - HF + ARXIV"
            status={`${hfModels.length} HF - ${papers.length} ARXIV - ${
              cold ? "COLD" : "LIVE"
            }`}
            live={!cold}
          />
          <BarcodeTicker
            count={140}
            height={12}
            seed={hfModels.length + papers.length || 88}
          />
        </div>

        <header className="mb-6 border-b border-[var(--v2-line-std)] pb-6 space-y-3">
          <MonoLabel
            index="04"
            name="RESEARCH"
            hint="HF - ARXIV"
            tone="muted"
          />
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wider">
              RESEARCH
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// huggingface trending + arxiv cs.ai/cl/lg"}
            </span>
          </div>
          <p className="text-sm text-text-secondary max-w-2xl">
            Top trending models on Hugging Face and recent papers in arXiv&apos;s
            cs.AI / cs.CL / cs.LG categories. Papers that cite a GitHub repo we
            already track surface a cross-link chip.
          </p>
          <p className="text-xs text-text-tertiary">
            HF fetched {timeAgo(hf?.fetchedAt)} ago - arXiv fetched{" "}
            {timeAgo(arxiv?.fetchedAt)} ago - {linkedPapers}/{papers.length}{" "}
            papers link to tracked repos
          </p>
        </header>

        {cold ? (
          <ColdState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-accent-green mb-3">
                {"// huggingface trending"}
              </h2>
              <ul className="space-y-2">
                {hfModels.map((model) => (
                  <li
                    key={model.id}
                    className="rounded-md border border-border-primary bg-bg-secondary/40 p-3 hover:border-accent-green/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <a
                        href={model.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-text-primary hover:text-accent-green truncate"
                      >
                        <span className="text-text-tertiary mr-2">
                          #{model.rank}
                        </span>
                        {model.id}
                      </a>
                      <span className="text-xs text-text-tertiary shrink-0">
                        score {formatNum(model.trendingScore)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        {formatNum(model.downloads)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        {formatNum(model.likes)}
                      </span>
                      {model.pipelineTag && (
                        <span className="text-accent-green">
                          {model.pipelineTag}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-accent-green mb-3">
                {"// arxiv recent (cs.ai/cl/lg)"}
              </h2>
              <ul className="space-y-2">
                {papers.map((paper) => (
                  <li
                    key={paper.arxivId}
                    className="rounded-md border border-border-primary bg-bg-secondary/40 p-3 hover:border-accent-green/50 transition-colors"
                  >
                    <a
                      href={paper.absUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-text-primary hover:text-accent-green leading-snug"
                    >
                      {paper.title}
                    </a>
                    <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary flex-wrap">
                      <span className="text-text-tertiary">
                        {paper.arxivId}
                      </span>
                      {paper.primaryCategory && (
                        <span className="text-accent-green">
                          {paper.primaryCategory}
                        </span>
                      )}
                      {paper.publishedAt && (
                        <span>{timeAgo(paper.publishedAt)} ago</span>
                      )}
                      <span className="truncate">
                        {paper.authors.slice(0, 3).join(", ")}
                        {paper.authors.length > 3
                          ? ` +${paper.authors.length - 3}`
                          : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                      {paper.pdfUrl && (
                        <a
                          href={paper.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-text-tertiary hover:text-accent-green"
                        >
                          <FileText className="w-3 h-3" />
                          pdf
                        </a>
                      )}
                      <a
                        href={paper.absUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-text-tertiary hover:text-accent-green"
                      >
                        <ExternalLink className="w-3 h-3" />
                        abs
                      </a>
                      {paper.linkedRepos.map((repo) => (
                        <Link
                          key={repo.fullName}
                          href={`/repo/${repo.fullName}`}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
                        >
                          <GitBranch className="w-3 h-3" />
                          {repo.fullName}
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        <p className="mt-6 text-xs text-text-tertiary">
          See also:{" "}
          <Link href="/breakouts" className="text-accent-green hover:underline">
            Cross-Signal Breakouts
          </Link>{" "}
          - GitHub + Reddit + HN + Bluesky agreement layer.
        </p>
      </div>
    </main>
  );
}

function ColdState() {
  return (
    <section className="rounded-md border border-dashed border-border-primary bg-bg-secondary/40 p-8">
      <div className="flex items-center gap-3 mb-4">
        <Microscope className="w-5 h-5 text-accent-green shrink-0" />
        <h2 className="text-lg font-bold uppercase tracking-wider text-accent-green">
          {"// cold start"}
        </h2>
      </div>
      <p className="text-sm text-text-secondary">
        No research signals in the cache yet. The collectors run every 3h via
        GitHub Actions; the next run will populate this page.
      </p>
    </section>
  );
}
