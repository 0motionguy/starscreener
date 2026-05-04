// /papers — V4 SourceFeedTemplate consumer.
//
// Domain-scored arXiv paper feed (cs.AI / cs.CL / cs.LG). Shares the
// `@/lib/arxiv` data lib with /arxiv/trending — same scorer pipeline,
// same Redis payload (`arxiv-recent` + `arxiv-enriched`). The /papers
// route is the public-facing surface; /arxiv/trending is the source-
// scoped twin. Template provides PageHead + KpiBand snapshot + list slot;
// PaperFeed table renders inside the list slot.

import type { Metadata } from "next";
import {
  getArxivPapersTrending,
  getArxivRecentFile,
  refreshArxivFromStore,
  type ArxivPaperTrending,
} from "@/lib/arxiv";
import { TerminalFeedTable, type FeedColumn } from "@/components/feed/TerminalFeedTable";
import { repoLogoUrl } from "@/lib/logos";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Trending AI Papers",
  description:
    "Domain-scored arXiv papers across cs.AI / cs.CL / cs.LG with linked-repo momentum, citation velocity, and cross-source mentions.",
  alternates: { canonical: "/papers" },
  openGraph: {
    title: "Trending AI Papers — TrendingRepo",
    description: "Domain-scored arXiv papers with repo momentum and citation velocity.",
    url: "/papers",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending AI Papers — TrendingRepo",
    description: "Domain-scored arXiv papers with repo momentum and citation velocity.",
  },
};
export const revalidate = 1800; // 30 min

const ARXIV_VIOLET = "var(--v4-violet)";
const ARXIV_VIOLET_RAW = "#a78bfa"; // fallback for SVG/canvas accents

function formatAgeDays(days: number): string {
  if (!Number.isFinite(days)) return "—";
  if (days < 1) return "<1d";
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function formatAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return "—";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function PapersPage() {
  await refreshArxivFromStore();
  const file = getArxivRecentFile();
  const papers = getArxivPapersTrending(100);
  const allPapers = file.papers ?? [];
  const cold = allPapers.length === 0;

  if (cold) {
    return (
      <main className="home-surface">
        <SourceFeedTemplate
          crumb={
            <>
              <b>AX</b> · TERMINAL · /PAPERS
            </>
          }
          title="Papers · trending"
          lede="arXiv papers (cs.AI / cs.CL / cs.LG) ranked by domain-scored momentum. Citation velocity from Semantic Scholar, social mentions from HN + Reddit, repo-linked papers boosted by GitHub momentum."
        />
        <ColdState />
      </main>
    );
  }

  // KpiBand inputs.
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 86_400_000;
  const newThisWeek = allPapers.filter((p) => {
    const t = Date.parse(p.publishedAt);
    return Number.isFinite(t) && t >= sevenDaysAgoMs;
  }).length;
  const ghLinkedCount = allPapers.filter(
    (p) => Array.isArray(p.linkedRepos) && p.linkedRepos.length > 0,
  ).length;
  const topCitations = papers.reduce(
    (m, p) => Math.max(m, p.primaryMetric?.value ?? 0),
    0,
  );

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>AX</b> · TERMINAL · /PAPERS
          </>
        }
        title="Papers · trending"
        lede="arXiv papers (cs.AI / cs.CL / cs.LG) ranked by domain-scored momentum. Citation velocity from Semantic Scholar, social mentions from HN + Reddit, repo-linked papers boosted by GitHub momentum."
        clock={
          <>
            <span className="big">{formatClock(file.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label="LIVE · 30M" />
            <FreshnessBadge source="mcp" lastUpdatedAt={file.fetchedAt} />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "PAPERS",
                value: allPapers.length.toLocaleString("en-US"),
                sub: "tracked now",
                pip: "var(--v4-violet)",
              },
              {
                label: "TOP CITATIONS",
                value: compactNumber(topCitations),
                sub: "peak in feed",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "NEW THIS WEEK",
                value: newThisWeek.toLocaleString("en-US"),
                sub: "last 7d",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: ghLinkedCount.toLocaleString("en-US"),
                sub: "repos in feed",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Paper feed · top 100 by momentum"
        list={<PaperFeed papers={papers} />}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Feed table
// ---------------------------------------------------------------------------

function PaperFeed({ papers }: { papers: ArxivPaperTrending[] }) {
  const columns: FeedColumn<ArxivPaperTrending>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? ARXIV_VIOLET : "var(--v4-ink-400)" }}
        >
          {String(i + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      id: "title",
      header: "Paper",
      render: (p) => {
        const linkedRepo = p.linkedRepos?.[0]?.fullName ?? null;
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <a
              href={p.absUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[13px] font-medium transition-colors hover:text-[color:var(--v4-acc)]"
              style={{ color: "var(--v4-ink-100)" }}
              title={p.title}
            >
              {p.title}
            </a>
            <span
              className="truncate text-[10.5px]"
              style={{ color: "var(--v4-ink-400)" }}
              title={p.authors?.join(", ")}
            >
              {formatAuthors(p.authors ?? [])}
              {linkedRepo ? (
                <span
                  className="v2-mono ml-2 px-1.5 py-0.5 text-[9px] tracking-[0.14em] uppercase"
                  style={{
                    border: "1px solid var(--v4-line-200)",
                    background: "var(--v4-bg-100)",
                    color: "var(--v4-ink-300)",
                    borderRadius: 2,
                  }}
                  title={`Linked repo: ${linkedRepo}`}
                >
                  ↳ {linkedRepo}
                </span>
              ) : null}
            </span>
          </div>
        );
      },
    },
    {
      id: "category",
      header: "Cat",
      width: "80px",
      hideBelow: "sm",
      render: (p) => {
        const cat = p.primaryCategory;
        if (!cat) return <span style={{ color: "var(--v4-ink-500)" }}>—</span>;
        return (
          <span
            className="v2-mono inline-block px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase"
            style={{
              border: "1px solid var(--v4-line-200)",
              background: "var(--v4-bg-100)",
              color: "var(--v4-ink-300)",
              borderRadius: 2,
            }}
          >
            {cat}
          </span>
        );
      },
    },
    {
      id: "citations",
      header: "Cits",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (p) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{
            color:
              (p.primaryMetric?.value ?? 0) > 0
                ? "var(--v4-ink-100)"
                : "var(--v4-ink-500)",
          }}
          title="Citation count (Semantic Scholar)"
        >
          {compactNumber(p.primaryMetric?.value ?? 0)}
        </span>
      ),
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "120px",
      hideBelow: "md",
      render: (p) => <MomentumBar value={p.momentum} accent={ARXIV_VIOLET_RAW} />,
    },
    {
      id: "age",
      header: "Age",
      width: "60px",
      align: "right",
      hideBelow: "md",
      render: (p) => (
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: "var(--v4-ink-400)" }}
        >
          {formatAgeDays(p.daysSincePublished)}
        </span>
      ),
    },
  ];

  // Use the raw hex for the table accent — TerminalFeedTable expects a
  // concrete color string (not a CSS var token).
  return (
    <TerminalFeedTable
      rows={papers}
      columns={columns}
      rowKey={(p) => p.arxivId}
      accent={ARXIV_VIOLET_RAW}
      caption="arXiv papers ranked by domain-scored momentum"
    />
  );
}

function MomentumBar({ value, accent }: { value: number; accent: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1"
        style={{
          height: 6,
          background: "var(--v4-bg-100)",
          borderRadius: 1,
          overflow: "hidden",
          minWidth: 40,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: accent,
            boxShadow: pct > 0 ? `0 0 6px ${accent}66` : undefined,
          }}
        />
      </div>
      <span
        className="font-mono text-[10px] tabular-nums shrink-0"
        style={{ color: "var(--v4-ink-300)", width: 24, textAlign: "right" }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cold-state fallback
// ---------------------------------------------------------------------------

function ColdState() {
  return (
    <section
      style={{
        padding: 32,
        background: "var(--v4-bg-025)",
        border: "1px dashed var(--v4-line-100)",
        borderRadius: 2,
      }}
    >
      <h2
        className="v2-mono"
        style={{
          color: ARXIV_VIOLET,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {"// no data yet"}
      </h2>
      <p style={{ marginTop: 12, maxWidth: "32rem", fontSize: 13, color: "var(--v4-ink-300)" }}>
        The arXiv scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:arxiv</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/arxiv-recent.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}
