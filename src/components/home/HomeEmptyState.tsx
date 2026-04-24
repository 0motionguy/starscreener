// HomeEmptyState — cold-start / degraded-data fallback for the homepage.
//
// Rendered only when getDerivedRepos() comes back empty (broken data file,
// cold lambda with no committed JSON, or a local dev env that hasn't run
// the scraper yet). The default TerminalBody "no repos match filters"
// state would be confusing here because there are no filters applied —
// this one explains the situation and points the operator at /submit.

import Link from "next/link";
import { RefreshCcw } from "lucide-react";

export function HomeEmptyState() {
  return (
    <section
      aria-label="Pipeline warming up"
      className="mx-4 sm:mx-6 mt-4 rounded-card border border-border-primary bg-bg-secondary/40 p-8 text-center"
    >
      <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border-primary text-text-tertiary">
        <RefreshCcw size={20} aria-hidden="true" className="animate-pulse" />
      </div>
      <h2 className="mt-4 font-display text-lg font-semibold text-text-primary">
        The pipeline is warming up.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        No trending repos loaded yet. The scraper runs every 20 minutes and
        hydrates on the next build. You can still submit a repo — it will be
        picked up on the next ingest.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link
          href="/submit"
          className="inline-flex items-center rounded-md border border-border-primary bg-bg-primary px-3 py-1.5 text-xs font-mono font-medium uppercase tracking-wider text-text-primary hover:border-brand hover:text-brand"
        >
          Submit a repo
        </Link>
        <Link
          href="/breakouts"
          className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-mono font-medium uppercase tracking-wider text-text-secondary hover:text-text-primary"
        >
          See breakouts
        </Link>
      </div>
    </section>
  );
}
