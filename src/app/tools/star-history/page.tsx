// /tools/star-history — V4 server surface (W6).
//
// Composition only:
//   01 Compare repos     → existing CompareChart, seeded with top-3 momentum
//                          movers. Theme + scale toggles live on the chart.
//   02 Themes            → preview cards for each ChartTheme; clicking opens
//                          the share-image renderer at the right query state.
//   03 Embed             → markdown + iframe snippets pointing at
//                          /api/og/star-activity (the same endpoint ShareBar
//                          uses) so README / blog embeds stay cache-friendly.
//
// Mockup ref: star-history-themes.html.
// Master plan: §416 — "existing route, polish to V4 + add PNG export".
//
// Data: derived top-3 by momentum from the trending pipeline. ISR 30 min so
// the chart seed only refreshes when the GHA scrape commits new data.

import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { CHART_THEME_OPTIONS } from "@/components/compare/themes";
import { FreshnessBadge } from "@/components/shared/FreshnessBadge";
import { getDerivedRepos } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildAbsoluteShareImageUrl } from "@/lib/star-activity-url";
import { lastFetchedAt, refreshTrendingFromStore } from "@/lib/trending";
import type { Repo } from "@/lib/types";

import { StarHistoryToolClient } from "./StarHistoryToolClient";

export const runtime = "nodejs";
// 30-minute ISR — matches /tools hub + home. The seed (top-3 movers) only
// changes when the GHA scrape commits new trending data, so a longer cache
// is safe.
export const revalidate = 1800;

const PAGE_PATH = "/tools/star-history";

export async function generateMetadata(): Promise<Metadata> {
  const canonical = absoluteUrl(PAGE_PATH);
  const title = `Star history charts — ${SITE_NAME}`;
  const description =
    "Plot star history for repos head-to-head, switch between editorial themes, and export PNG / SVG / CSV — built on the same momentum pipeline as the rest of TrendingRepo.";
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * Pick a small, well-formed seed for the demo chart. Filters to repos that
 * have non-trivial sparkline data (otherwise the chart shows the "collecting
 * history" placeholder), then sorts by momentum and trims to the top 3.
 */
function pickDemoRepos(repos: Repo[], limit = 3): Repo[] {
  const usable = repos.filter((r) => {
    const series = r.sparklineData ?? [];
    if (series.length < 7) return false;
    const nonZero = series.filter((n) => Number.isFinite(n) && n !== 0).length;
    return nonZero >= 7;
  });
  return [...usable]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, limit);
}

export default async function StarHistoryToolPage() {
  await refreshTrendingFromStore();
  const allRepos = getDerivedRepos();
  const seed = pickDemoRepos(allRepos);

  // Build a permalinked share-image URL so the right-rail "Download PNG"
  // button works even without JS. The interactive ShareBar inside the
  // client island still wins for state-aware downloads.
  const seedShareUrl =
    seed.length > 0
      ? buildAbsoluteShareImageUrl({
          repos: seed.map((r) => r.fullName),
          mode: "date",
          scale: "lin",
          legend: "tr",
          aspect: "h",
        })
      : null;

  // Embed snippets — single source of truth for the section 03 code blocks.
  // Caller can copy any of the three; all three resolve to the same OG card
  // endpoint with state encoded as querystring.
  const embedExample = seed.length > 0 ? seed.map((r) => r.fullName) : [
    "vercel/next.js",
    "facebook/react",
    "vuejs/core",
  ];
  const embedShareUrl = buildAbsoluteShareImageUrl({
    repos: embedExample,
    mode: "date",
    scale: "lin",
    legend: "tr",
    aspect: "h",
  });
  const embedPagePath = absoluteUrl(
    `/compare?repos=${embedExample.join(",")}`,
  );
  const markdownSnippet = `[![Star history](${embedShareUrl})](${embedPagePath})`;
  const htmlSnippet = `<a href="${embedPagePath}"><img alt="Star history" src="${embedShareUrl}" width="1200" /></a>`;
  const iframeSnippet = `<iframe src="${embedShareUrl}" width="1200" height="675" frameborder="0"></iframe>`;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>STAR HISTORY</b> · TERMINAL · /TOOLS/STAR-HISTORY
          </>
        }
        h1="Star history charts."
        lede="Plot up to four repos head-to-head with full-history star data. Switch between editorial themes — Terminal, Neon, Gradient, CRT, Poster — and export PNG, SVG, or CSV for blogs, READMEs, or social cards."
        clock={
          <>
            <span className="big">{seed.length} / 3</span>
            <span className="muted">SEEDED REPOS</span>
            <FreshnessBadge source="mcp" lastUpdatedAt={lastFetchedAt} />
          </>
        }
      />

      <SectionHead
        num="// 01"
        title="Compare repos"
        meta={
          seed.length > 0 ? (
            <>
              top <b>{seed.length}</b> by momentum · 30-day window
            </>
          ) : (
            <>warming · no seed available</>
          )
        }
      />
      {seed.length >= 2 ? (
        <StarHistoryToolClient repos={seed} />
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-text-tertiary">
              Need at least two seeded repos to render the comparison chart.
              Pick repos manually from the{" "}
              <Link href="/compare" className="link">
                compare tool
              </Link>
              .
            </p>
          </CardBody>
        </Card>
      )}

      <SectionHead
        num="// 02"
        title="Themes"
        meta={
          <>
            <b>{CHART_THEME_OPTIONS.length}</b> editorial styles · PNG / SVG export
          </>
        }
      />
      <div className="grid">
        {CHART_THEME_OPTIONS.map((opt, i) => (
          <div className="col-4" key={opt.value}>
            <Card>
              <CardHeader
                showCorner
                right={
                  <span style={{ color: "var(--v4-ink-400)" }}>
                    {`// 0${i + 1}`}
                  </span>
                }
              >
                {opt.label}
              </CardHeader>
              <CardBody>
                <p className="text-sm text-text-secondary">
                  {describeTheme(opt.value)}
                </p>
                {seedShareUrl ? (
                  <p className="mt-3">
                    <a
                      className="link"
                      href={seedShareUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open PNG → /api/og/star-activity
                    </a>
                  </p>
                ) : null}
              </CardBody>
            </Card>
          </div>
        ))}
      </div>

      <SectionHead
        num="// 03"
        title="Embed"
        meta={<>markdown · html · iframe</>}
      />
      <div className="grid">
        <div className="col-12">
          <Card>
            <CardHeader showCorner right={<span>copy &amp; paste</span>}>
              README / blog snippets
            </CardHeader>
            <CardBody>
              <p className="text-sm text-text-secondary mb-3">
                The share-image endpoint accepts the full chart state as
                querystring — copy any of the snippets below to embed a live
                chart that re-renders on every cache miss.
              </p>
              <pre
                className="code-block"
                style={{
                  background: "var(--v4-bg-050)",
                  border: "1px solid var(--v4-line-200)",
                  padding: "12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  overflowX: "auto",
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: "var(--v4-ink-200)",
                }}
              >
                {`# Markdown\n${markdownSnippet}\n\n# HTML\n${htmlSnippet}\n\n# Iframe\n${iframeSnippet}`}
              </pre>
              {seedShareUrl ? (
                <p className="mt-3">
                  <a
                    className="link"
                    href={seedShareUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PNG of the seeded chart →
                  </a>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <footer className="tool-disclaimer">
        Charts render from the same trending pipeline as the rest of the site.{" "}
        <Link href="/tools" className="link">
          Back to tools hub →
        </Link>
      </footer>
    </main>
  );
}

function describeTheme(theme: string): string {
  switch (theme) {
    case "terminal":
      return "Operator default — high-contrast strokes on dark, sparse grid, no glow. Best for dashboards.";
    case "neon":
      return "Saturated cyan / magenta / lime with an outer-glow stroke pass. Best for dark social cards.";
    case "gradient":
      return "Area-fill ramp under each line. Best for blog headers and presentation decks.";
    case "crt":
      return "Single-hue green-phosphor with scanline overlay. Best for retro shareables.";
    case "poster":
      return "Bold light-bg palette with thicker strokes. Best for print, Threads, IG.";
    default:
      return "";
  }
}
