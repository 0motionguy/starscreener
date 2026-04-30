// TrendingRepo - /top canonical "Top 100 by stars" landing.

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
    <section className="page-head">
      <div>
        <div className="crumb">
          <b>Trend terminal</b> / top 100
        </div>
        <h1>The 100 most-starred repos in the index.</h1>
        <p className="lede">
          Ranked by total stars across the tracked AI and developer-tools
          universe. Sort the grid by momentum, 24h, 7d, 30d velocity, or any
          other column to recut the list without leaving the terminal.
        </p>
      </div>
      <div className="clock">
        <span className="big">{TOP_N}</span>
        <span className="live">repos ranked</span>
      </div>
    </section>
  );

  return (
    <TerminalLayout
      repos={repos}
      className="home-surface terminal-page top-page"
      filterBarVariant="search"
      showFeatured={false}
      heading={heading}
      sortOverride={{ column: "stars", direction: "desc" }}
    />
  );
}
