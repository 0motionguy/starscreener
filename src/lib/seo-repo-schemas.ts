// JSON-LD generators for STARSCREENER repo detail pages.
//
// Each /repo/{owner}/{name} page emits a graph of:
//   1. SoftwareSourceCode    - the GitHub repo as code
//   2. SoftwareApplication   - the repo as an installable app
//   3. BreadcrumbList        - Home > {Owner} > {Name}
//   4. AggregateRating       - momentum score 0-100 -> rating 1-5
//
// All anchored to the global Organization (TrendingRepo) via @id reference.
//
// Pure module: every function takes structured input and returns plain
// JSON-LD objects. No DB access, no fetches. The page route is responsible
// for loading the repo data and passing it in.

import { SITE_URL, SITE_NAME, absoluteUrl } from "@/lib/seo";

export type JsonLd = Record<string, unknown>;

const ORG_ID = `${SITE_URL}#organization`;

export interface RepoSchemaInput {
  owner: string;
  name: string;
  description?: string | null;
  /** Repo homepage from GitHub data (different from the GH URL itself). */
  homepageUrl?: string | null;
  /** Primary language (e.g. "TypeScript"). */
  language?: string | null;
  /** GitHub topics. */
  topics?: string[];
  /** SPDX id, e.g. "MIT". */
  license?: string | null;
  stars: number;
  forks: number;
  lastCommitAt?: Date | string | null;
  createdAt?: Date | string | null;
  /** 0-100 from STARSCREENER's scoring. */
  momentumScore?: number | null;
  /** e.g. "AI Agents" - drives applicationCategory hint. */
  category?: string | null;
}

/**
 * Build the JSON-LD entity graph for a /repo/{owner}/{name} page.
 *
 * Returns an array of independent schema objects. The page should map
 * over them and emit one <script type="application/ld+json"> per entry.
 */
export function buildRepoPageSchemas(input: RepoSchemaInput): JsonLd[] {
  const repoUrl = `https://github.com/${input.owner}/${input.name}`;
  const trUrl = absoluteUrl(`/repo/${input.owner}/${input.name}`);

  // 1. SoftwareSourceCode - the canonical "this URL is about a repo" entity.
  const sourceCode: JsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    "@id": `${trUrl}#code`,
    name: `${input.owner}/${input.name}`,
    description:
      (input.description && input.description.trim()) ||
      `${input.name} - GitHub repository.`,
    codeRepository: repoUrl,
    url: trUrl,
    isPartOf: { "@id": `${SITE_URL}#website` },
    publisher: { "@id": ORG_ID },
    ...(input.language ? { programmingLanguage: input.language } : {}),
    ...(input.license ? { license: input.license } : {}),
    ...(input.lastCommitAt ? { dateModified: toIso(input.lastCommitAt) } : {}),
    ...(input.createdAt ? { dateCreated: toIso(input.createdAt) } : {}),
    ...(input.topics && input.topics.length
      ? { keywords: input.topics.join(", ") }
      : {}),
  };

  // 2. SoftwareApplication - lets Google surface install/download cards.
  const app: JsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${trUrl}#app`,
    name: input.name,
    applicationCategory: input.category ?? "DeveloperApplication",
    operatingSystem: "Cross-platform",
    url: input.homepageUrl ?? repoUrl,
    downloadUrl: repoUrl,
    sameAs: [repoUrl],
    publisher: { "@id": ORG_ID },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(input.description && input.description.trim()
      ? { description: input.description }
      : {}),
  };

  // 3. BreadcrumbList - Home > {Owner} > {Name}.
  const breadcrumb: JsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${trUrl}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: input.owner,
        item: `${SITE_URL}/owner/${input.owner}`,
      },
      { "@type": "ListItem", position: 3, name: input.name, item: trUrl },
    ],
  };

  const schemas: JsonLd[] = [sourceCode, app, breadcrumb];

  // 4. AggregateRating - only if we have momentum + at least one star,
  //    otherwise the rating would be meaningless / zero-weight.
  if (input.momentumScore != null && input.stars > 0) {
    // 0-100 momentum -> 1-5 stars (clamped). bestRating/worstRating set
    // explicitly so SERP renderers don't infer a default 5-star scale.
    const rating = Math.max(1, Math.min(5, input.momentumScore / 20));
    schemas.push({
      "@context": "https://schema.org",
      "@type": "AggregateRating",
      "@id": `${trUrl}#rating`,
      itemReviewed: { "@id": `${trUrl}#code` },
      ratingValue: rating.toFixed(1),
      bestRating: "5",
      worstRating: "1",
      // GitHub stars proxy as rating count - gives Google a sample-size
      // signal so the rating isn't suppressed for being unsupported.
      ratingCount: input.stars,
    });
  }

  return schemas;
}

function toIso(d: Date | string): string {
  return typeof d === "string" ? new Date(d).toISOString() : d.toISOString();
}
