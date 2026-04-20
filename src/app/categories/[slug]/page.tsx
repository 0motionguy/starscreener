// StarScreener — Category detail (Phase 3)
//
// Server component. Resolves the category from the slug, loads the full
// set of repos in that category via the pipeline facade, and renders the
// dense terminal surface with a category-specific heading and FilterBar
// variant. No more card grid — category pages are full terminal pages.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import { CATEGORIES } from "@/lib/constants";
import { getCategoryIcon } from "@/lib/category-icons";
import { getDerivedRepos } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  const canonical = absoluteUrl(`/categories/${slug}`);
  if (!category) {
    return {
      title: `Category Not Found — ${SITE_NAME}`,
      description: "This category doesn't exist or was removed.",
      alternates: { canonical },
      robots: { index: false, follow: true },
    };
  }
  const title = `${category.name} — ${SITE_NAME}`;
  const description = `${category.description}. Live momentum ranks for every ${category.shortName} repo on ${SITE_NAME}.`;
  return {
    title,
    description,
    keywords: [
      category.name,
      category.shortName,
      "GitHub category",
      "open source",
      "repo momentum",
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.id === slug);
  if (!category) notFound();

  const repos = getDerivedRepos().filter((repo) => repo.categoryId === slug);
  const Icon = getCategoryIcon(category.icon);

  const heading = (
    <div className="px-4 sm:px-6 pt-6 pb-2">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs text-text-tertiary mb-3"
      >
        <Link
          href="/"
          className="hover:text-text-primary transition-colors"
        >
          Home
        </Link>
        <span aria-hidden="true">›</span>
        <Link
          href="/categories"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          Categories
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-text-primary">{category.name}</span>
      </nav>
      <div className="flex items-center gap-3">
        {Icon && (
          <Icon size={28} style={{ color: category.color }} aria-hidden="true" />
        )}
        <h1 className="font-display text-3xl font-bold text-text-primary">
          {category.name}
        </h1>
      </div>
      <p className="mt-2 text-text-secondary max-w-2xl">
        {category.description}
      </p>
    </div>
  );

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="category"
      featuredCount={4}
      heading={heading}
    />
  );
}
