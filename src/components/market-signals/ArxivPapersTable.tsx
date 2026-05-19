// ArxivPapersTable — most-trending arXiv papers with their citation
// counts, lead author, and linked GitHub repo (when the paper-to-repo
// resolver found a match during ingestion).

import Link from "next/link";

import type { ArxivPaperTrending } from "@/lib/arxiv";
import { getArxivEnrichment } from "@/lib/arxiv";

interface ArxivPapersTableProps {
  papers: ArxivPaperTrending[];
  limit?: number;
}

export function ArxivPapersTable({ papers, limit = 6 }: ArxivPapersTableProps) {
  const rows = papers.slice(0, limit);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--r-1)",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            // 05 · arXiv · trending papers
          </span>
          <h2
            style={{
              fontSize: 15,
              color: "var(--fg-bright)",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            Papers landing now
          </h2>
        </div>
        <span
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-faint)" }}
        >
          cited→repo overlay
        </span>
      </div>

      <div role="table" style={{ width: "100%" }}>
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: "120px minmax(0, 2fr) minmax(0, 1fr) 80px minmax(0, 1.2fr)",
            gap: 10,
            padding: "6px 8px",
            borderBottom: "1px solid var(--border-subtle)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--fg-faint)",
          }}
        >
          <span>arXiv ID</span>
          <span>Title</span>
          <span>Lead author</span>
          <span style={{ textAlign: "right" }}>Citations</span>
          <span>Linked repo</span>
        </div>
        {rows.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--fg-faint)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
          >
            No arXiv papers in the recent feed.
          </div>
        ) : (
          rows.map((p) => {
            const enrichment = getArxivEnrichment(p.arxivId);
            const citations = enrichment?.citationCount ?? 0;
            const lead = p.authors[0] ?? "—";
            const repo = p.linkedRepos[0]?.fullName ?? null;
            return (
              <div
                key={p.arxivId}
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px minmax(0, 2fr) minmax(0, 1fr) 80px minmax(0, 1.2fr)",
                  gap: 10,
                  padding: "8px 8px",
                  borderBottom: "1px solid var(--border-subtle)",
                  alignItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                <Link
                  href={p.absUrl}
                  prefetch={false}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--accent)",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  arXiv:{p.arxivId}
                </Link>
                <span
                  style={{
                    color: "var(--fg-bright)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={p.title}
                >
                  {p.title}
                </span>
                <span
                  style={{
                    color: "var(--fg-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lead}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    color: citations > 0 ? "var(--fg-bright)" : "var(--fg-faint)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {citations.toLocaleString()}
                </span>
                {repo ? (
                  <Link
                    href={`https://github.com/${repo}`}
                    prefetch={false}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--up)",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {repo}
                  </Link>
                ) : (
                  <span style={{ color: "var(--fg-faint)" }}>—</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
