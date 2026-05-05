import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getBrief } from "@/lib/briefs";
import { SITE_NAME, absoluteUrl, safeJsonLd } from "@/lib/seo";

interface BriefPageProps {
  params: Promise<{ owner: string; name: string }>;
}

export const revalidate = 300;

function bodyParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export async function generateMetadata({ params }: BriefPageProps): Promise<Metadata> {
  const { owner, name } = await params;
  const brief = await getBrief(owner, name);

  if (!brief) {
    return {
      title: `Brief Not Found - ${SITE_NAME}`,
      robots: { index: false, follow: true },
      alternates: { canonical: absoluteUrl(`/brief/${owner}/${name}`) },
    };
  }

  const title = `${brief.name}: ${brief.hook}`;
  const description = brief.what;

  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/brief/${owner}/${name}`) },
    openGraph: {
      type: "article",
      title,
      description,
      url: absoluteUrl(`/brief/${owner}/${name}`),
      siteName: SITE_NAME,
      images: [absoluteUrl(`/brief/${owner}/${name}/opengraph-image`)],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(`/brief/${owner}/${name}/opengraph-image`)],
    },
  };
}

export default async function BriefPage({ params }: BriefPageProps) {
  const { owner, name } = await params;
  const brief = await getBrief(owner, name);

  if (!brief) {
    notFound();
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${brief.name}: ${brief.hook}`,
    description: brief.what,
    author: {
      "@type": "Person",
      name: "TrendingRepo Editorial",
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    datePublished: brief.written_at,
    dateModified: brief.written_at,
    mainEntityOfPage: absoluteUrl(`/brief/${brief.owner}/${brief.name}`),
    url: absoluteUrl(`/brief/${brief.owner}/${brief.name}`),
  };

  return (
    <main className="home-surface" style={{ paddingTop: 24, paddingBottom: 32 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }} />
      <article className="panel" style={{ padding: 24 }}>
        <header style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "var(--v4-mono)", fontSize: 12, color: "var(--v4-ink-400)", margin: 0 }}>
            {brief.owner}/{brief.name}
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1.2 }}>{brief.hook}</h1>
        </header>

        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0,1fr) minmax(220px,300px)" }}>
          <section>
            {bodyParagraphs(brief.body).map((paragraph, idx) => (
              <p key={`${paragraph.slice(0, 16)}-${idx}`} style={{ marginTop: idx === 0 ? 0 : 14, lineHeight: 1.7 }}>
                {paragraph}
              </p>
            ))}
          </section>

          <aside>
            <h2 style={{ margin: "0 0 10px", fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase" }}>Sources</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
              {brief.sources.map((source) => (
                <li key={source}>
                  <Link href={source} target="_blank" rel="noopener noreferrer">
                    {source}
                  </Link>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 16, fontSize: 12, color: "var(--v4-ink-400)"}>Written at: {brief.written_at}</p>
          </aside>
        </div>
      </article>
    </main>
  );
}