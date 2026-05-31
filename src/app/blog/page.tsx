// /blog — index of MDX posts (trend reports, explainers, deep-dives).

import Link from "next/link";

import { getAllPostsMeta } from "@/lib/blog";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { Icon } from "@/components/icon/Icon";

const TITLE = `Blog — Open-Source AI & Developer Trends | ${SITE_NAME}`;
const DESCRIPTION =
  "Trend reports, explainers and deep-dives on the open-source AI and developer ecosystem — what's breaking out across GitHub, Hacker News, Bluesky, Dev.to and more, and why.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/blog") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/blog"),
    images: [{ url: "/api/og/default", width: 1200, height: 630, alt: `${SITE_NAME} blog` }],
  },
  twitter: { card: "summary_large_image" as const, title: TITLE, description: DESCRIPTION, images: ["/api/og/default"] },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function BlogIndexPage() {
  const posts = getAllPostsMeta();

  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
  ]);
  const itemList = buildItemListJsonLd(
    "TrendingRepo blog",
    "/blog",
    posts.map((p) => ({ name: p.title, path: `/blog/${p.slug}`, description: p.description })),
  );

  return (
    <div className="route-shell">
      <JsonLd data={breadcrumb} />
      {posts.length > 0 ? <JsonLd data={itemList} /> : null}

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Blog</span>
      </nav>

      <header className="hero">
        <div className="hero-eyebrow">
          <Icon name="file-text" size={14} /> Blog
        </div>
        <h1>Open-source AI &amp; developer trends</h1>
        <p>
          Trend reports, explainers and deep-dives on what&apos;s breaking out across the
          open-source AI and developer ecosystem — and how we read the signals.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="card">
          <div className="card-body muted">No posts yet — check back soon.</div>
        </div>
      ) : (
        <div className="col gap-3">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="card" prefetch={false}>
              <div className="card-body">
                <h2 className="card-title" style={{ margin: "0 0 6px" }}>{p.title}</h2>
                <p className="muted" style={{ margin: "0 0 8px" }}>{p.description}</p>
                <div className="label-meta">
                  <time dateTime={p.date}>{fmt(p.date)}</time>
                  {p.tags && p.tags.length > 0 ? ` · ${p.tags.join(" · ")}` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
