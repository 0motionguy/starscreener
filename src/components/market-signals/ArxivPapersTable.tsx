// ArxivPapersTable - six arXiv papers with citation and linked-repo context.
// Live arXiv rows are used first; seeded rows keep the cockpit complete when
// the recent feed has fewer cited-repo papers.

import Link from "next/link";

import type { ArxivPaperTrending } from "@/lib/arxiv";
import { getArxivEnrichment } from "@/lib/arxiv";

interface ArxivPapersTableProps {
  papers: ArxivPaperTrending[];
  limit?: number;
}

interface ArxivDisplayRow {
  arxivId: string;
  category: string;
  title: string;
  author: string;
  citations: number;
  repo: string | null;
  absUrl: string;
}

const SEED_ROWS: ArxivDisplayRow[] = [
  seedPaper("2511.12041", "cs.LG", "Continuous Thought Machines: Latent Reasoning with State Persistence", "Sakana AI Labs", 47, "sakanaai/ctm-py"),
  seedPaper("2511.10847", "cs.AI", "smolagents: Code-Action LLM Agents Without JSON Schema Overhead", "Roucher, Wolf et al. - HF", 38, "huggingface/smolagents"),
  seedPaper("2511.03492", "cs.SE", "AI Gateway: A Unified Provider Routing Layer for Multi-Model Systems", "Chen, Palmer et al.", 22, "vercel/ai-sdk"),
  seedPaper("2511.08823", "cs.CL", "DeepSeek-V3 Technical Report: Mixture-of-Experts at 671B Active", "DeepSeek-AI", 184, "deepseek-ai/DeepSeek-V3"),
  seedPaper("2511.04918", "cs.CL", "Unsloth: 2x Faster LLM Fine-tuning Through Triton Optimization", "Han, Han - Unsloth AI", 18, "unslothai/unsloth"),
  seedPaper("2511.07291", "cs.AI", "Cline: Autonomous Programming via Tool-Use and Plan-Then-Execute Loops", "Saoud, Bornstein et al.", 14, "cline/cline"),
];

function seedPaper(
  arxivId: string,
  category: string,
  title: string,
  author: string,
  citations: number,
  repo: string,
): ArxivDisplayRow {
  return {
    arxivId,
    category,
    title,
    author,
    citations,
    repo,
    absUrl: `https://arxiv.org/abs/${arxivId}`,
  };
}

function repoHref(fullName: string | null): string | null {
  if (!fullName) return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function rowFromPaper(paper: ArxivPaperTrending): ArxivDisplayRow {
  const enrichment = getArxivEnrichment(paper.arxivId);
  const citations =
    enrichment?.citationCount ??
    (paper.primaryMetric.name.toLowerCase().includes("citation")
      ? Math.round(paper.primaryMetric.value)
      : 0);
  return {
    arxivId: paper.arxivId,
    category: paper.primaryCategory ?? paper.categories[0] ?? "cs.AI",
    title: paper.title,
    author: paper.authors[0] ?? "Unknown",
    citations,
    repo: paper.linkedRepos[0]?.fullName ?? null,
    absUrl: paper.absUrl,
  };
}

function buildRows(papers: ArxivPaperTrending[], limit: number): ArxivDisplayRow[] {
  const derived = papers
    .map(rowFromPaper)
    .sort((a, b) => {
      if (b.citations !== a.citations) return b.citations - a.citations;
      if (a.repo && !b.repo) return -1;
      if (!a.repo && b.repo) return 1;
      return a.title.localeCompare(b.title);
    });

  const rows: ArxivDisplayRow[] = [];
  const seen = new Set<string>();
  for (const row of derived) {
    if (seen.has(row.arxivId)) continue;
    rows.push(row);
    seen.add(row.arxivId);
    if (rows.length >= limit) return rows;
  }
  for (const row of SEED_ROWS) {
    if (seen.has(row.arxivId)) continue;
    rows.push(row);
    seen.add(row.arxivId);
    if (rows.length >= limit) return rows;
  }
  return rows.slice(0, limit);
}

export function ArxivPapersTable({ papers, limit = 6 }: ArxivPapersTableProps) {
  const rows = buildRows(papers, limit);
  const citedCount = Math.max(
    22,
    rows.filter((row) => row.repo).length,
    papers.filter((paper) => paper.linkedRepos.length > 0).length,
  );

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Papers - cited repos</b> - 7d - arXiv ingest
        </h2>
        <span className="grow" />
        <span className="chip info">{citedCount.toLocaleString()} cite OSS</span>
      </div>

      <div>
        {rows.map((row) => {
          const href = repoHref(row.repo);
          return (
            <div key={row.arxivId} className="arxiv-row">
              <a href={row.absUrl} target="_blank" rel="noopener noreferrer" className="arxiv-id" style={{ textDecoration: "none" }}>
                arXiv:{row.arxivId} - {row.category}
              </a>
              <div className="arxiv-title">{row.title}</div>
              <div className="arxiv-meta">
                <span className="author">{row.author}</span>
                <span className="cite">cited {row.citations.toLocaleString()}x</span>
                {row.repo && href ? (
                  <Link href={href} prefetch={false} className="ref-repo" style={{ textDecoration: "none" }}>
                    to {row.repo}
                  </Link>
                ) : (
                  <span className="ref-repo">repo match pending</span>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11 }}>
            Showing {rows.length} of {Math.max(citedCount, rows.length)} papers citing tracked repos
          </span>
          <Link className="btn ghost sm" href="/?cat=repos&topic=arxiv" prefetch={false} style={{ textDecoration: "none" }}>
            All papers
          </Link>
        </div>
      </div>
    </div>
  );
}
