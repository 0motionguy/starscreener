// StarScreener — Home (Phase 3)
//
// Server component. Seeds repos via the pipeline facade and hands the
// full working set to TerminalLayout. All visual composition (FilterBar,
// FeaturedCards, Terminal) lives inside TerminalLayout.

import type { Metadata } from "next";
import { pipeline } from "@/lib/pipeline/pipeline";
import { TerminalLayout } from "@/components/terminal/TerminalLayout";

// Pipeline state is mutable (cron writes new snapshots hourly). Skip
// full-route caching so each request sees the current store.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "StarScreener — Repo Momentum Terminal",
  description: "Discover trending GitHub repos before they blow up.",
};

export default async function HomePage() {
  // Hydrate persisted pipeline state from disk (or fall back to mock seed)
  // before the first query so a server restart resumes in place.
  await pipeline.ensureReady();
  const repos = pipeline.getTopMovers("today", 80);

  return (
    <TerminalLayout
      repos={repos}
      filterBarVariant="full"
      showFeatured
      featuredCount={8}
    />
  );
}
