// HomeEmptyState — cold-start / degraded-data fallback for the homepage (V2 shell).
//
// Rendered only when getDerivedRepos() comes back empty (broken data file,
// cold lambda with no committed JSON, or a local dev env that hasn't run
// the scraper yet). The default TerminalBody "no repos match filters"
// state would be confusing here because there are no filters applied —
// this one explains the situation and points the operator at /submit.
//
// Visual: V2 frame with a `.v2-live-dot` + mono "// NO DATA · COLD START"
// banner, a smaller mono caption explaining the cold-lambda situation,
// and a single ghost button to /submit. Keeps the same component contract
// as before (no props) so the page handler call site is unchanged.

import Link from "next/link";

export function HomeEmptyState() {
  return (
    <section
      aria-label="Pipeline warming up"
      className="mx-4 sm:mx-6 mt-4"
    >
      <div className="v2-frame px-6 py-10 text-center sm:px-10 sm:py-12">
        <div className="flex items-center justify-center gap-2 v2-mono text-[11px] text-[color:var(--v2-ink-300)]">
          <span aria-hidden="true" className="v2-live-dot" />
          <span>
            <span aria-hidden="true">{"// "}</span>
            <span className="text-[color:var(--v2-ink-100)]">
              NO DATA
            </span>{" "}
            <span className="text-[color:var(--v2-line-300)]">·</span>{" "}
            <span className="text-[color:var(--v2-ink-100)]">
              COLD START
            </span>{" "}
            <span className="text-[color:var(--v2-line-300)]">·</span>{" "}
            WAITING NEXT SCRAPE
          </span>
        </div>

        <p
          className="mx-auto mt-5 max-w-[52ch] v2-mono text-[10px] leading-relaxed text-[color:var(--v2-ink-400)]"
        >
          <span aria-hidden="true">{"// "}</span>
          SCRAPER RUNS EVERY 20 MIN · DATA HYDRATES ON NEXT BUILD ·
          SUBMITTED REPOS ARE PICKED UP ON THE NEXT INGEST.
        </p>

        <div className="mt-6 flex items-center justify-center">
          <Link href="/submit" className="v2-btn v2-btn-ghost gap-2">
            <span>Drop a repo</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
