// /blog/[slug] — rendered MDX article.
//
// Static: generateStaticParams over content/blog, dynamicParams=false so
// unknown slugs 404 and all MDX reads happen at build (no runtime fs needed
// for the standalone server). Emits BlogPosting + BreadcrumbList JSON-LD and
// visible <time> dates — informational head-term + answer-engine bait that
// internal-links to the category/best answer surfaces.

import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";

import { getAllSlugs, getPostBySlug } from "@/lib/blog";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo";
import { buildBreadcrumbJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { Icon } from "@/components/icon/Icon";

export const dynamicParams = false;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return {
      title: `Blog — ${SITE_NAME}`,
      robots: { index: false, follow: false },
      alternates: { canonical: undefined },
    };
  }
  const canonical = absoluteUrl(`/blog/${slug}`);
  return {
    title: `${post.title} | ${SITE_NAME}`,
    description: post.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: canonical,
      publishedTime: post.date,
      modifiedTime: post.updated,
      images: [{ url: "/api/og/default", width: 1200, height: 630, alt: post.title }],
    },
    twitter: { card: "summary_large_image" as const, title: post.title, description: post.description },
  };
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const url = absoluteUrl(`/blog/${slug}`);
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${slug}` },
  ]);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated,
    url,
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: post.author ?? SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isAccessibleForFree: true,
  };

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      <JsonLd data={articleLd} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/blog">Blog</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{post.title}</span>
      </nav>

      <article className="card">
        <header className="hero">
          <div className="hero-eyebrow">
            <Icon name="file-text" size={14} /> Blog
          </div>
          <h1>{post.title}</h1>
          <div className="hero-meta">
            <span>
              Published <time dateTime={post.date}>{fmt(post.date)}</time>
            </span>
            {post.updated && post.updated !== post.date ? (
              <span>
                {" · "}Updated <time dateTime={post.updated}>{fmt(post.updated)}</time>
              </span>
            ) : null}
          </div>
        </header>
        <div className="card-body pf-prose">
          <MDXRemote source={post.body} />
        </div>
      </article>
    </div>
  );
}
