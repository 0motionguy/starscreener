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
import {
  getSkillsSignalData,
  getMcpSignalData,
} from "@/lib/ecosystem-leaderboards";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import { BubbleMap } from "@/components/terminal/BubbleMap";
import { MomentumHeadline } from "@/components/home/MomentumHeadline";
import { HomeEmptyState } from "@/components/home/HomeEmptyState";
import { CrossSourceTriBoxes } from "@/components/home/CrossSourceTriBoxes";
import {
  MonoLabel,
  AsciiInterstitial,
  BarcodeTicker,
} from "@/components/v2";
import {
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  absoluteUrl,
  safeJsonLd,
} from "@/lib/seo";

// ISR: data/*.json only changes when the GHA scrape commits new trending
// data, so serving the homepage from a 30-minute edge cache is safe. Drops
// per-request getDerivedRepos() re-runs (15 passes × ~2.4k rows + full
// scoreBatch) from ~300 ms to a lookup. `force-dynamic` is no longer needed.
export const revalidate = 1800;

// Single source of truth for the homepage FAQ. Renders both the visible
// <details> list and the FAQPage JSON-LD below — keeping them in one array
// means structured data and rendered copy can't drift apart.
const HOMEPAGE_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "What data sources does TrendingRepo track?",
    a: "GitHub (stars, forks, releases, contributors), Reddit (r/programming, r/webdev, r/MachineLearning), Hacker News front page, ProductHunt daily launches, Bluesky tech feeds, and dev.to trending articles. Every signal is timestamped and scored for momentum.",
  },
  {
    q: "How is the momentum score calculated?",
    a: "A composite 0–100 score based on 24h / 7d / 30d star velocity, fork growth, contributor churn, commit freshness, release cadence, and anti-spam dampening. Breakouts are flagged when velocity exceeds rolling baselines by 2σ.",
  },
  {
    q: "Can I query TrendingRepo from a terminal or agent?",
    a: "Yes — three interfaces: a zero-dependency CLI (Node 18+), an MCP server for Claude / any agent, and a Portal v0.1 endpoint. All three hit the same live pipeline, so results never drift.",
  },
  {
    q: "How often is the data refreshed?",
    a: "Scrapers run every 3 hours via GitHub Actions. The homepage is ISR-cached for 30 minutes, so the edge serves a static hit while the pipeline ingests fresh signals in the background.",
  },
  {
    q: "Is there an API?",
    a: "Yes — public REST endpoints under /api/repos with filtering, sorting, and pagination. The Portal v0.1 manifest exposes the same tools over structured JSON-RPC.",
  },
  {
    q: "How do I submit my own repo?",
    a: "Click the 'Drop repo' button in the header or visit /submit. Any GitHub repo is eligible — the pipeline scores it on the next ingest cycle.",
  },
];

export default async function HomePage() {
  const repos = getDerivedRepos();
  // Pull skills + mcp ecosystem signals so the cross-source tri-box can
  // surface their respective top movers alongside repo gainers. Both
  // helpers are Redis-backed with internal rate-limiting; safe to call
  // every render.
  const [skillsData, mcpData] = await Promise.all([
    getSkillsSignalData(),
    getMcpSignalData(),
  ]);

  // Cold lambda / broken data file → show a branded empty state instead
  // of the generic "no repos match filters" inner message. Preserves the
  // h1 + FAQ for SEO so Google doesn't see a dead page on a degraded
  // deploy, but skips the bubble map + featured row which would look
  // empty/broken.
  if (repos.length === 0) {
    return (
      <>
        {/* sr-only H1 keeps SEO + structured-data flow intact while the
            visible hero is dropped on degraded-data branches too. */}
        <h1 className="sr-only">
          TrendingRepo is a trend radar that surfaces breakout open-source
          repos from live social signals.
        </h1>
        <HomeEmptyState />
      </>
    );
  }

  // Top-20 repos (by 24h star delta) feed the ItemList JSON-LD below.
  // Canonical list of what's "on this page" for search crawlers.
  const itemListTop = [...repos]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 20);

  // V2 chrome — operator-mono date stamp (e.g. "04.27") used on terminal bars.
  const monoDate = new Date(lastFetchedAt).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <>
      {/* Compact operator eyebrow + CTAs — replaces the legacy H1/blurb hero.
          The sidebar already names the page; the visit-by-visit ROI lives
          in the MomentumHeadline (top mover + breakout count) and the
          three-pane CrossSourceTriBoxes directly below. SEO-bearing H1 is
          preserved as visually-hidden so structured data + screen-reader
          flow stay intact. */}
      <section className="px-4 sm:px-6 pt-4 pb-2 space-y-3">
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-[var(--v2-line-std)]">
          <MonoLabel
            index="01"
            name="TRENDINGREPO"
            hint={monoDate}
            tone="muted"
          />
          <span className="v2-mono text-[10px] text-text-tertiary hidden sm:inline-flex items-center gap-2">
            <span className="v2-live-dot" aria-hidden />
            {repos.length} REPOS · LIVE
          </span>
        </div>

        <h1 className="sr-only">
          TrendingRepo is a trend radar that surfaces breakout open-source
          repos from live social signals.
        </h1>

        <MomentumHeadline repos={repos} lastFetchedAt={lastFetchedAt} />

        {/* V2 barcode ticker — "live data flow" accent. */}
        <div className="pt-2">
          <BarcodeTicker count={96} height={14} seed={repos.length} />
        </div>
      </section>

      <CrossSourceTriBoxes
        repos={repos}
        skills={skillsData.combined.items}
        mcp={mcpData.board.items}
      />

      <TerminalLayout
        repos={repos}
        filterBarVariant="full"
        showFeatured
        featuredCount={8}
        heading={
          <div className="space-y-3">
            {/* BubbleMap now ships its own v2-card + TerminalBar chrome
                internally (Signal Radar surface). We only enforce the
                <md hide here — the bubble map is illegible on phones
                (~108px tall in viewBox 1200x360, labels collapse to
                dots). On <md the terminal cards drive the narrative. */}
            <div className="hidden md:block">
              <BubbleMap repos={repos} limit={220} />
            </div>
          </div>
        }
      />

      {/* V2 ASCII interstitial — divider before the FAQ section */}
      <section
        className="px-4 sm:px-6 py-6 hidden md:block"
        aria-hidden
      >
        <AsciiInterstitial rows={5} cols={120} seed={repos.length} />
      </section>

      {/* Operator-grade FAQ — terminal feel, V3 hairlines, [+]/[-] toggles.
          Source-of-truth is HOMEPAGE_FAQ above so the JSON-LD below can't
          drift from the visible answers. */}
      <section id="faq" className="px-4 sm:px-6 py-8">
        <div className="max-w-3xl space-y-3">
          <MonoLabel index="02" name="FAQ" hint="OPERATOR-LEVEL" tone="muted" />

          <div
            className="v3-faq-list border-y"
            style={{ borderColor: "var(--v3-line-100)" }}
          >
            <style>{`
              .v3-faq-list .toggle-open { display: none; }
              .v3-faq-list details[open] .toggle-closed { display: none; }
              .v3-faq-list details[open] .toggle-open { display: inline; }
              .v3-faq-list details[open] > summary {
                color: var(--v3-ink-100);
                background: var(--v3-bg-050);
              }
            `}</style>
            {HOMEPAGE_FAQ.map(({ q, a }, i) => (
              <details
                key={q}
                className="group block border-t first:border-t-0 transition-colors"
                style={{ borderColor: "var(--v3-line-100)" }}
              >
                <summary
                  className="v2-mono flex cursor-pointer select-none items-center justify-between gap-4 px-4 py-3.5 text-[11px] tracking-[0.12em] transition-colors hover:bg-[var(--v3-bg-050)]"
                  style={{ color: "var(--v3-ink-200)" }}
                >
                  <span className="flex items-baseline gap-3 min-w-0">
                    <span
                      className="tabular-nums shrink-0"
                      style={{ color: "var(--v3-ink-400)" }}
                      aria-hidden
                    >
                      Q.{String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate uppercase">{q}</span>
                  </span>
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ color: "var(--v3-acc)" }}
                    aria-hidden
                  >
                    <span className="toggle-closed">[+]</span>
                    <span className="toggle-open">[−]</span>
                  </span>
                </summary>
                <div
                  className="px-4 pb-4 pt-1 text-[13px] leading-relaxed"
                  style={{ color: "var(--v3-ink-300)" }}
                >
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* WebSite JSON-LD — gives Google a SearchAction so the sitelinks
          search box can render against /search?q={query}. Pairs with
          the Organization + BreadcrumbList blocks below. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#website`,
            name: SITE_NAME,
            alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
            description: SITE_DESCRIPTION,
            url: SITE_URL,
            inLanguage: "en-US",
            publisher: {
              "@type": "Organization",
              "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            },
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE_URL.replace(
                  /\/+$/,
                  "",
                )}/search?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />

      {/* Organization JSON-LD — establishes brand identity (name, logo, url)
          so search engines can attach knowledge-panel metadata. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: {
              "@type": "ImageObject",
              url: absoluteUrl("/icon.svg"),
            },
            description: SITE_DESCRIPTION,
          }),
        }}
      />

      {/* BreadcrumbList JSON-LD — single-item breadcrumb for the homepage
          so crawlers can connect this URL to the canonical home anchor. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: absoluteUrl("/"),
              },
            ],
          }),
        }}
      />

      {/* FAQPage JSON-LD — derived from the same array as the visible FAQ
          above so structured data and the rendered Q/A can never drift. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: HOMEPAGE_FAQ.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
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
          __html: safeJsonLd({
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

      {/* Dataset JSON-LD — declares the catalog itself as a Schema.org
          Dataset so AI/GEO surfaces (Google Dataset Search, Perplexity,
          ChatGPT, Claude) can recognise this site as a structured data
          source rather than a generic blog. Lists the variables we
          measure and the JSON / Markdown / XML distribution endpoints. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Dataset",
            "@id": `${SITE_URL.replace(/\/+$/, "")}/#dataset`,
            name: `${SITE_NAME} — open-source repo trend dataset`,
            alternateName: "TrendingRepo Catalog",
            description:
              "Aggregated repo metadata + cross-source signals (GitHub, Reddit, Hacker News, Bluesky, dev.to, ProductHunt, Lobsters) for the open-source ecosystem. Updated every 3 hours.",
            url: SITE_URL,
            sameAs: [SITE_URL],
            inLanguage: "en-US",
            isAccessibleForFree: true,
            keywords: [
              "open source",
              "github",
              "trending repos",
              "developer tools",
              "AI agents",
              "MCP",
              "LLM",
              "DevTools",
            ],
            creator: {
              "@type": "Organization",
              "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            },
            publisher: {
              "@type": "Organization",
              "@id": `${SITE_URL.replace(/\/+$/, "")}/#organization`,
            },
            // Metadata only — repos retain their own license.
            license: "https://creativecommons.org/publicdomain/zero/1.0/",
            variableMeasured: [
              {
                "@type": "PropertyValue",
                name: "stars",
                description: "GitHub star count",
              },
              {
                "@type": "PropertyValue",
                name: "starsDelta24h",
                description: "24-hour star delta",
              },
              {
                "@type": "PropertyValue",
                name: "starsDelta7d",
                description: "7-day star delta",
              },
              {
                "@type": "PropertyValue",
                name: "momentumScore",
                description: "0–100 composite momentum score",
              },
              {
                "@type": "PropertyValue",
                name: "crossSignalScore",
                description: "0–5 cross-channel signal aggregate",
              },
            ],
            distribution: [
              {
                "@type": "DataDownload",
                encodingFormat: "application/json",
                contentUrl: absoluteUrl("/api/repos"),
              },
              {
                "@type": "DataDownload",
                encodingFormat: "text/markdown",
                contentUrl: absoluteUrl("/llms-full.txt"),
              },
              {
                "@type": "DataDownload",
                encodingFormat: "application/xml",
                contentUrl: absoluteUrl("/sitemap.xml"),
              },
            ],
            temporalCoverage: `${new Date(
              Date.now() - 365 * 24 * 3600 * 1000,
            )
              .toISOString()
              .slice(0, 10)}/..`,
            dateModified: lastFetchedAt,
          }),
        }}
      />

      {/* V2 sign-off — operator-grade footer line */}
      <section className="px-4 sm:px-6 pt-2 pb-8">
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--v2-line-std)]">
          <MonoLabel
            text={`// TRENDINGREPO · v2 · ${monoDate} · SERIAL ${repos.length}/2200 · END OF PAGE ▮`}
            tone="muted"
          />
          <span
            className="v2-mono text-[10px] text-text-tertiary hidden sm:inline"
          >
            DATA · {new Date(lastFetchedAt).toISOString().slice(11, 16)} UTC
          </span>
        </div>
      </section>
    </>
  );
}
