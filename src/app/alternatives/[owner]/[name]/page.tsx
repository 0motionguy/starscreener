// /alternatives/[owner]/[name] — "alternatives to X" answer-surface.
//
// High-intent search + AI-Overview query. Same-category peers ranked by
// cross-source momentum, verdict-forward (real "why it ranks" blurb per
// entry). Gated: target must exist + have >= MIN_ALTERNATIVES peers, else
// 404 (no thin near-empty pages). ISR; data-store reads only.

import { notFound } from "next/navigation";
import Link from "next/link";

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import {
  refreshConsensusVerdictsFromStore,
  getConsensusItemReport,
} from "@/lib/consensus-verdicts";
import { refreshEditorialAlternativesFromStore } from "@/lib/editorial-alternatives";
import {
  getAlternatives,
  buildAlternativesIntro,
  buildAlternativesFaq,
  MIN_ALTERNATIVES,
} from "@/lib/alternatives";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildFaqJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { RankedRepoList, type RankedEntry } from "@/components/seo/RankedRepoList";
import { Icon } from "@/components/icon/Icon";
import type { Repo } from "@/lib/types";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
}

function entryBlurb(repo: Repo): string {
  const v = (() => {
    try {
      return getConsensusItemReport(repo.fullName);
    } catch {
      return null;
    }
  })();
  if (v?.tagline?.trim()) return v.tagline.trim();
  if (v?.summary?.trim()) return v.summary.trim();
  if (repo.description?.trim()) return repo.description.trim();
  return `Open-source ${repo.language ?? "project"} with ${Intl.NumberFormat("en", { notation: "compact" }).format(repo.stars ?? 0)} GitHub stars.`;
}

export async function generateMetadata({ params }: PageProps) {
  const { owner, name } = await params;
  const full = `${owner}/${name}`;

  // CRITICAL: probe the registry FIRST. The page render below calls
  // notFound() when the target is missing or has fewer than MIN_ALTERNATIVES
  // peers. If metadata returns index:true while the render returns 404, Next
  // emits dual <meta robots> tags AND a fake title impersonating a real page
  // — the exact pattern that cost /repo/* ~95% of impressions in late May.
  // On any transient store outage, fall through to indexable (better to keep
  // a working URL indexable than to noindex on flake; worker freshness gate
  // already blocks deploys on cold worker state).
  let canShow = false;
  try {
    await Promise.all([
      refreshTrendingFromStore().catch(() => undefined),
      refreshRepoRegistryFromStore().catch(() => undefined),
      refreshAllMentionStores().catch(() => undefined),
    ]);
    const { target, alternatives } = getAlternatives(full, 12);
    canShow = !!target && alternatives.length >= MIN_ALTERNATIVES;
  } catch {
    canShow = true;
  }

  if (!canShow) {
    return {
      title: `Alternatives — ${SITE_NAME}`,
      robots: { index: false, follow: false },
      alternates: { canonical: undefined },
    };
  }

  const title = `${full} Alternatives — Top Open-Source Options | ${SITE_NAME}`;
  const description = `The best open-source alternatives to ${full}, ranked by cross-source momentum across GitHub, Hacker News, X, Bluesky, Product Hunt and Dev.to. Updated continuously.`;
  const canonical = absoluteUrl(`/alternatives/${owner}/${name}`);
  // OG supplied by colocated opengraph-image.tsx (auto-injected).
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function AlternativesPage({ params }: PageProps) {
  const { owner, name } = await params;
  const fullName = `${owner}/${name}`;

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
    refreshConsensusVerdictsFromStore().catch(() => undefined),
    refreshEditorialAlternativesFromStore().catch(() => undefined),
  ]);

  const { target, alternatives, categoryName } = getAlternatives(fullName, 12);
  if (!target || alternatives.length < MIN_ALTERNATIVES) notFound();

  const entries: RankedEntry[] = alternatives.map((repo) => ({ repo, blurb: entryBlurb(repo) }));
  const intro = buildAlternativesIntro(target, alternatives, categoryName);
  const faq = buildAlternativesFaq(target, alternatives, categoryName);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: target.fullName, path: `/repo/${target.owner}/${target.name}` },
    { name: "Alternatives", path: `/alternatives/${owner}/${name}` },
  ]);
  const itemList = buildItemListJsonLd(
    `Alternatives to ${target.fullName}`,
    `/alternatives/${owner}/${name}`,
    entries.map((e) => ({
      name: e.repo.fullName,
      path: `/repo/${e.repo.owner}/${e.repo.name}`,
      description: e.blurb,
    })),
  );
  const faqLd = buildFaqJsonLd(faq);

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />
      <JsonLd data={faqLd} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/repo/${target.owner}/${target.name}`}>{target.fullName}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Alternatives</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="swap" size={14} /> Alternatives
        </div>
        <h1>Best alternatives to {target.fullName}</h1>
        <p>{intro}</p>
        <div className="hero-meta">
          <Link href={`/repo/${target.owner}/${target.name}`}>← Back to {target.name}</Link>
          {categoryName ? (
            <span>
              {" · "}
              <Link href={`/categories/${target.categoryId}`}>All {categoryName}</Link>
            </span>
          ) : null}
        </div>
      </header>

      <RankedRepoList entries={entries} />

      <SeoFaq entries={faq} title={`Alternatives to ${target.name} — FAQ`} headingId="alt-faq-head" />
    </div>
  );
}
