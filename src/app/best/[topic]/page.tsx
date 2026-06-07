// /best/[topic] — curated, verdict-forward "best of" listicles.
//
// High-intent commercial/informational queries ("best AI coding assistants",
// "best vector databases"). Distinct from /categories/[slug]: an editorial
// ranked top-N with a real "why it ranks" blurb per entry (pulled from the
// consensus verdict where one exists), not the dense monitoring leaderboard.
// ISR, reads the data-store only.

import { notFound } from "next/navigation";
import Link from "next/link";

import { refreshTrendingFromStore, getLastFetchedAt } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import {
  refreshConsensusVerdictsFromStore,
  getConsensusItemReport,
} from "@/lib/consensus-verdicts";
import { refreshEditorialBestFromStore } from "@/lib/editorial-store";
import {
  getBestTopic,
  selectTopicRepos,
  buildBestIntro,
  buildBestFaq,
} from "@/lib/best-topics";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildFaqJsonLd,
  buildArticleJsonLd,
  buildPersonJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { RankedRepoList, type RankedEntry } from "@/components/seo/RankedRepoList";
import { Icon } from "@/components/icon/Icon";
import type { Repo } from "@/lib/types";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ topic: string }>;
}

// Deliberately NO generateStaticParams: this page reads the worker's
// `editorial-best` slug (Redis), which is NOT available in the Docker build
// stage — prerendering would bake the deterministic fallback and only a manual
// revalidate would flip it. On-demand ISR (revalidate above) renders the first
// request in the live container with Redis, so the LLM overview shows and the
// page self-heals after every deploy. dynamicParams defaults true; unknown
// topics fall through to notFound().

function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** "Why it ranks" blurb: real verdict prose first, then honest fallbacks. */
function entryBlurb(repo: Repo): string {
  const verdict = (() => {
    try {
      return getConsensusItemReport(repo.fullName);
    } catch {
      return null;
    }
  })();
  if (verdict?.tagline?.trim()) return verdict.tagline.trim();
  if (verdict?.summary?.trim()) return verdict.summary.trim();
  if (repo.description?.trim()) return repo.description.trim();
  return `Open-source ${repo.language ?? "project"} with ${Intl.NumberFormat("en", { notation: "compact" }).format(repo.stars ?? 0)} GitHub stars.`;
}

export async function generateMetadata({ params }: PageProps) {
  const { topic } = await params;
  const t = getBestTopic(topic);
  if (!t) {
    // Unknown slug → noindex everything. Without this, the layout's
    // `robots: { index: true, follow: true }` bleeds into the rendered
    // not-found page AND Next auto-injects another noindex → dual robots
    // tags. Match /repo/[owner]/[name]/page.tsx's pattern.
    return {
      title: `Best of — ${SITE_NAME}`,
      robots: { index: false, follow: false },
      alternates: { canonical: undefined },
    };
  }

  const year = new Date().getFullYear();
  const title = `${t.title} (${year}) | ${SITE_NAME}`;
  const description = clampDescription(
    `${t.title}: ${t.blurb}. Ranked by cross-source momentum across GitHub, Hacker News, X, Bluesky, Product Hunt and Dev.to. Updated continuously.`,
  );
  const canonical = absoluteUrl(`/best/${topic}`);

  return {
    title,
    description,
    // Explicit index:true — these high-intent listicles are the primary GEO
    // ranking targets. Belt-and-braces against any historical noindex Google
    // may have cached from prior ISR misses.
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function BestTopicPage({ params }: PageProps) {
  const { topic } = await params;
  const t = getBestTopic(topic);
  if (!t) notFound();

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
    refreshEditorialBestFromStore().catch(() => undefined),
  ]);

  const repos = (() => {
    try {
      return selectTopicRepos(t, 15);
    } catch {
      return [];
    }
  })();

  const entries: RankedEntry[] = repos.map((repo) => ({ repo, blurb: entryBlurb(repo) }));

  const fetchedAt = (() => {
    try {
      return getLastFetchedAt() || null;
    } catch {
      return null;
    }
  })();

  const intro = buildBestIntro(t, repos);
  const faq = buildBestFaq(t, repos);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Best", path: "/best" },
    { name: t.title.replace(/^Best /, ""), path: `/best/${topic}` },
  ]);
  const itemList = buildItemListJsonLd(
    t.title,
    `/best/${topic}`,
    entries.slice(0, 15).map((e) => ({
      name: e.repo.fullName,
      path: `/repo/${e.repo.owner}/${e.repo.name}`,
      description: e.blurb,
    })),
  );
  const faqLd = buildFaqJsonLd(faq);

  const updatedIso = fetchedAt ?? new Date().toISOString();
  const updatedLabel = new Date(updatedIso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Person-attributed Article wraps the curated intro. Best-of lists are a
  // human curation surface, so the byline carries the E-E-A-T weight that
  // template-only schema can't. dateModified mirrors the live updatedIso so
  // freshness signals stay aligned with the visible "Updated" line.
  const articleAuthor = buildPersonJsonLd({
    name: "Mirko Basil",
    url: "https://aiso.tools",
  });
  const article = buildArticleJsonLd({
    headline: t.title,
    url: `/best/${topic}`,
    datePublished: "2026-05-23T00:00:00.000Z",
    dateModified: updatedIso,
    author: articleAuthor,
    description: `${t.title}: ${t.blurb}. Curated, ranked open-source projects with editorial commentary.`,
  });

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={article} />
      {entries.length > 0 ? <JsonLd data={itemList} /> : null}
      <JsonLd data={faqLd} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/best">Best</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{t.title.replace(/^Best /, "")}</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="trophy" size={14} /> Best of · Open source
        </div>
        <h1>{t.title}</h1>
        <p>{intro}</p>
        <div className="hero-meta">
          <span>
            Curated by{" "}
            <a href="https://aiso.tools" rel="author">
              Mirko Basil
            </a>
          </span>
          <span>
            {" · "}Updated <time dateTime={updatedIso}>{updatedLabel}</time>
          </span>
          {repos.length > 0 ? (
            <span>
              {" · "}
              <span className="num">{repos.length}</span> projects ranked
            </span>
          ) : null}
        </div>
      </header>

      <RankedRepoList entries={entries} />

      <SeoFaq entries={faq} title={`${t.title} — FAQ`} headingId="best-faq-head" />

      <nav className="card" aria-label="More category leaderboards">
        <div className="card-head">
          <h2 className="card-title">{"▌"} <b>Browse full category leaderboards</b></h2>
        </div>
        <div className="card-body">
          <p className="muted">
            Want the complete ranked feed instead of the editorial top picks? See the{" "}
            <Link href="/categories">category leaderboards</Link>.
          </p>
        </div>
      </nav>
    </div>
  );
}
