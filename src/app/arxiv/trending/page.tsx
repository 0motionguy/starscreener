// /arxiv/trending â€” domain-scored arXiv paper feed.
//
// Reads `arxiv-recent` Redis payload (populated by scripts/scrape-arxiv.mjs)
// through the new domain pipeline:
//   arxivScorer.computeRaw() â†’ computeCrossDomainMomentum() â†’ top 100
//
// MVP CAVEAT: citation velocity / social mentions / HF adoption come from
// a future enrichment job (Chunk C). Until that ships, ranking is driven
// almost entirely by recency + (where present) linked-repo momentum.
// A banner above the table makes that explicit to users.

import type { Metadata } from "next";
import {
  getArxivPapersTrending,
  getArxivRecentFile,
  refreshArxivFromStore,
  type ArxivPaperTrending,
} from "@/lib/arxiv";
import {
  applyCompactV1,
  compactNumber,
} from "@/components/news/newsTopMetrics";
import {
  TerminalFeedTable,
  type FeedColumn,
} from "@/components/feed/TerminalFeedTable";
import { WindowedFeedTable } from "@/components/feed/WindowedFeedTable";
import { EntityLogo } from "@/components/ui/EntityLogo";
import { repoLogoUrl } from "@/lib/logos";
import { SourceFeedTemplate } from "@/components/source-feed/SourceFeedTemplate";

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

export const metadata: Metadata = {
  title: "Trending arXiv Papers",
  description:
    "Top arXiv papers by recency + linked-repo momentum across cs.AI / cs.CL / cs.LG. Source-scoped twin of the /papers feed.",
  alternates: { canonical: "/arxiv/trending" },
  openGraph: {
    title: "Trending arXiv Papers — TrendingRepo",
    description: "arXiv papers by recency and linked-repo momentum.",
    url: "/arxiv/trending",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending arXiv Papers — TrendingRepo",
    description: "arXiv papers by recency and linked-repo momentum.",
  },
};

function formatAgeDays(days: number): string {
  if (!Number.isFinite(days)) return "â€”";
  if (days < 1) return "<1d";
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function formatAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return "â€”";
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
    <SourceFeedTemplate
      cold={cold}
      coldState={<ColdState />}
      header={{
        routeTitle: "ARXIV - TRENDING",
        liveLabel: "LIVE - 30M",
        eyebrow: "// ARXIV - CS.AI / CS.CL / CS.LG",
        meta: [
          {
            label: "TRACKED",
            value: (file.papers?.length ?? 0).toLocaleString("en-US"),
          },
          {
            label: "REPO LINKED",
            value: String(file.linkedRepoCount ?? 0),
          },
        ],
        ...buildArxivHeader(file.papers ?? [], papers),
        accent: ARXIV_ACCENT,
        caption: [
          "// LAYOUT compact-v1",
          "- DOMAIN arxiv",
          "- SCORER recency + linkedRepoMomentum",
        ],
      }}
    >
      <EnrichmentBanner />
      <ArxivPaperFeed papers={papers} />
    </SourceFeedTemplate>
  );
}

// AUDIT-2026-05-04 follow-up: 24h / 7d / 30d toggle on /arxiv/trending.
// Each ArxivPaperTrending carries `daysSincePublished` (computed by the
// scorer from `publishedAt`). Papers are already sorted by domain
// momentum descending — we just slice by age window and let the client
// toggle which of the three pre-sorted lists to render. Default 7d
// matches arXiv's normal "this week" reading rhythm.
function WindowedArxivFeed({ papers }: { papers: ArxivPaperTrending[] }) {
  const inWindow = (maxDays: number) =>
    papers.filter((p) => {
      const d = p.daysSincePublished;
      return typeof d === "number" && d <= maxDays;
    });
  const w24h = inWindow(1);
  const w7d = inWindow(7);
  const w30d = inWindow(30);
  return (
    <WindowedFeedTable
      count24h={w24h.length}
      count7d={w7d.length}
      count30d={w30d.length}
      table24h={<ArxivPaperFeed papers={w24h} />}
      table7d={<ArxivPaperFeed papers={w7d} />}
      table30d={<ArxivPaperFeed papers={w30d} />}
      defaultWindow="7d"
    />
  );
}

// ---------------------------------------------------------------------------
// Enrichment banner â€” explicit MVP-scope notice
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
      <span style={{ color: ARXIV_ACCENT_BAR }}>{"// HEADS-UP Â· "}</span>
      Citation + social-mention enrichment lands in the next iteration.
      Current ranking blends linked-repo momentum + cold-start recency.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header builder
// ---------------------------------------------------------------------------

function buildArxivHeader(
  raws: { primaryCategory: string | null; linkedRepos: { fullName: string }[] }[],
  scored: ArxivPaperTrending[],
) {
  const linkedCount = raws.filter((r) => (r.linkedRepos?.length ?? 0) > 0).length;
  const totalAuthors = scored.reduce(
    (s, p) => s + ((p.authors?.length ?? 0) || 0),
    0,
  );

  // Primary-category distribution.
  const catCounts = new Map<string, number>();
  for (const r of raws) {
    const cat = r.primaryCategory ?? "uncategorised";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const catBars = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, count], i) => ({
      label: cat.toUpperCase(),
      value: count,
      valueLabel: count.toLocaleString("en-US"),
      color: ["#B22234", "#F472B6", "#3AD6C5", "#A78BFA", "#34D399", "#FBBF24"][i % 6],
    }));

  // Linked-repo distribution (top 6 repos by paper count).
  const repoCounts = new Map<string, number>();
  for (const r of raws) {
    for (const lr of r.linkedRepos ?? []) {
      repoCounts.set(lr.fullName, (repoCounts.get(lr.fullName) ?? 0) + 1);
    }
  }
  const repoBars = Array.from(repoCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([repo, count]) => ({
      label: repo.toUpperCase(),
      value: count,
      valueLabel: count.toLocaleString("en-US"),
      color: ARXIV_ACCENT_BAR,
      logoUrl: repoLogoUrl(repo),
      logoName: repo,
    }));

  const cards = applyCompactV1(
    [
      {
        variant: "snapshot",
        title: "// SNAPSHOT Â· NOW",
        rightLabel: `${raws.length} PAPERS`,
        label: "PAPERS TRACKED",
        value: compactNumber(raws.length),
        hint: `${catCounts.size} CATEGORIES`,
        rows: [
          { label: "REPO LINKED", value: compactNumber(linkedCount), tone: "accent" },
          { label: "TOTAL AUTHORS", value: compactNumber(totalAuthors) },
          { label: "TOP MOMENTUM", value: String(Math.round(scored[0]?.momentum ?? 0)) },
        ],
      },
      {
        variant: "bars",
        title: "// LINKED REPOS Â· TOP 6",
        rightLabel: `${repoBars.length}`,
        bars: repoBars,
        labelWidth: 96,
        emptyText: "NO LINKED REPOS YET",
      },
      {
        variant: "bars",
        title: "// CATEGORIES Â· MIX",
        rightLabel: `TOP ${catBars.length}`,
        bars: catBars,
        labelWidth: 80,
        emptyText: "NO CATEGORIES YET",
      },
    ],
    { totalItems: raws.length },
  );

  // Hero stories â€” top 3 papers by momentum.
  const topStories = scored.slice(0, 3).map((p) => ({
    title: p.title,
    href: p.absUrl,
    external: true,
    sourceCode: "AX",
    byline: p.primaryCategory ?? undefined,
    scoreLabel: `momentum ${Math.round(p.momentum)} Â· ${p.authors?.length ?? 0} authors`,
    ageHours: Math.max(0, p.daysSincePublished * 24),
    logoUrl: repoLogoUrl(p.linkedRepos?.[0]?.fullName ?? null),
    logoName: p.linkedRepos?.[0]?.fullName ?? p.primaryCategory ?? p.title,
  }));

  return { cards, topStories };
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
          style={{ color: i < 10 ? ARXIV_ACCENT_BAR : "var(--v4-ink-400)" }}
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
        // AUDIT-2026-05-04: arxiv rows had no logo column; closes the
        // "non-repo entities have no first-class images" gap. Show linked
        // repo owner's avatar when present, otherwise EntityLogo's
        // monogram fallback (deterministic hue derived from the title).
        return (
          <div className="flex min-w-0 items-start gap-2">
            <EntityLogo
              src={linkedRepo ? repoLogoUrl(linkedRepo) : null}
              name={linkedRepo ?? p.title}
              size={20}
              shape="square"
              alt=""
            />
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
                  â†³ {linkedRepo}
                </span>
              ) : null}
            </span>
            </div>
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
        if (!cat) return <span style={{ color: "var(--v4-ink-500)" }}>â€”</span>;
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
          title="Citation count (enrichment lands in next iteration)"
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
      <p
        className="mt-3 max-w-xl text-sm"
        style={{ color: "var(--v4-ink-300)" }}
      >
        The arXiv scraper hasn&apos;t run yet. Run{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>npm run scrape:arxiv</code>{" "}
        locally to populate{" "}
        <code style={{ color: "var(--v4-ink-100)" }}>data/arxiv-recent.json</code>
        , then refresh this page.
      </p>
    </section>
  );
}
