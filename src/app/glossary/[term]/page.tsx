// /glossary/[term] — definitional "What is X?" answer-surface.
//
// Featured-snippet + AI-Overview bait: a crisp original definition (DefinedTerm
// + FAQPage schema) grounded with the live trending repos for the term, linking
// into the relevant category/best surfaces. ISR; data-store reads only.

import { notFound } from "next/navigation";
import Link from "next/link";

import { refreshTrendingFromStore } from "@/lib/trending";
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshAllMentionStores } from "@/lib/refresh-mentions";
import {
  GLOSSARY_SLUGS,
  getGlossaryTerm,
  getGlossaryRepos,
  buildGlossaryFaq,
} from "@/lib/glossary";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo";
import { buildBreadcrumbJsonLd, buildFaqJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { SeoFaq } from "@/components/seo/SeoFaq";
import { RankedRepoList, type RankedEntry } from "@/components/seo/RankedRepoList";
import { Icon } from "@/components/icon/Icon";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ term: string }>;
}

export function generateStaticParams() {
  return GLOSSARY_SLUGS.map((term) => ({ term }));
}

function clamp(text: string, max = 155): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps) {
  const { term: slug } = await params;
  const t = getGlossaryTerm(slug);
  if (!t) return { title: `Glossary — ${SITE_NAME}` };
  const title = `What is ${t.term}? Definition + trending projects | ${SITE_NAME}`;
  const description = clamp(t.short);
  const canonical = absoluteUrl(`/glossary/${slug}`);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function GlossaryTermPage({ params }: PageProps) {
  const { term: slug } = await params;
  const t = getGlossaryTerm(slug);
  if (!t) notFound();

  await Promise.all([
    refreshTrendingFromStore().catch(() => undefined),
    refreshRepoRegistryFromStore().catch(() => undefined),
    refreshAllMentionStores().catch(() => undefined),
  ]);

  const repos = (() => {
    try {
      return getGlossaryRepos(t, 8);
    } catch {
      return [];
    }
  })();
  const entries: RankedEntry[] = repos.map((repo) => ({
    repo,
    blurb: repo.description?.trim() || `Open-source ${repo.language ?? "project"}.`,
  }));
  const faq = buildGlossaryFaq(t);

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Glossary", path: "/glossary" },
    { name: t.term, path: `/glossary/${slug}` },
  ]);
  const definedTerm = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: t.term,
    description: t.short,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "TrendingRepo Glossary",
      url: absoluteUrl("/glossary"),
    },
    url: absoluteUrl(`/glossary/${slug}`),
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
  const faqLd = buildFaqJsonLd(faq);

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={definedTerm} />
      <JsonLd data={faqLd} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/glossary">Glossary</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{t.term}</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="book" size={14} /> Glossary
        </div>
        <h1>{`What is ${t.term}?`}</h1>
        <p>{t.short}</p>
      </header>

      <article className="card">
        <div className="card-body pf-prose">
          {t.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <p>
            <Link href={t.related.href}>{t.related.label} →</Link>
          </p>
        </div>
      </article>

      {entries.length > 0 ? (
        <>
          <h2 className="label-section" style={{ margin: "8px 0 0" }}>
            Trending {t.term} projects
          </h2>
          <RankedRepoList entries={entries} />
        </>
      ) : null}

      <SeoFaq entries={faq} title={`${t.term} — FAQ`} headingId="glossary-faq-head" />
    </div>
  );
}
