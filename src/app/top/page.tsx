// TrendingRepo — /top canonical "Top 100 by stars" landing.
//
// V2 design system. Server-rendered from the same derived repo index
// so first paint is fast and the list is SSR'd for SEO.

import type { Metadata } from "next";
import { getDerivedRepos } from "@/lib/derived-repos";
import { TrendingTableV2 } from "@/components/today-v2/TrendingTableV2";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Top 100 GitHub Repos by Stars",
  description:
    "The 100 most-starred GitHub repositories as tracked by TrendingRepo. Ranked by total stars across the tracked AI + developer-tools universe.",
  alternates: { canonical: "/top" },
};

const TOP_N = 100;

export default async function TopPage() {
  const repos = getDerivedRepos()
    .slice()
    .sort((a, b) => b.stars - a.stars)
    .slice(0, TOP_N);

  return (
    <>
      {/* Page title — small mono label, V2 pattern */}
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <h1
            className="v2-mono mb-3 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            TOP 100 · BY STARS · CANONICAL
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch]"
            style={{ color: "var(--v2-ink-200)" }}
          >
            The 100 most-starred GitHub repositories tracked by
            TrendingRepo. Ranked by total stars across the AI + developer-
            tools universe.
          </p>
        </div>
      </section>

      <TrendingTableV2 repos={repos} limit={TOP_N} sortBy="none" />
    </>
  );
}
