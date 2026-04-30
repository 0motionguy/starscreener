// /tierlist - blank-canvas tier list editor.
//
// URL state (?title=..&tiers=..&pool=..) is decoded by the client editor on
// mount, so this server page can stay a thin wrapper.

import type { Metadata } from "next";
import Link from "next/link";

import { TierListEditor } from "@/components/tier-list/TierListEditor";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Tier List Maker - ${SITE_NAME}`,
  description:
    "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.",
  alternates: {
    canonical: absoluteUrl("/tierlist"),
  },
  openGraph: {
    title: `Tier List Maker - ${SITE_NAME}`,
    description:
      "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.",
    url: absoluteUrl("/tierlist"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Tier List Maker - ${SITE_NAME}`,
    description:
      "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.",
  },
};

export default function TierListEditorPage() {
  return (
    <main className="home-surface tools-page tierlist-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Tools</b> / creator suite / tier list
          </div>
          <h1>Rank repos into a shareable board.</h1>
          <p className="lede">
            Classic S to F ranking for AI repos, builder presets, draggable
            rows, and branded export links.
          </p>
        </div>
        <div className="clock">
          <span className="big">S / F</span>
          <span className="live">share-ready</span>
        </div>
      </section>

      <div className="tool-grid">
        <Link className="tool" href="/tools/revenue-estimate">
          <span className="t-num">01</span>
          <span className="t-h">Revenue estimator</span>
          <span className="t-d">MRR range from category, stars, and PH launch.</span>
          <span className="t-foot">model<span className="ar">-&gt;</span></span>
        </Link>
        <Link className="tool active" href="/tierlist">
          <span className="t-num">02</span>
          <span className="t-h">Tier list</span>
          <span className="t-d">Rank repos into a shareable board.</span>
          <span className="t-foot"><span className="live">live</span><span className="ar">-&gt;</span></span>
        </Link>
        <Link className="tool" href="/compare">
          <span className="t-num">03</span>
          <span className="t-h">Compare</span>
          <span className="t-d">Compare repo profile and signal strength.</span>
          <span className="t-foot">analysis<span className="ar">-&gt;</span></span>
        </Link>
        <Link className="tool" href="/repo/vercel/next.js/star-activity">
          <span className="t-num">04</span>
          <span className="t-h">Star history</span>
          <span className="t-d">Inspect velocity curves and event cliffs.</span>
          <span className="t-foot">chart<span className="ar">-&gt;</span></span>
        </Link>
      </div>

      <TierListEditor />
    </main>
  );
}
