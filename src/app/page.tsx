// StarScreener — Home (Phase 3 / P9)
//
// Server component. Reads the derived Repo[] from committed JSON
// (data/trending.json + data/deltas.json) and hands the top 80 by
// starsDelta24h to TerminalLayout. The in-memory pipeline store is empty
// on cold Vercel Lambdas, so reading from JSON is the only way to serve
// non-empty repo cards consistently.

import type { Metadata } from "next";
import { getDerivedRepos } from "@/lib/derived-repos";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";
import { BubbleMap } from "@/components/terminal/BubbleMap";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "StarScreener — AI Trending Terminal",
  description:
    "The live AI repo trending terminal. Bubble map, feeds, CLI, and MCP — so every agent and every terminal sees what's heating up.",
};

export default async function HomePage() {
  const repos = getDerivedRepos();

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="full"
      showFeatured
      featuredCount={8}
      heading={<BubbleMap repos={repos} limit={220} />}
    />
  );
}
