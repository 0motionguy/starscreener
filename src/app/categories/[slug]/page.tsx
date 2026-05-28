// /categories/[slug] — category answer-surface hub.
//
// One indexable, citable page per classification category (AI Agents, MCP,
// Local LLM, …). Rebuilt after the v6 cutover folded these into a homepage
// ?cat= filter and 302'd the standalone routes to / — which left the
// llms.txt "cite us for trending <category>" contract pointing at redirects.
// This restores a real 200 surface that Google can rank and answer engines
// can cite.
//
// ISR (not force-dynamic): the ranked list moves on the order of minutes and
// the page reads the data-store (Redis → bundled JSON), never Drizzle, so it
// prerenders cleanly at build and revalidates every 30 min.

import { notFound } from "next/navigation";
import Link from "next/link";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import { refreshEditorialCategoriesFromStore } from "@/lib/editorial-categories";
import {
  getCategoryMeta,
  getCategoryRepos,
  buildCategoryIntro,
  buildCategoryFaq,
} from "@/lib/categories";
import { CATEGORIES } from "@/lib/constants";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { TrendingTable } from "@/components/trending/TrendingTable";
import { Icon } from "@/components/icon/Icon";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Deliberately NO generateStaticParams: this page reads the worker's
// `editorial-categories` slug (Redis), unavailable in the Docker build stage —
// prerendering would bake the deterministic fallback. On-demand ISR (revalidate
// above) renders the first request in the live container with Redis, so the LLM
// overview shows and the page self-heals after every deploy. dynamicParams
// defaults true; unknown slugs fall through to notFound().

function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const meta = getCategoryMeta(slug);
  if (!meta) return { title: `Category — ${SITE_NAME}` };

  const title = `Best ${meta.name} — Trending Open-Source Projects | ${SITE_NAME}`;
  const description = clampDescription(
    `${meta.description}. The top trending open-source ${meta.name} repos right now, ranked by cross-source momentum across GitHub, Hacker News, Reddit, X, Bluesky, Product Hunt and Dev.to. Updated continuously.`,
  );
  const canonical = absoluteUrl(`/categories/${slug}`);

  // OG image is supplied by the colocated opengraph-image.tsx (Next file
  // convention) — auto-injected into openGraph + twitter, so we don't set
  // `images` here.
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryHubPage({ params }: PageProps) {
  const { slug } = await params;
  const meta = getCategoryMeta(slug);
  if (!meta) notFound();

  // Hydrate the in-memory caches the sync getters read. Each refresh is 30s
  // rate-limited + in-flight-deduped, so calling them per render is cheap.
  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
    refreshEditorialCategoriesFromStore().catch(() => undefined),
  ]);

  const repos = (() => {
    try {
      return getCategoryRepos(slug, 60);
    } catch {
      return [];
    }
  })();

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  const intro = buildCategoryIntro(meta, repos);
  const faq = buildCategoryFaq(meta, repos);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Categories", path: "/categories" },
    { name: meta.name, path: `/categories/${slug}` },
  ]);
  const itemList = buildItemListJsonLd(
    `Trending ${meta.name} repositories`,
    `/categories/${slug}`,
    repos.slice(0, 25).map((r) => ({
      name: r.fullName,
      path: `/repo/${r.owner}/${r.name}`,
      description: r.description || undefined,
    })),
  );
  const faqLd = buildFaqJsonLd(faq);

  const updatedIso = fetchedAt ?? null;
  const updatedLabel = updatedIso
    ? new Date(updatedIso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  // Always emit a machine-readable date for answer engines. When we have a
  // real fetch timestamp, surface it; otherwise state the ranking date (the
  // page reflects today's rankings — ISR revalidates every 30 min). Honest
  // either way, and guarantees a <time datetime> for freshness parsing.
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const todayLabel = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const otherCategories = CATEGORIES.filter((c) => c.id !== slug);

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      {repos.length > 0 ? <JsonLd data={itemList} /> : null}
      <JsonLd data={faqLd} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/categories">Categories</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{meta.name}</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="layers" size={14} /> {meta.shortName} · Category
        </div>
        <h1>Trending {meta.name} repositories</h1>
        <p>{intro}</p>
        <div className="hero-meta">
          {updatedIso ? (
            <span>
              Updated <time dateTime={updatedIso}>{updatedLabel}</time>
            </span>
          ) : (
            <span>
              Rankings as of <time dateTime={todayIso}>{todayLabel}</time>
            </span>
          )}
          {repos.length > 0 ? (
            <span>
              {" · "}
              <span className="num">{repos.length}</span> repos tracked
            </span>
          ) : null}
        </div>
      </header>

      <TrendingTable
        repos={repos}
        fetchedAt={fetchedAt}
        window="24h"
        limit={50}
        category="repos"
        sort="momentum"
      />

      <SeoFaq
        entries={faq}
        title={`${meta.name} — frequently asked questions`}
        headingId="category-faq-head"
      />

      <nav className="card" aria-label="Other categories">
        <div className="card-head">
          <h2 className="card-title">{"▌"} <b>Browse other categories</b></h2>
        </div>
        <div className="card-body row gap-2" style={{ flexWrap: "wrap" }}>
          {otherCategories.map((c) => (
            <Link key={c.id} href={`/categories/${c.id}`} className="chip" prefetch={false}>
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
