// Category-scoped channel chips. Sums per-source mention counts across
// every repo in the current category and renders one chip per source.
// Click → deep-link to that source's page filtered by category.
//
// Server component. Uses pre-attached Repo.channelStatus + per-channel
// rollups already on the Repo objects so this stays cheap to render.

import Link from "next/link";

import type { Repo } from "@/lib/types";

interface CategoryNewsRollupProps {
  /** Repos already filtered to the current category. */
  repos: Repo[];
  /** Slug used to deep-link source pages. */
  categorySlug: string;
  /** Display name shown in the leading label. */
  categoryLabel: string;
}

interface ChannelTally {
  key: "reddit" | "hn" | "bluesky" | "devto";
  label: string;
  href: string;
  /** Number of repos in this category with at least one mention on this source. */
  reposLit: number;
  /** Sum of mention counts across all repos in this category. */
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
        (sum, r) => sum + ((r as Repo & { hn?: { mentions7d?: number } }).hn?.mentions7d ?? 0),
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
        (sum, r) => sum + ((r as Repo & { devto?: { mentions7d?: number } }).devto?.mentions7d ?? 0),
        0,
      ),
    },
  ];

  const totalLit = tallies.reduce((s, t) => s + t.reposLit, 0);
  if (totalLit === 0) return null;

  return (
    <section className="rounded-card border border-border-primary bg-bg-card p-4 mb-6">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        {categoryLabel} · talked about across news sources (7d)
      </h2>
      <div className="flex flex-wrap gap-2">
        {tallies.map((t) =>
          t.reposLit === 0 ? null : (
            <Link
              key={t.key}
              href={t.href}
              className="rounded-md border border-border-primary bg-bg-muted px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:border-brand hover:text-text-primary"
              title={`${t.reposLit} ${categoryLabel} repos with mentions on ${t.label}`}
            >
              <span className="text-text-primary">{t.label}</span>
              <span className="ml-2 text-text-tertiary tabular-nums">
                {t.mentions || t.reposLit}× · {t.reposLit} repos
              </span>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

export default CategoryNewsRollup;
