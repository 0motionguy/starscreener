// /not-found - server component used by Next 15 for unmatched routes.
//
// CACHE CONTRACT
// kind:        ISR
// revalidate:  600 (10 min)
// audience:    public
// freshness:   suggestion list reflects whatever the last derived-repos
//              refresh produced; cron cadence governs that, not this page.
//
// Phase A1 fixed the framer-motion-induced RSC chunk-graph corruption for
// /_not-found by removing framer-motion from optimizePackageImports. Now
// that the chunk graph is stable, this route is safe to ISR-cache: the
// page reads from the in-process derived-repos cache (no per-request data
// fetch), so static prerender works as long as DATABASE_URL isn't required
// (it isn't - getDerivedRepos reads bundled JSON only).

import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { ROUTES } from "@/lib/constants";
import { getDerivedRepos } from "@/lib/derived-repos";
import { repoFullNameToHref } from "@/lib/hackernews";

export const revalidate = 600;

export default function NotFound() {
  // getDerivedRepos is synchronous and reads from a process-global cache
  // that ships with the build, so this is cheap on every request. We
  // intentionally avoid heavy ranking work - the canonical home-page
  // ordering is good enough as a "did you mean" prompt.
  const top = getDerivedRepos().slice(0, 5);

  return (
    <main className="home-surface min-h-screen px-4 py-12">
      <EmptyState
        variant="unknown-route"
        description="That URL doesn't lead anywhere. Try the home dashboard, or one of the trending repos surfaced today."
        cta={
          <Link
            href={ROUTES.HOME}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-button bg-accent-green text-bg-primary font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Back to TrendingRepo
          </Link>
        }
      />

      {top.length > 0 ? (
        <section className="mt-8 max-w-2xl mx-auto">
          <h2 className="font-display text-lg font-semibold mb-3 text-text-primary">
            Or try one of today&apos;s trending repos
          </h2>
          <ul className="space-y-2">
            {top.map((r) => (
              <li
                key={r.fullName}
                className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2"
              >
                <Link
                  href={repoFullNameToHref(r.fullName)}
                  className="font-mono text-sm text-text-primary hover:underline"
                >
                  {r.fullName}
                </Link>
                {r.description ? (
                  <span className="text-text-tertiary text-sm line-clamp-1">
                    {r.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10 max-w-2xl mx-auto text-center">
        <p className="text-text-tertiary text-sm">
          Looking for something specific? Search from the{" "}
          <Link
            href={ROUTES.HOME}
            className="text-accent-green hover:underline"
          >
            home page
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
