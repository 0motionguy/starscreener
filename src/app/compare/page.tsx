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

import type { Metadata } from "next";

import { CompareProfileGrid } from "@/components/compare/CompareProfileGrid";
import { CompareClient } from "@/components/compare/CompareClient";
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

/**
 * Per-request OG metadata so X auto-unfurls with the actual repos chosen
 * via ?repos=. Without this, the layout-level static og:image fires for
 * every URL regardless of which repos are being compared.
 *
 * Falls through to layout defaults when no repos are specified — the
 * static `/compare/opengraph-image.tsx` route handler still wins.
 */
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
          {shareState.repos.length >= 2 && (
            <div className="mt-4">
              <ShareBar state={shareState} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
