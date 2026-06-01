// ArxivPapersTable — arXiv papers with citation and linked-repo context.
// Real data only. No SEED_ROWS with fabricated 2511.* papers. If the feed
// has fewer than `limit` cited papers, the table renders shorter (or empty)
// rather than padding with invented entries.

import Link from "next/link";

import type { ArxivPaperTrending } from "@/lib/arxiv";
import { getArxivEnrichment } from "@/lib/arxiv";

interface ArxivPapersTableProps {
  papers: ArxivPaperTrending[];
  limit?: number;
  disabled?: boolean;
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
  return rows;
}

export function ArxivPapersTable({
  papers,
  limit = 6,
  disabled = false,
}: ArxivPapersTableProps) {
  const rows = buildRows(papers, limit);
  // Honest count: real cited papers, no floor.
  const citedCount = papers.filter((paper) => paper.linkedRepos.length > 0).length;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">
          <b>Papers - cited repos</b> - 7d - arXiv ingest
        </h2>
        <span className="grow" />
        <span className={disabled ? "chip warn" : "chip info"}>
          {disabled ? "archived" : `${citedCount.toLocaleString()} cite OSS`}
        </span>
      </div>

      {disabled ? (
        <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-faint)" }}>
          arXiv is archived on this surface. No active production producer is
          wired, so it is not counted as a live market signal.
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-faint)" }}>
          No arXiv papers citing tracked repos right now — feed is quiet.
        </div>
      ) : (
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
            Showing {rows.length} of {citedCount} papers citing tracked repos
          </span>
          <Link className="btn ghost sm" href="/?cat=repos&topic=arxiv" prefetch={false} style={{ textDecoration: "none" }}>
            All papers
          </Link>
        </div>
      </div>
      )}
    </div>
  );
}
