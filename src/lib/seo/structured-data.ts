// Shared schema.org JSON-LD builders for the answer-surface pages
// (category hubs, best-of listicles, comparisons, blog). Mirrors the
// pattern in repo-jsonld.ts but for the collection/navigation graph types
// that Google rich results + AI answer engines parse to understand and
// cite a page.
//
// Honesty rule (Google helpful-content + spam policy, same as repo-jsonld):
// only emit a graph node when the underlying content genuinely exists on
// the page. An empty ItemList or a FAQPage with zero answerable questions
// is worse than no schema — don't fabricate structure.
//
// All builders return plain objects; callers serialize with `safeJsonLd`
// from @/lib/seo and inject via a `<script type="application/ld+json">`.

import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

export interface BreadcrumbCrumb {
  name: string;
  /** Site-relative path ("/categories") or absolute URL. */
  path: string;
}

/**
 * BreadcrumbList — gives crawlers + AI engines the navigational position of
 * the page. Improves the breadcrumb rich result and helps answer engines
 * understand the site's information architecture.
 */
export function buildBreadcrumbJsonLd(crumbs: BreadcrumbCrumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  } as const;
}

export interface ItemListEntry {
  /** Display name, e.g. "vercel/next.js". */
  name: string;
  /** Site-relative path or absolute URL to the entry's canonical page. */
  path: string;
  /** Optional one-line description rendered into the list item. */
  description?: string;
}

/**
 * ItemList — the canonical schema for a ranked list page ("best X", category
 * leaderboard). Ordered, so `position` reflects our ranking. Answer engines
 * lift this directly when asked "what are the top N <topic>".
 */
export function buildItemListJsonLd(
  name: string,
  url: string,
  entries: ItemListEntry[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: absoluteUrl(url),
    numberOfItems: entries.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(entry.path),
      name: entry.name,
      ...(entry.description ? { description: entry.description } : {}),
    })),
  } as const;
}

export interface FaqEntry {
  q: string;
  /** Plain-text answer. Strip any JSX/markup before passing here. */
  a: string;
}

/**
 * FAQPage — answer engines (Google AI Overview especially) heavily favour
 * Q&A-structured content. Answers MUST be the plain text actually rendered
 * on the page. Returns null when there's nothing real to publish so the
 * caller can skip the `<script>` entirely (honesty rule).
 */
export function buildFaqJsonLd(entries: FaqEntry[]) {
  const clean = entries.filter((e) => e.q.trim() && e.a.trim());
  if (clean.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: clean.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.a,
      },
    })),
  } as const;
}

/**
 * WebSite — emits the canonical site identity Google uses to assemble the
 * "Site name" feature (the bolded brand string in SERP titles) and the
 * sitelinks hierarchy. Pairs alongside the Organization graph in the root
 * layout. Deliberately omits SearchAction: the site has no user-facing
 * /search?q= results page, so emitting it would mislead the sitelinks
 * searchbox into pointing at a route that doesn't exist.
 *
 * Reference: https://developers.google.com/search/docs/appearance/site-names
 */
export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: SITE_NAME,
    alternateName: ["TrendingRepo", "Trending Repo", "Starscreener"],
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}#organization` },
  } as const;
}

/**
 * Organization — site identity for E-E-A-T. Emitted once at the root layout
 * so every page inherits a described publisher. `knowsAbout` states the
 * domain expertise answer engines weigh for authoritativeness.
 */
export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/brand/trendingrepo.svg"),
    description:
      "Real-time trend-discovery scanner for open source. Aggregates GitHub, Hacker News, X, Bluesky, Product Hunt and Dev.to signals to surface breakout AI and developer repos before they go mainstream.",
    knowsAbout: [
      "open-source software",
      "GitHub repositories",
      "AI agents",
      "Model Context Protocol",
      "large language models",
      "developer tools",
      "software trend analysis",
    ],
    sameAs: ["https://github.com/0motionguy/starscreener"],
  } as const;
}

// ---------------------------------------------------------------------------
// Author primitives (E-E-A-T)
//
// Google's helpful-content + "Reviews" guidance both lean on author identity.
// A named Person attached to curated answer-surfaces (e.g. /best/<topic>)
// signals first-party human curation, separating us from algorithmic
// directories that get downranked. The Organization variant is appropriate
// for data-driven leaderboards (/categories/<id>) where the ranking itself
// is editorial but the prose is computed.

export interface PersonAuthor {
  /** Display name, e.g. "Mirko Basil". */
  name: string;
  /**
   * Canonical identity URL. Stable cross-link Google can use to disambiguate
   * the person from same-name authors. Common picks: personal site, LinkedIn,
   * the operator's primary brand URL. Optional but strongly recommended.
   */
  url?: string;
  /** Optional one-line description, e.g. "Founder, AISO.tools". */
  jobTitle?: string;
}

/**
 * Person — JSON-LD author node. Use as the `author` field on Article /
 * BlogPosting graph entries when a single named human curated the content.
 *
 * Honesty rule: do NOT attribute content to a person who didn't actually
 * write it. Auto-generated text should stay attributed to the Organization.
 */
export function buildPersonJsonLd(author: PersonAuthor) {
  return {
    "@type": "Person",
    name: author.name,
    ...(author.url ? { url: author.url } : {}),
    ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}),
  } as const;
}

/**
 * Organization-as-author — same shape as Person but with @type=Organization,
 * linked to the site's root Organization node. Use when the ranking/copy is
 * data-driven and we don't want to attribute it to a specific human.
 */
export function buildOrganizationAuthorJsonLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: SITE_NAME,
    url: SITE_URL,
  } as const;
}

// ---------------------------------------------------------------------------
// Article — wraps the editorial intro on an answer-surface page
//
// Pairs alongside ItemList: the ItemList answers "what's ranked" and the
// Article answers "who says so and when". Both fields show up in answer
// engines (Google AI Overview, Perplexity) as separately citable units.

export interface ArticleInput {
  /** Page H1 / display headline. */
  headline: string;
  /** Site-relative path or absolute URL for the page. */
  url: string;
  /** ISO 8601 datestamp the article first published. */
  datePublished: string;
  /** ISO 8601 datestamp of the most recent revision (>= datePublished). */
  dateModified: string;
  /** Article author — Person for curated work, Organization for data-driven. */
  author: ReturnType<typeof buildPersonJsonLd> | ReturnType<typeof buildOrganizationAuthorJsonLd>;
  /** ≤300 char article description. Reuse the page's meta description. */
  description?: string;
  /** Optional canonical image URL — defaults to the page's OG image. */
  image?: string;
}

/**
 * Article — minimal but valid Article node. The publisher is the site's
 * Organization (linked by @id to the root buildOrganizationJsonLd node).
 *
 * Pair with buildItemListJsonLd in the same page: emit both <JsonLd>
 * elements (or compose into a `@graph` if you prefer one script tag).
 */
export function buildArticleJsonLd(input: ArticleInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    mainEntityOfPage: absoluteUrl(input.url),
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: input.author,
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: absoluteUrl("/brand/trendingrepo.svg") },
    },
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
  } as const;
}
