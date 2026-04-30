// TrendingRepo — single-repo Star Activity sub-route.
//
// Sub-route under /repo/[owner]/[name]/ that renders the full-history star
// chart with the operator-terminal toggles + the ShareBar. Designed as the
// "deep view" for a single repo's star history; the parent /repo/.../page
// links here from the compact preview card.
//
// og:image / twitter:image are wired here so pasting the URL into X
// auto-unfurls with our actual /api/og/star-activity card for this repo.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";
import {
  getStarActivity,
  refreshStarActivityFromStore,
} from "@/lib/star-activity";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { buildAbsoluteShareImageUrl } from "@/lib/star-activity-url";

import { StarActivityClient } from "./StarActivityClient";

export const dynamic = "force-dynamic";

const SLUG_PART = /^[A-Za-z0-9._-]+$/;

interface PageProps {
  params: Promise<{ owner: string; name: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, name } = await params;
  if (!SLUG_PART.test(owner) || !SLUG_PART.test(name)) {
    return {};
  }
  const fullName = `${owner}/${name}`;
  const canonical = absoluteUrl(`/repo/${owner}/${name}/star-activity`);
  const imageUrl = buildAbsoluteShareImageUrl({
    repos: [fullName],
    mode: "date",
    scale: "lin",
    legend: "tr",
    aspect: "h",
  });
  const title = `${fullName} — Star Activity — ${SITE_NAME}`;
  const description = `Full-history star activity for ${fullName}. Compare against up to 3 other repos and share the chart.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 675,
          alt: `Star activity of ${fullName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function StarActivityPage({ params }: PageProps) {
  const { owner, name } = await params;
  if (!SLUG_PART.test(owner) || !SLUG_PART.test(name)) {
    notFound();
  }
  const fullName = `${owner}/${name}`;

  // Refresh both caches in parallel — repo-metadata for the title/stars/desc,
  // star-activity for the chart series. Each refresh has its own dedupe so
  // calling them on every render is cheap.
  await Promise.all([
    refreshRepoMetadataFromStore(),
    refreshStarActivityFromStore(fullName),
  ]);

  const repo = getDerivedRepoByFullName(fullName);
  if (!repo) {
    notFound();
  }
  const payload = getStarActivity(fullName);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <nav
        aria-label="Breadcrumb"
        className="text-[11px] font-mono uppercase tracking-[0.14em] text-text-tertiary mb-4 flex items-center gap-2"
      >
        <Link
          href={`/repo/${owner}/${name}`}
          className="hover:text-text-secondary"
        >
          {fullName}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-text-secondary">star activity</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-tertiary">
          {`// STAR ACTIVITY · ${fullName}`}
        </h1>
        {repo.description && (
          <p className="mt-2 text-sm text-text-secondary max-w-3xl">
            {repo.description}
          </p>
        )}
      </header>

      <StarActivityClient repo={repo} payload={payload} />
    </main>
  );
}
