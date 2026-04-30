// Category-scoped channel chips.

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface CategoryNewsRollupProps {
  repos: Repo[];
  categorySlug: string;
  categoryLabel: string;
}

interface ChannelTally {
  key: "reddit" | "hn" | "bluesky" | "devto";
  label: string;
  href: string;
  reposLit: number;
  mentions: number;
}

export function CategoryNewsRollup({
  repos,
  categorySlug,
  categoryLabel,
}: CategoryNewsRollupProps) {
  const tallies: ChannelTally[] = [
    {
      key: "reddit",
      label: "Reddit",
      href: `/reddit?category=${categorySlug}`,
      reposLit: repos.filter((r) => r.channelStatus?.reddit).length,
      mentions: repos.reduce(
        (sum, r) => sum + (r.reddit?.mentions7d ?? 0),
        0,
      ),
    },
    {
      key: "hn",
      label: "Hacker News",
      href: `/hackernews/trending?category=${categorySlug}`,
      reposLit: repos.filter((r) => r.channelStatus?.hn).length,
      mentions: repos.reduce(
        (sum, r) =>
          sum + ((r as Repo & { hn?: { mentions7d?: number } }).hn?.mentions7d ?? 0),
        0,
      ),
    },
    {
      key: "bluesky",
      label: "Bluesky",
      href: `/bluesky/trending?category=${categorySlug}`,
      reposLit: repos.filter((r) => r.channelStatus?.bluesky).length,
      mentions: repos.reduce(
        (sum, r) => sum + (r.bluesky?.mentions7d ?? 0),
        0,
      ),
    },
    {
      key: "devto",
      label: "dev.to",
      href: `/devto?category=${categorySlug}`,
      reposLit: repos.filter((r) => r.channelStatus?.devto).length,
      mentions: repos.reduce(
        (sum, r) =>
          sum +
          ((r as Repo & { devto?: { mentions7d?: number } }).devto?.mentions7d ??
            0),
        0,
      ),
    },
  ];

  const totalLit = tallies.reduce((sum, tally) => sum + tally.reposLit, 0);
  if (totalLit === 0) return null;

  return (
    <section className="panel category-news-rollup">
      <div className="panel-head">
        <span className="key">{"// SOURCE MENTIONS"}</span>
        <span className="right">
          <span className="live">{categoryLabel} / 7d</span>
        </span>
      </div>
      <div className="category-news-chips">
        {tallies.map((tally) =>
          tally.reposLit === 0 ? null : (
            <Link
              key={tally.key}
              href={tally.href}
              className="category-news-chip"
              title={`${tally.reposLit} ${categoryLabel} repos with mentions on ${tally.label}`}
            >
              <span>{tally.label}</span>
              <b>
                {tally.mentions || tally.reposLit}x / {tally.reposLit} repos
              </b>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

export default CategoryNewsRollup;
