// /compare — V2 compare surface.
//
// Renders the canonical-profile grid at the top and the legacy
// "code activity" visuals (commit heatmap, contributor grid, winner chips,
// star-activity chart) as a sibling section below. Both components own
// their own internal layout; the page wraps them in V2 chrome with a
// TerminalBar header and section dividers.
//
// Endpoints behind this page:
//   - /api/compare        → canonical profiles (30s / 60s SWR)
//   - /api/compare/github → rich GitHub bundle (5 min / 1 h SWR)
//
// Query-param back-compat for `?repos=a/b,c/d` is preserved via the
// CompareProfileGrid client's compare store.

import { CompareProfileGrid } from "@/components/compare/CompareProfileGrid";
import { CompareClient } from "@/components/compare/CompareClient";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-4">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>COMPARE · SIDE BY SIDE
              </>
            }
            status="UP TO 4"
          />
        </div>
      </section>

      <CompareProfileGrid />

      <section
        aria-label="Code activity side-by-side"
        className="border-t border-[color:var(--v2-line-100)]"
      >
        <div className="v2-frame py-6">
          <p
            className="v2-mono mb-4"
            style={{ color: "var(--v2-ink-300)" }}
          >
            <span aria-hidden>{"// "}</span>
            CODE ACTIVITY · SIDE BY SIDE
          </p>
          <CompareClient embedded />
        </div>
      </section>
    </>
  );
}
