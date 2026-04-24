// TrendingRepo — Home (Phase 3 / P9)
//
// Server component. Reads the derived Repo[] from committed JSON
// (data/trending.json + data/deltas.json) and hands the top 80 by
// starsDelta24h to TerminalLayout. The in-memory pipeline store is empty
// on cold Vercel Lambdas, so reading from JSON is the only way to serve
// non-empty repo cards consistently.
//
// Title/description metadata is inherited from the root layout template
// — no per-page override here so the canonical "TrendingRepo — {tagline}"
// formula stays source-of-truth in one place (src/lib/seo.ts).

import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import { BubbleMap } from "@/components/terminal/BubbleMap";
import { MomentumHeadline } from "@/components/home/MomentumHeadline";
import { HomeCtaRow } from "@/components/home/HomeCtaRow";
import { HomeEmptyState } from "@/components/home/HomeEmptyState";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

// ISR: data/*.json only changes when the GHA scrape commits new trending
// data, so serving the homepage from a 30-minute edge cache is safe. Drops
// per-request getDerivedRepos() re-runs (15 passes × ~2.4k rows + full
// scoreBatch) from ~300 ms to a lookup. `force-dynamic` is no longer needed.
export const revalidate = 1800;

export default async function HomePage() {
  const repos = getDerivedRepos();

  // Cold lambda / broken data file → show a branded empty state instead
  // of the generic "no repos match filters" inner message. Preserves the
  // h1 + FAQ for SEO so Google doesn't see a dead page on a degraded
  // deploy, but skips the bubble map + featured row which would look
  // empty/broken.
  if (repos.length === 0) {
    return (
      <>
        <section className="px-4 sm:px-6 pt-4 pb-2">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-text-primary leading-tight">
            TrendingRepo is a trend radar that surfaces breakout open-source repos
            from live social signals.
          </h1>
        </section>
        <HomeEmptyState />
      </>
    );
  }

  // Top-20 repos (by 24h star delta) feed the ItemList JSON-LD below.
  // Canonical list of what's "on this page" for search crawlers.
  const itemListTop = [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 20);

  return (
    <>
      {/* H1 + Claims — definition-lead opener with authoritative citations */}
      <section className="px-4 sm:px-6 pt-4 pb-2 space-y-3">
        <MomentumHeadline repos={repos} lastFetchedAt={lastFetchedAt} />
        <h1 className="font-display text-xl sm:text-2xl font-bold text-text-primary leading-tight">
          TrendingRepo is a trend radar that surfaces breakout open-source repos
          from live social signals.
        </h1>
        <p className="mt-2 text-sm text-text-secondary max-w-3xl">
          GitHub now hosts{" "}
          <a
            href="https://github.blog/news-insights/company-news/github-now-has-100-million-developers/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-brand/50 hover:decoration-brand text-text-primary"
          >
            over 100 million developers
          </a>{" "}
          — the fastest-growing open-source ecosystem in history. We ingest
          GitHub, Reddit, Hacker News, ProductHunt, Bluesky, and dev.to every 20
          minutes, score momentum across 15 categories, and surface the movers
          before they plateau.{" "}
          <a
            href="https://en.wikipedia.org/wiki/Open-source_software"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-brand/50 hover:decoration-brand text-text-primary"
          >
            Open-source software
          </a>{" "}
          now powers 96% of the world&apos;s codebases, per{" "}
          <a
            href="https://www.synopsys.com/software-integrity/resources/analyst-reports/open-source-security-risk-analysis.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-brand/50 hover:decoration-brand text-text-primary"
          >
            Synopsys 2024
          </a>
          .
        </p>
        <HomeCtaRow />
      </section>

      <TerminalLayout
        repos={repos}
        filterBarVariant="full"
        showFeatured
        featuredCount={8}
        heading={
          <>
            {/* BubbleMap is illegible on phones (~108px tall in viewBox 1200x360
                — bubble labels collapse to dots). Hide on <md and let the
                terminal cards drive the mobile narrative. */}
            <div className="hidden md:block">
              <BubbleMap repos={repos} limit={220} />
            </div>
          </>
        }
      />

      {/* FAQ section with JSON-LD */}
      <section id="faq" className="px-4 sm:px-6 py-8 max-w-3xl">
        <h2 className="font-display text-xl font-bold text-text-primary mb-4">
          Frequently asked questions
        </h2>
        <div className="flex flex-col gap-3">
          <details className="group rounded-lg border border-border-primary bg-bg-secondary open:border-brand/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary select-none">
              What data sources does TrendingRepo track?
              <span className="ml-2 text-text-tertiary group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-text-secondary">
              GitHub (stars, forks, releases, contributors), Reddit (r/programming,
              r/webdev, r/MachineLearning), Hacker News front page,
              ProductHunt daily launches, Bluesky tech feeds, and dev.to trending
              articles. Every signal is timestamped and scored for momentum.
            </div>
          </details>

          <details className="group rounded-lg border border-border-primary bg-bg-secondary open:border-brand/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary select-none">
              How is the momentum score calculated?
              <span className="ml-2 text-text-tertiary group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-text-secondary">
              A composite 0–100 score based on 24h / 7d / 30d star velocity, fork
              growth, contributor churn, commit freshness, release cadence, and
              anti-spam dampening. Breakouts are flagged when velocity exceeds
              rolling baselines by 2σ.
            </div>
          </details>

          <details className="group rounded-lg border border-border-primary bg-bg-secondary open:border-brand/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary select-none">
              Can I query TrendingRepo from a terminal or agent?
              <span className="ml-2 text-text-tertiary group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-text-secondary">
              Yes — three interfaces: a zero-dependency CLI (Node 18+), an MCP
              server for Claude / any agent, and a Portal v0.1 endpoint. All
              three hit the same live pipeline, so results never drift.
            </div>
          </details>

          <details className="group rounded-lg border border-border-primary bg-bg-secondary open:border-brand/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary select-none">
              How often is the data refreshed?
              <span className="ml-2 text-text-tertiary group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-text-secondary">
              Scrapers run every 20 minutes via GitHub Actions. The homepage is
              ISR-cached for 30 minutes, so the edge serves a static hit while
              the pipeline ingests fresh signals in the background.
            </div>
          </details>

          <details className="group rounded-lg border border-border-primary bg-bg-secondary open:border-brand/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary select-none">
              Is there an API?
              <span className="ml-2 text-text-tertiary group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-text-secondary">
              Yes — public REST endpoints under /api/repos with filtering,
              sorting, and pagination. The Portal v0.1 manifest exposes the same
              tools over structured JSON-RPC. See the{" "}
              <a
                href="/portal/docs"
                className="underline decoration-brand/50 hover:decoration-brand text-text-primary"
              >
                Portal docs
              </a>{" "}
              for schemas and examples.
            </div>
          </details>

          <details className="group rounded-lg border border-border-primary bg-bg-secondary open:border-brand/30">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary select-none">
              How do I submit my own repo?
              <span className="ml-2 text-text-tertiary group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-text-secondary">
              Click the &quot;Drop repo&quot; button in the header or visit{" "}
              <a
                href="/submit"
                className="underline decoration-brand/50 hover:decoration-brand text-text-primary"
              >
                /submit
              </a>
              . Any GitHub repo is eligible — the pipeline scores it on the next
              ingest cycle.
            </div>
          </details>
        </div>
      </section>

      {/* FAQPage JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What data sources does TrendingRepo track?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "GitHub (stars, forks, releases, contributors), Reddit (r/programming, r/webdev, r/MachineLearning), Hacker News front page, ProductHunt daily launches, Bluesky tech feeds, and dev.to trending articles. Every signal is timestamped and scored for momentum.",
                },
              },
              {
                "@type": "Question",
                name: "How is the momentum score calculated?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "A composite 0–100 score based on 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness, release cadence, and anti-spam dampening. Breakouts are flagged when velocity exceeds rolling baselines by 2σ.",
                },
              },
              {
                "@type": "Question",
                name: "Can I query TrendingRepo from a terminal or agent?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes — three interfaces: a zero-dependency CLI (Node 18+), an MCP server for Claude / any agent, and a Portal v0.1 endpoint. All three hit the same live pipeline, so results never drift.",
                },
              },
              {
                "@type": "Question",
                name: "How often is the data refreshed?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Scrapers run every 20 minutes via GitHub Actions. The homepage is ISR-cached for 30 minutes, so the edge serves a static hit while the pipeline ingests fresh signals in the background.",
                },
              },
              {
                "@type": "Question",
                name: "Is there an API?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes — public REST endpoints under /api/repos with filtering, sorting, and pagination. The Portal v0.1 manifest exposes the same tools over structured JSON-RPC.",
                },
              },
              {
                "@type": "Question",
                name: "How do I submit my own repo?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Click the 'Drop repo' button in the header or visit /submit. Any GitHub repo is eligible — the pipeline scores it on the next ingest cycle.",
                },
              },
            ],
          }),
        }}
      />

      {/* CollectionPage + ItemList JSON-LD — tells crawlers this page is
          a curated list of trending repos and enumerates the top 20 so
          structured-data rich results can pick them up. Complements the
          Organization + FAQPage schemas already emitted elsewhere. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#homepage`,
            name: `${SITE_NAME} — trending open-source repos`,
            url: absoluteUrl("/"),
            isPartOf: {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
            },
            dateModified: lastFetchedAt,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: itemListTop.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: itemListTop.map((r, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/repo/${r.owner}/${r.name}`),
                name: r.fullName,
              })),
            },
          }),
        }}
      />
    </>
  );
}
