import Link from "next/link";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

// Render at request time. Phase A1 fixed the framer-motion-induced RSC
// chunk-graph corruption for /_not-found by removing framer-motion from
// optimizePackageImports — but the underlying Next 15 prerender bug
// re-surfaces whenever the chunk graph shifts (e.g., new pages added).
// force-dynamic skips the static prerender step entirely; same UX, no
// blocker. Vercel's runtime is unaffected.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-16 md:px-6 md:py-24">
      <div
        className="v2-card overflow-hidden"
        style={{ background: "rgba(255, 176, 46, 0.06)", borderColor: "var(--v2-sig-amber)" }}
      >
        <div className="v2-term-bar">
          <span aria-hidden className="flex items-center gap-1.5">
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-sig-amber)" }} />
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
            <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "var(--v2-line-200)" }} />
          </span>
          <span className="flex-1 truncate" style={{ color: "var(--v2-sig-amber)" }}>
            {"// ERROR 404 - ROUTE NOT FOUND"}
          </span>
        </div>

        <div className="p-6 md:p-8">
          <p className={cn("v2-mono text-[11px] tracking-wide")} style={{ color: "var(--v2-ink-400)" }}>
            TERMINAL STATUS: NOT FOUND
          </p>
          <h1
            className="mt-2"
            style={{
              fontFamily: "var(--font-geist), Inter, sans-serif",
              fontSize: "clamp(26px, 4vw, 36px)",
              fontWeight: 510,
              letterSpacing: "-0.022em",
              color: "var(--v2-ink-000)",
              lineHeight: 1.1,
            }}
          >
            This route does not exist.
          </h1>

          <p className="mt-3 leading-relaxed" style={{ fontSize: 14, color: "var(--v2-ink-300)" }}>
            The URL may be outdated, mistyped, or removed. Use one of the actions below to recover.
          </p>

          <form action="/search" method="get" className="mt-4">
            <label htmlFor="nf-q" className="v2-mono text-[11px]" style={{ color: "var(--v2-ink-400)" }}>
              Search Repos
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                id="nf-q"
                name="q"
                type="search"
                placeholder="owner/repo or keyword"
                className="min-w-[220px] flex-1 rounded-md border px-3 py-2 text-sm"
                style={{
                  background: "var(--v2-bg-050)",
                  borderColor: "var(--v2-line-200)",
                  color: "var(--v2-ink-100)",
                }}
              />
              <button type="submit" className={cn("v2-btn v2-btn-primary")}>
                Search
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={ROUTES.HOME} className={cn("v2-btn v2-btn-primary inline-flex")}>
              Go to Home
            </Link>
            <Link href="/top10" className={cn("v2-btn v2-btn-ghost inline-flex")}>
              Open Top 10
            </Link>
            <Link href="/signals" className={cn("v2-btn v2-btn-ghost inline-flex")}>
              Open Signals
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
