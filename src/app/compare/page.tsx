// StarScreener - Compare page.

import type { Metadata } from "next";
import Link from "next/link";

import { CompareProfileGrid } from "@/components/compare/CompareProfileGrid";
import { CompareClient } from "@/components/compare/CompareClient";
import { CompareWaveTop } from "@/components/compare/CompareWaveTop";
import { ShareBar } from "@/components/share/ShareBar";
import { absoluteUrl } from "@/lib/seo";
import {
  buildAbsoluteShareImageUrl,
  decodeStarActivityUrl,
  encodeStarActivityUrl,
} from "@/lib/star-activity-url";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: ComparePageProps): Promise<Metadata> {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") sp.set(k, v);
  }
  const state = decodeStarActivityUrl(sp);
  if (state.repos.length === 0) return {};

  const canonical = absoluteUrl(encodeStarActivityUrl(state, "/compare"));
  const imageUrl = buildAbsoluteShareImageUrl({ ...state, aspect: "h" });

  return {
    alternates: { canonical },
    openGraph: {
      url: canonical,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 675,
          alt: `Star activity of ${state.repos.join(", ")}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [imageUrl],
    },
  };
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") sp.set(k, v);
  }
  const shareState = decodeStarActivityUrl(sp);

  return (
    <main className="home-surface tools-page compare-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Tools</b> / compare
          </div>
          <h1>The creator suite - visualize. compare. share.</h1>
          <p className="lede">
            Plot star history against multiple repos, inspect canonical
            signals, and export branded share cards from one dense workbench.
          </p>
        </div>
        <div className="clock">
          <span className="big">{shareState.repos.length || 0}</span>
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
        <Link className="tool" href="/mindshare">
          <span className="t-num">02 / analog</span>
          <span className="t-h">Mindshare</span>
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
      <CompareProfileGrid />

      <section
        aria-label="Code activity side-by-side"
        className="panel compare-code-panel"
      >
        <div className="panel-head">
          <span className="key">{"// CODE ACTIVITY SIDE-BY-SIDE"}</span>
          <span className="right">
            <span>{shareState.repos.length >= 2 ? "shareable" : "select 2+"}</span>
          </span>
        </div>
        <div className="panel-body">
          <CompareClient embedded />
          {shareState.repos.length >= 2 && <ShareBar state={shareState} />}
        </div>
      </section>
    </main>
  );
}
