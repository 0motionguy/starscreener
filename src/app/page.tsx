// StarScreener — Home (Phase 3 / P9)
//
// Server component. Reads the derived Repo[] from committed JSON
// (data/trending.json + data/deltas.json) and hands the top 80 by
// starsDelta24h to TerminalLayout. The in-memory pipeline store is empty
// on cold Vercel Lambdas, so reading from JSON is the only way to serve
// non-empty repo cards consistently.

import type { Metadata } from "next";
import { getDerivedRepos } from "@/lib/derived-repos";
import { lastFetchedAt } from "@/lib/trending";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import { MindshareMap } from "@/components/terminal/MindshareMap";
import { HomeHero } from "@/components/terminal/HomeHero";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "StarScreener — Repo Momentum Terminal",
  description: "Discover trending GitHub repos before they blow up.",
};

export default async function HomePage() {
  const all = getDerivedRepos();
  const repos = [...all]
    .sort((a, b) => b.starsDelta24h - a.starsDelta24h)
    .slice(0, 80);

  const breakouts = all.filter((r) => r.movementStatus === "breakout").length;
  const rising = all.filter((r) => r.movementStatus === "rising").length;

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="full"
      showFeatured
      featuredCount={8}
      heading={
        <>
          <HomeHero
            totalTracked={all.length}
            breakouts={breakouts}
            rising={rising}
            fetchedAt={lastFetchedAt}
          />
          <MindshareMap repos={all} />
        </>
      }
    />
  );
}
