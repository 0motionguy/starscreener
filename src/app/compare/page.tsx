// StarScreener - Compare page.

import type { Metadata } from "next";
import Link from "next/link";

import type { Metadata } from "next";

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
      {/* W3 — Star History Chart wave: redesigned headline section.
          Owns the new 5-series chart, metric/window/mode/scale/theme
          toggles, starter-pack chips, bottom stat-card strip, and the
          right-rail multi-format SHARE panel. */}
      <CompareWaveTop />

      {/* Existing canonical-profile grid: deeper-dive per-repo signals
          (momentum, why-trending, cross-signal, npm, mentions). Kept
          as-is below the new wave so existing inbound links still
          resolve to a useful surface. */}
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
