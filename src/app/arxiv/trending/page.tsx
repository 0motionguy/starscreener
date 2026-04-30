// /arxiv/trending — V4 SourceFeedTemplate consumer.
//
// Reads `arxiv-recent` Redis payload (populated by scripts/scrape-arxiv.mjs)
// through the domain pipeline:
//   arxivScorer.computeRaw() → computeCrossDomainMomentum() → top 100
//
// MVP CAVEAT: citation velocity / social mentions / HF adoption come from
// a future enrichment job (Chunk C). Until that ships, ranking is driven
// almost entirely by recency + (where present) linked-repo momentum.
// A banner above the table makes that explicit to users.

import {
  getArxivPapersTrending,
  getArxivRecentFile,
  refreshArxivFromStore,
  type ArxivPaperTrending,
} from "@/lib/arxiv";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";

// V4 (CORPUS) primitives.
import { SourceFeedTemplate } from "@/components/templates/SourceFeedTemplate";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

// arXiv brand: Cornell crimson. No `--v4-src-arxiv` token exists yet, so
// hardcode the brand color rather than fall back to the generic `--v4-red`
// (which is reserved for negative-delta semantics).
const ARXIV_BRAND = "#B22234";

export const dynamic = "force-static";
export const revalidate = 1800; // 30 min

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

function formatClock(iso: string | undefined): string {
  if (!iso) return "warming";
  return new Date(iso).toISOString().slice(11, 19);
}

export default async function ArxivTrendingPage() {
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
              <b>AX</b> · TERMINAL · /ARXIV
            </>
          }
          title="arXiv · trending"
          lede="Domain-scored arXiv paper feed across cs.AI / cs.CL / cs.LG. Recency + linked-repo momentum drive the cold-start ranking; citation + social-mention enrichment lands next."
        />
        <ColdState />
      </main>
    );
  }

  const topMomentum = Math.round(papers[0]?.momentum ?? 0);
  const linkedRepoCount = file.linkedRepoCount ?? 0;
  const newThisWeek = allPapers.filter((p) => {
    const t = Date.parse(p.publishedAt);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t <= 7 * 86_400_000;
  }).length;

  return (
    <main className="home-surface">
      <SourceFeedTemplate
        crumb={
          <>
            <b>AX</b> · TERMINAL · /ARXIV
          </>
        }
        title="arXiv · trending"
        lede="Domain-scored arXiv paper feed across cs.AI / cs.CL / cs.LG. Recency + linked-repo momentum drive the cold-start ranking; citation + social-mention enrichment lands next."
        clock={
          <>
            <span className="big">{formatClock(file.fetchedAt)}</span>
            <span className="muted">UTC · SCRAPED</span>
            <LiveDot label="LIVE · 30M" />
          </>
        }
        snapshot={
          <KpiBand
            cells={[
              {
                label: "PAPERS",
                value: allPapers.length.toLocaleString("en-US"),
                sub: "tracked corpus",
                pip: ARXIV_BRAND,
              },
              {
                label: "TOP MOMENTUM",
                value: topMomentum,
                sub: "0–100 percentile",
                tone: "acc",
                pip: "var(--v4-acc)",
              },
              {
                label: "NEW THIS WEEK",
                value: newThisWeek.toLocaleString("en-US"),
                sub: "published ≤7d",
                tone: "money",
                pip: "var(--v4-money)",
              },
              {
                label: "GH-LINKED",
                value: linkedRepoCount.toLocaleString("en-US"),
                sub: "papers w/ repo",
                pip: "var(--v4-blue)",
              },
            ]}
          />
        }
        listEyebrow="Paper feed · top 100 by domain momentum"
        list={
          <>
            <EnrichmentBanner />
            <ArxivPaperFeed papers={papers} />
          </>
        }
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Enrichment banner — explicit MVP-scope notice
// ---------------------------------------------------------------------------

function EnrichmentBanner() {
  return (
    <div
      className="mb-4 px-3 py-2 v2-mono text-[10.5px] tracking-[0.14em]"
      style={{
        border: "1px dashed var(--v4-line-200)",
        background: "var(--v4-bg-025)",
        color: "var(--v4-ink-300)",
        borderRadius: 2,
      }}
    >
      <span style={{ color: ARXIV_BRAND }}>{"// HEADS-UP · "}</span>
      Citation + social-mention enrichment lands in the next iteration.
      Current ranking blends linked-repo momentum + cold-start recency.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed table
// ---------------------------------------------------------------------------

function ArxivPaperFeed({ papers }: { papers: ArxivPaperTrending[] }) {
  const columns: FeedColumn<ArxivPaperTrending>[] = [
    {
      id: "rank",
      header: "#",
      width: "44px",
      render: (_, i) => (
        <span
          className="font-mono text-[12px] tabular-nums font-semibold"
          style={{ color: i < 10 ? ARXIV_BRAND : "var(--v4-ink-400)" }}
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
      render: (p) => {
        const v = p.primaryMetric?.value ?? 0;
        return (
          <span
            className="font-mono text-[12px] tabular-nums"
            style={{ color: v > 0 ? "var(--v4-ink-100)" : "var(--v4-ink-500)" }}
            title="Citation count (enrichment lands in next iteration)"
          >
            {v.toLocaleString("en-US")}
          </span>
        );
      },
    },
    {
      id: "momentum",
      header: "Momentum",
      width: "120px",
      hideBelow: "md",
      render: (p) => <MomentumBar value={p.momentum} accent={ARXIV_BRAND} />,
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

  return (
    <TerminalFeedTable
      rows={papers}
      columns={columns}
      rowKey={(p) => p.arxivId}
      accent={ARXIV_BRAND}
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
// Cold state
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
          color: ARXIV_BRAND,
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
