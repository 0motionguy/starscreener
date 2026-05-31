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
      "Real-time trend-discovery scanner for open source. Aggregates GitHub, Hacker News, Reddit, X, Bluesky and Dev.to signals to surface breakout AI and developer repos before they go mainstream.",
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
