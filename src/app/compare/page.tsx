// StarScreener - Compare page.
//
// Renders the canonical-profile grid at the top and the salvaged legacy
// "code activity" visuals (commit heatmap, contributor grid, winner chips,
// star-activity chart) as a sibling section below. The grid owns its own
// `<main>` wrapper; the embedded extras section sits alongside it inside
// the same max-width container to keep the page rhythm consistent.
//
// Endpoints behind this page:
//   - /api/compare        → canonical profiles (30s / 60s SWR)
//   - /api/compare/github → rich GitHub bundle (5 min / 1 h SWR),
//                           powering the embedded `<CompareClient />` below.
//
// Query-param back-compat for `?repos=a/b,c/d` is preserved via the
// CompareProfileGrid client's compare store.

import { CompareProfileGrid } from "@/components/compare/CompareProfileGrid";
import { CompareClient } from "@/components/compare/CompareClient";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return (
    <>
      <CompareProfileGrid />

      <section
        aria-label="Code activity side-by-side"
        className="max-w-7xl mx-auto px-4 sm:px-6 pb-10"
      >
        <div className="border-t border-border-primary pt-6">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary mb-3">
            Code activity side-by-side
          </h2>
          <CompareClient embedded />
        </div>
      </section>
    </>
  );
}
