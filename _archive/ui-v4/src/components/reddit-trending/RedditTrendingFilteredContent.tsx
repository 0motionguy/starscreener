"use client";

// Reddit Trending — client-side filter shell.
//
// Cache fix B (matches #1606): the previous server component awaited
// `searchParams`, which forced /reddit/trending off ISR (full dynamic on every
// request). This component is a client-island wrapper so the surrounding RSC
// shell stays statically prerenderable under `revalidate=1800`.
//
// The empty-tab auto-redirect that used to live in the RSC (via
// `redirect("?tab=...")`) is no longer needed here — `AllTrendingTabs` already
// performs the same redirect on the client via `router.replace()` once the
// active tab evaluates to zero posts. The SSR variant was a pre-hydration
// flash optimization; losing it is the cost of regaining ISR cacheability.
// The client-side redirect runs immediately on first paint and the empty
// window state is rendered for a single frame at worst.

import { Suspense } from "react";

import { AllTrendingTabs } from "@/components/reddit-trending/AllTrendingTabs";
import type { RedditAllPost } from "@/lib/reddit-all";

interface RedditTrendingFilteredContentProps {
  posts: RedditAllPost[];
}

function FeedSkeleton() {
  return (
    <div
      style={{
        padding: 24,
        fontSize: 13,
        background: "var(--v4-bg-025)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: 2,
        color: "var(--v4-ink-400)",
      }}
    >
      Loading feed...
    </div>
  );
}

export function RedditTrendingFilteredContent({
  posts,
}: RedditTrendingFilteredContentProps) {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <AllTrendingTabs posts={posts} />
    </Suspense>
  );
}
