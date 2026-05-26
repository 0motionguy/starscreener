// JSON-LD builders for the repo detail page.
//
// Emits schema.org structured data so Google + AI answer engines can parse
// the page. Two graphs:
//   - SoftwareSourceCode — always present; the repo's factual identity.
//   - Article — only when a real AISO/Kimi verdict exists; carries the
//     original analysis prose, attributed to AISO.tools as the author.
//
// Honesty rule (Google helpful-content + spam policy): the Article graph is
// only emitted when there is genuine, evidence-based analysis to attribute.
// No Article schema on template-fallback prose.

import type { ConsensusItemReport } from "@/lib/consensus-verdicts";
import type { Repo } from "@/lib/types";

const SITE_URL = "https://trendingrepo.com";
const AISO_NAME = "AISO.tools";
const AISO_URL = "https://aiso.tools";

interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": Record<string, unknown>[];
}

/**
 * Build the JSON-LD graph for a repo detail page. `verdict` + `computedAt`
 * are optional; when absent, only the SoftwareSourceCode node is emitted.
 */
export function buildRepoJsonLd(
  repo: Repo,
  verdict: ConsensusItemReport | null,
  computedAt: string | null,
): JsonLdGraph {
  const pageUrl = `${SITE_URL}/repo/${repo.owner}/${repo.name}`;
  const githubUrl = repo.url || `https://github.com/${repo.fullName}`;

  const software: Record<string, unknown> = {
    "@type": "SoftwareSourceCode",
    "@id": `${pageUrl}#software`,
    name: repo.fullName,
    codeRepository: githubUrl,
    url: pageUrl,
    ...(repo.description ? { description: repo.description } : {}),
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

  // Article node only when there's real, attributable analysis.
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
      // E-E-A-T: a recognised, described author with stated expertise — not a
      // bare name. Reinforces Authoritativeness + Trust for search/answer engines.
      author: {
        "@type": "Organization",
        name: AISO_NAME,
        url: AISO_URL,
        description:
          "AI-readiness and open-source signal intelligence. Cross-source trend analysis across GitHub, Hacker News, Reddit, X, Bluesky, Dev.to, Product Hunt and Hugging Face.",
        knowsAbout: ["open-source software", "AI agents", "developer tools", "trend analysis"],
      },
      publisher: {
        "@type": "Organization",
        name: "TrendingRepo",
        url: SITE_URL,
      },
      // Trust: state how the analysis was produced.
      creativeWorkStatus: "Published",
      isFamilyFriendly: true,
      // Real cited sources → answer-engine / agent readability. Always
      // include the GitHub repo; add any verdict citations on top.
      citation: [
        { "@type": "WebPage", url: githubUrl, name: `${repo.fullName} on GitHub` },
        ...(verdict.citations ?? []).map((c) => ({
          "@type": "WebPage",
          url: c.url,
          name: c.title,
        })),
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
