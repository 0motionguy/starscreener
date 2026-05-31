// JSON-LD builders for the repo detail page.
//
// Emits schema.org structured data so Google + AI answer engines can parse
// the page. Two graphs:
//   - SoftwareSourceCode — always present; the repo's factual identity.
//   - Article — when a real AISO/Kimi consensus verdict exists OR (for a
//     freshly-dropped repo with no verdict yet) an LLM-written editorial
//     overview exists. Both carry original analysis prose attributed to AISO.
//
// Honesty rule (Google helpful-content + spam policy): the Article graph is
// only emitted when there is genuine, attributable analysis — never on
// template-fallback prose (editorial.generator === "template" is excluded).

import type { ConsensusItemReport } from "@/lib/consensus-verdicts";
import type { RepoEditorial } from "@/lib/repo-editorial-store";
import type { Repo } from "@/lib/types";

const SITE_URL = "https://trendingrepo.com";
const AISO_NAME = "AISO.tools";
const AISO_URL = "https://aiso.tools";

// E-E-A-T: a recognised, described author with stated expertise — not a bare
// name. Reused by both the verdict Article and the editorial Article.
const AISO_AUTHOR = {
  "@type": "Organization",
  name: AISO_NAME,
  url: AISO_URL,
  description:
    "AI-readiness and open-source signal intelligence. Cross-source trend analysis across GitHub, Hacker News, Reddit, X, Bluesky, Dev.to, Product Hunt and Hugging Face.",
  knowsAbout: ["open-source software", "AI agents", "developer tools", "trend analysis"],
} as const;

const TR_PUBLISHER = {
  "@type": "Organization",
  name: "TrendingRepo",
  url: SITE_URL,
} as const;

interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": Record<string, unknown>[];
}

/**
 * Build the JSON-LD graph for a repo detail page. `verdict` + `computedAt`
 * are optional; when absent, the Article falls back to `editorial` (the
 * per-repo overview written for a freshly-dropped repo). When neither exists,
 * only the SoftwareSourceCode node is emitted.
 */
export function buildRepoJsonLd(
  repo: Repo,
  verdict: ConsensusItemReport | null,
  computedAt: string | null,
  editorial?: RepoEditorial | null,
): JsonLdGraph {
  const pageUrl = `${SITE_URL}/repo/${repo.owner}/${repo.name}`;
  const githubUrl = repo.url || `https://github.com/${repo.fullName}`;

  // Prefer the repo's own description; fall back to the editorial framing so a
  // freshly-dropped repo still carries a meaningful description node.
  const description =
    repo.description || editorial?.tagline || editorial?.overview || "";

  const software: Record<string, unknown> = {
    "@type": "SoftwareSourceCode",
    "@id": `${pageUrl}#software`,
    name: repo.fullName,
    codeRepository: githubUrl,
    url: pageUrl,
    ...(description ? { description } : {}),
    ...(repo.language ? { programmingLanguage: repo.language } : {}),
    ...(typeof repo.stars === "number"
      ? {
          interactionStatistic: {
            "@type": "InteractionCounter",
            interactionType: "https://schema.org/LikeAction",
            userInteractionCount: repo.stars,
          },
        }
      : {}),
  };

  const graph: Record<string, unknown>[] = [software];

  // Article node — verdict (richest) takes priority; editorial overview is the
  // fallback so dropped repos get citable analysis before the hourly sweep runs.
  if (verdict && verdict.summary.trim().length > 0) {
    graph.push({
      "@type": "Article",
      "@id": `${pageUrl}#analysis`,
      headline:
        verdict.whyNow.trim().length > 0
          ? verdict.whyNow.slice(0, 110)
          : `Signal analysis for ${repo.fullName}`,
      articleBody: verdict.summary,
      about: { "@id": `${pageUrl}#software` },
      url: pageUrl,
      isAccessibleForFree: true,
      ...(computedAt ? { dateModified: computedAt, datePublished: computedAt } : {}),
      author: AISO_AUTHOR,
      publisher: TR_PUBLISHER,
      creativeWorkStatus: "Published",
      isFamilyFriendly: true,
      citation: [
        { "@type": "WebPage", url: githubUrl, name: `${repo.fullName} on GitHub` },
        ...(verdict.citations ?? []).map((c) => ({
          "@type": "WebPage",
          url: c.url,
          name: c.title,
        })),
      ],
    });
  } else if (
    editorial &&
    editorial.overview.trim().length > 0 &&
    editorial.generator !== "template"
  ) {
    graph.push({
      "@type": "Article",
      "@id": `${pageUrl}#analysis`,
      headline: editorial.tagline?.trim()
        ? editorial.tagline.slice(0, 110)
        : `What ${repo.fullName} is`,
      articleBody: editorial.overview,
      about: { "@id": `${pageUrl}#software` },
      url: pageUrl,
      isAccessibleForFree: true,
      ...(editorial.computedAt
        ? { dateModified: editorial.computedAt, datePublished: editorial.computedAt }
        : {}),
      author: AISO_AUTHOR,
      publisher: TR_PUBLISHER,
      creativeWorkStatus: "Published",
      isFamilyFriendly: true,
      citation: [
        { "@type": "WebPage", url: githubUrl, name: `${repo.fullName} on GitHub` },
        ...(editorial.citations ?? [])
          .filter((c) => c.url !== githubUrl)
          .map((c) => ({ "@type": "WebPage", url: c.url, name: c.title })),
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
