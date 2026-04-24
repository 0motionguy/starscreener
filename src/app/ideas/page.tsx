// TrendingRepo — /ideas feed.
//
// P0 ships the "New" tab only. Hot + Resolving are wired in P1 once we have
// enough ideas for meaningful ranking.

import { IdeaFeedClient } from "@/components/builder/IdeaFeedClient";
import { getBuilderStore } from "@/lib/builder/store";

export const dynamic = "force-dynamic";
export const revalidate = 30;

export const metadata = {
  title: "Ideas · TrendingRepo",
  description:
    "A live feed of builder-grade ideas anchored to trending GitHub repos. Every idea cites the signal it's responding to and lists the stack required to ship it.",
};

export default async function IdeasPage() {
  const store = getBuilderStore();
  const initialIdeas = await store.listIdeas({
    sort: "new",
    limit: 30,
    offset: 0,
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary">
          Ideas
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          A builder-grade feed. Every idea is anchored to at least one trending
          repo and names the signal it&apos;s responding to. Hit{" "}
          <code className="font-mono text-text-primary">use / build / buy / invest</code>{" "}
          to stake your conviction.
        </p>
      </header>
      <IdeaFeedClient initial={initialIdeas} />
    </main>
  );
}
