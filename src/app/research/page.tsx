// /research — Research signal terminal.
//
// Two live sources, side-by-side:
//   - HuggingFace trending models (top 100 by HF's own trendingScore).
//   - arXiv recent papers (cs.AI / cs.CL / cs.LG, last 100 by submitted).
//
// Server component. Pulls fresh payloads from the data-store on each
// render via refreshResearchSignalsFromStore() (rate-limited internally
// to one Redis read per 30s per Lambda).
//
// Cross-link layer: arXiv abstracts that mention a tracked GitHub repo
// surface as a small repo chip on the paper card. Powered by the
// scripts/_github-repo-links extractor running inside the collector.

import type { Metadata } from "next";
import Link from "next/link";
import { Microscope, Download, Heart, FileText, ExternalLink, GitBranch } from "lucide-react";
import {
  getArxivRecent,
  getHuggingFaceTrending,
  refreshResearchSignalsFromStore,
} from "@/lib/research-signals";
import { TerminalBar, MonoLabel, BarcodeTicker } from "@/components/v2";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Research - TrendingRepo",
  description:
    "HuggingFace trending models + arXiv cs.AI / cs.CL / cs.LG recent papers, with cross-links to tracked GitHub repos.",
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
            label="// RESEARCH · HF + ARXIV"
            status={`${hfModels.length} HF · ${papers.length} ARXIV · ${cold ? "COLD" : "LIVE"}`}
            live={!cold}
          />
          <BarcodeTicker count={140} height={12} seed={hfModels.length + papers.length || 88} />
        </div>

        <header className="mb-6 border-b border-[var(--v2-line-std)] pb-6 space-y-3">
          <MonoLabel index="04" name="RESEARCH" hint="HF · ARXIV" tone="muted" />
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wider">
              RESEARCH
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// huggingface trending + arxiv cs.ai/cl/lg"}
            </span>
          </div>
          <p className="text-sm text-text-secondary max-w-2xl">
            Top trending models on HuggingFace and recent papers in arXiv&apos;s
            cs.AI / cs.CL / cs.LG categories. Papers that cite a GitHub repo we
            already track surface a cross-link chip.
          </p>
          <p className="text-xs text-text-tertiary">
            HF fetched {timeAgo(hf?.fetchedAt)} ago · arXiv fetched{" "}
            {timeAgo(arxiv?.fetchedAt)} ago · {linkedPapers}/{papers.length} papers
            link to tracked repos
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
                {hfModels.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-md border border-border-primary bg-bg-secondary/40 p-3 hover:border-accent-green/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-text-primary hover:text-accent-green truncate"
                      >
                        <span className="text-text-tertiary mr-2">#{m.rank}</span>
                        {m.id}
                      </a>
                      <span className="text-xs text-text-tertiary shrink-0">
                        score {formatNum(m.trendingScore)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" /> {formatNum(m.downloads)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {formatNum(m.likes)}
                      </span>
                      {m.pipelineTag && (
                        <span className="text-accent-green">{m.pipelineTag}</span>
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
                {papers.map((p) => (
                  <li
                    key={p.arxivId}
                    className="rounded-md border border-border-primary bg-bg-secondary/40 p-3 hover:border-accent-green/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <a
                        href={p.absUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-text-primary hover:text-accent-green leading-snug"
                      >
                        {p.title}
                      </a>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary flex-wrap">
                      <span className="text-text-tertiary">{p.arxivId}</span>
                      {p.primaryCategory && (
                        <span className="text-accent-green">{p.primaryCategory}</span>
                      )}
                      {p.publishedAt && (
                        <span>{timeAgo(p.publishedAt)} ago</span>
                      )}
                      <span className="truncate">
                        {p.authors.slice(0, 3).join(", ")}
                        {p.authors.length > 3 ? ` +${p.authors.length - 3}` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                      {p.pdfUrl && (
                        <a
                          href={p.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-text-tertiary hover:text-accent-green"
                        >
                          <FileText className="w-3 h-3" /> pdf
                        </a>
                      )}
                      <a
                        href={p.absUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-text-tertiary hover:text-accent-green"
                      >
                        <ExternalLink className="w-3 h-3" /> abs
                      </a>
                      {p.linkedRepos.map((r) => (
                        <Link
                          key={r.fullName}
                          href={`/repos/${encodeURIComponent(r.fullName)}`}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
                        >
                          <GitBranch className="w-3 h-3" /> {r.fullName}
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
          </Link>
          {" "}— GitHub + Reddit + HN + Bluesky agreement layer.
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
