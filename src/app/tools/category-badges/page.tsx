// /tools/category-badges — Gallery + embed recipes for the per-category
// ranking badges shipped at /api/og/category-badge/[slug].svg.
//
// Composition (matches the /tools/star-history layout):
//   01 Gallery   — one card per CATEGORIES[i], shows the live badge + the
//                  markdown snippet to embed it.
//   02 Embed     — copy-paste recipe block (markdown / html / raw img URL).
//
// Defensibility note: the badge endpoint is the third embeddable visual
// surface alongside the existing star-history SVG (/tools/star-history) and
// the treemap thumbnail. Every embed is free viral marketing + a
// defensibility moat — see v3 deltas plan §"Defensibility 2.0".

import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHead } from "@/components/ui/PageHead";
import { SectionHead } from "@/components/ui/SectionHead";
import { CATEGORIES } from "@/lib/constants";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const runtime = "nodejs";
// 30-minute ISR — matches /tools/star-history. The badge inventory is a
// pure function of CATEGORIES (compile-time constant) so we could go much
// longer, but 30min keeps the chrome aligned with neighbouring tools.
export const revalidate = 1800;

const PAGE_PATH = "/tools/category-badges";

export function generateMetadata(): Metadata {
  const canonical = absoluteUrl(PAGE_PATH);
  const title = `Category trending badges — ${SITE_NAME}`;
  const description =
    "Embed a live 'Trending in <category>' badge in your repo's README. SVG, no external font / image references, refreshes hourly off the same momentum pipeline as the rest of TrendingRepo.";
  return {
    title,
    description,
    keywords: [
      "GitHub README badge",
      "trending badge",
      "category leaderboard",
      "shields-style badge",
      "developer marketing",
    ],
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

function badgeImageUrl(slug: string): string {
  // GitHub's markdown renderer needs a file extension for camo-proxied
  // images — we keep the `.svg` suffix in the embed URL even though the
  // route accepts the bare slug too.
  return absoluteUrl(`/api/og/category-badge/${slug}.svg`);
}

function categoryPageUrl(slug: string): string {
  return absoluteUrl(`/categories/${slug}`);
}

function markdownSnippet(slug: string, name: string): string {
  return `[![Trending in ${name}](${badgeImageUrl(slug)})](${categoryPageUrl(slug)})`;
}

function htmlSnippet(slug: string, name: string): string {
  return `<a href="${categoryPageUrl(slug)}"><img alt="Trending in ${name}" src="${badgeImageUrl(slug)}" width="480" height="80" /></a>`;
}

export default function CategoryBadgesToolPage() {
  // Hard-cap the showcase example to the first category — keeps the
  // section 02 snippet block focused. The full per-category grid lives
  // in section 01 and renders every badge plus its own snippet.
  const showcase = CATEGORIES[0];
  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>CATEGORY BADGES</b> · TERMINAL · /TOOLS/CATEGORY-BADGES
          </>
        }
        h1="Trending-in badges for your README."
        lede="Drop a live category-ranking badge in any repo's README — it refreshes hourly off the same composite-momentum pipeline as the rest of TrendingRepo. Self-contained SVG, no external font or image hosts, works under GitHub camo."
        clock={
          <>
            <span className="big">{CATEGORIES.length}</span>
            <span className="muted">CATEGORIES</span>
          </>
        }
      />

      <SectionHead
        num="// 01"
        title="Gallery"
        meta={
          <>
            one badge per category · click the snippet to copy
          </>
        }
      />
      <div className="grid">
        {CATEGORIES.map((cat) => (
          <div className="col-6" key={cat.id}>
            <Card>
              <CardHeader
                showCorner
                right={
                  <span style={{ color: "var(--v4-ink-400)" }}>
                    {`/${cat.id}.svg`}
                  </span>
                }
              >
                {cat.name}
              </CardHeader>
              <CardBody>
                <p
                  className="text-sm text-text-secondary"
                  style={{ marginBottom: "12px" }}
                >
                  {cat.description}
                </p>
                {/* Live badge preview. Rendered as a raw <img> (not <Image>)
                    because the destination is image/svg+xml and we want the
                    browser-native SVG rasterizer, not Next's bitmap loader.
                    `loading="lazy"` keeps the gallery cheap on first paint. */}
                <p>
                  <a
                    href={categoryPageUrl(cat.id)}
                    aria-label={`Open ${cat.name} category page`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={badgeImageUrl(cat.id)}
                      alt={`Trending in ${cat.name}`}
                      width={480}
                      height={80}
                      loading="lazy"
                      style={{ maxWidth: "100%", height: "auto" }}
                    />
                  </a>
                </p>
                <pre
                  className="code-block"
                  style={{
                    marginTop: "12px",
                    background: "var(--v4-bg-050)",
                    border: "1px solid var(--v4-line-200)",
                    padding: "10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    overflowX: "auto",
                    fontFamily: "var(--font-geist-mono), monospace",
                    color: "var(--v4-ink-200)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {markdownSnippet(cat.id, cat.name)}
                </pre>
              </CardBody>
            </Card>
          </div>
        ))}
      </div>

      <SectionHead
        num="// 02"
        title="Embed"
        meta={<>markdown · html · raw URL</>}
      />
      <div className="grid">
        <div className="col-12">
          <Card>
            <CardHeader showCorner right={<span>copy &amp; paste</span>}>
              README / blog snippets
            </CardHeader>
            <CardBody>
              <p
                className="text-sm text-text-secondary"
                style={{ marginBottom: "12px" }}
              >
                Pick the format your renderer prefers. The endpoint accepts
                both the bare slug and a <code>.svg</code> suffix — GitHub
                READMEs need the suffix so the camo proxy treats it as an
                image asset.
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
                  whiteSpace: "pre-wrap",
                }}
              >
                {`# Markdown\n${markdownSnippet(showcase.id, showcase.name)}\n\n# HTML\n${htmlSnippet(showcase.id, showcase.name)}\n\n# Raw URL\n${badgeImageUrl(showcase.id)}`}
              </pre>
              <p className="mt-3 text-sm text-text-tertiary">
                Swap <code>{showcase.id}</code> for any slug from the gallery
                above. Cache: 1h fresh + 24h SWR, refreshes on the next read
                after the worker tick.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <footer className="tool-disclaimer">
        Badges render from the same trending pipeline as the rest of the
        site.{" "}
        <Link href="/tools" className="link">
          Back to tools hub →
        </Link>
      </footer>
    </main>
  );
}
