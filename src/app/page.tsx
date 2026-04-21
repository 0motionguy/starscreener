// TrendingRepo — Home (Phase 3 / P9)
//
// Server component. Reads the derived Repo[] from committed JSON
// (data/trending.json + data/deltas.json) and hands the top 80 by
// starsDelta24h to TerminalLayout. The in-memory pipeline store is empty
// on cold Vercel Lambdas, so reading from JSON is the only way to serve
// non-empty repo cards consistently.
//
// Title/description metadata is inherited from the root layout template
// — no per-page override here so the canonical "TrendingRepo — {tagline}"
// formula stays source-of-truth in one place (src/lib/seo.ts).

import { getDerivedRepos } from "@/lib/derived-repos";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import { BubbleMap } from "@/components/terminal/BubbleMap";

// ISR: data/*.json only changes when the GHA scrape commits new trending
// data, so serving the homepage from a 30-minute edge cache is safe. Drops
// per-request getDerivedRepos() re-runs (15 passes × ~2.4k rows + full
// scoreBatch) from ~300 ms to a lookup. `force-dynamic` is no longer needed.
export const revalidate = 1800;

export default async function HomePage() {
  const repos = getDerivedRepos();

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="full"
      showFeatured
      featuredCount={8}
      heading={
        <>
          {/* BubbleMap is illegible on phones (~108px tall in viewBox 1200x360
              — bubble labels collapse to dots). Hide on <md and let the
              terminal cards drive the mobile narrative. */}
          <div className="hidden md:block">
            <BubbleMap repos={repos} limit={220} />
          </div>
        </>
      }
    />
  );
}
