// CACHE CONTRACT
// kind:        ISR (single public shell)
// revalidate:  3600 (1 hour)
// audience:    public
// freshness:   comparison data refreshed by data-store; URL state hydrates client-side
// invalidates: n/a

// StarScreener - Compare page.

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CompareProfileGrid } from "@/components/compare/CompareProfileGrid";
import { CompareClient } from "@/components/compare/CompareClient";
import {
  CompareSelectedCount,
  CompareShareBarClient,
} from "@/components/compare/CompareShareBarClient";
import { CompareWaveTop } from "@/components/compare/CompareWaveTop";

export const revalidate = 3600;
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Compare Repos - TrendingRepo",
  description:
    "Compare repository momentum, stars, funding, mentions, and GitHub activity side by side.",
  alternates: { canonical: "/compare" },
};

export default function ComparePage() {
  return (
    <main className="home-surface tools-page compare-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Tools</b> / compare
          </div>
          <h1>Compare Repos · Canonical Signals</h1>
          <p className="lede">
            Side-by-side: momentum, reasons, revenue, funding, mentions.
          </p>
        </div>
        <div className="clock">
          <span className="big">
            <Suspense fallback={0}>
              <CompareSelectedCount />
            </Suspense>
          </span>
          <span className="live">series selected</span>
        </div>
      </section>

      <section className="tool-grid compare-tool-grid" aria-label="Creator tools">
        <Link className="tool active" href="/compare">
          <span className="t-num">01 / active</span>
          <span className="t-h">Star History</span>
          <span className="t-d">
            Compare momentum curves across repos and export the chart.
          </span>
          <span className="t-foot">
            <span className="live">live</span>
            <span className="ar">-&gt;</span>
          </span>
        </Link>
        <Link className="tool" href="/signals">
          <span className="t-num">02 / analog</span>
          <span className="t-h">Signals</span>
          <span className="t-d">
            Map cross-source attention and category gravity.
          </span>
          <span className="t-foot">
            map
            <span className="ar">-&gt;</span>
          </span>
        </Link>
        <Link className="tool" href="/top10">
          <span className="t-num">03 / share</span>
          <span className="t-h">Top 10 Card</span>
          <span className="t-d">
            Turn ranked movers into a social-ready terminal card.
          </span>
          <span className="t-foot">
            export
            <span className="ar">-&gt;</span>
          </span>
        </Link>
        <Link className="tool" href="/tierlist">
          <span className="t-num">04 / board</span>
          <span className="t-h">Tier List</span>
          <span className="t-d">
            Rank stacks with drag-and-drop rows and share links.
          </span>
          <span className="t-foot">
            rank
            <span className="ar">-&gt;</span>
          </span>
        </Link>
      </section>

      <CompareWaveTop />
      <Suspense fallback={null}>
        <CompareProfileGrid />
      </Suspense>

      <section
        aria-label="Code activity side-by-side"
        className="panel compare-code-panel"
      >
        <div className="panel-head">
          <span className="key">{"// CODE ACTIVITY SIDE-BY-SIDE"}</span>
          <span className="right">
            <span>select 2+</span>
          </span>
        </div>
        <div className="panel-body">
          <Suspense fallback={null}>
            <CompareClient embedded />
            <CompareShareBarClient />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
