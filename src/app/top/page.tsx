// TrendingRepo — /top canonical "Top 100 by stars" landing.
//
// Served as a dedicated URL (not /search?sort=stars-total&limit=100)
// so Google, social-share previews, and inbound links all hit a
// stable canonical. Server-rendered from the same derived repo index
// so first paint is fast and the list is SSR'd for SEO.

import type { Metadata } from "next";
import { getDerivedRepos } from "@/lib/derived-repos";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Top 100 GitHub Repos by Stars",
  description:
    "The 100 most-starred GitHub repositories as tracked by TrendingRepo. Sortable by momentum, 24h / 7d / 30d star velocity, language, and category.",
  alternates: { canonical: "/top" },
};

const TOP_N = 100;

export default async function TopPage() {
  const repos = getDerivedRepos()
    .slice()
    .sort((a, b) => b.stars - a.stars)
    .slice(0, TOP_N);

  const heading = (
    <div className="px-4 sm:px-6 pt-6 pb-2">
      <span className="label-micro">Top 100</span>
      <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary mt-2">
        The 100 most-starred repos in the index.
      </h1>
      <p className="mt-2 text-text-secondary text-sm md:text-base leading-relaxed">
        Ranked by total stars across the tracked AI + developer-tools
        universe. Sort the grid by momentum, 24h/7d/30d velocity, or any
        other column to re-cut the list without leaving the page.
      </p>
    </div>
  );

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="search"
      showFeatured={false}
      heading={heading}
    />
  );
}
