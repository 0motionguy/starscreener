// Top10ShareSection — interactive share rail for /tools/top-10.
//
// Client component that holds theme + size state and points the preview at
// the live /api/og/top10 image. Switching theme or size re-renders the
// preview with the actual image that will be shared / downloaded — no CSS
// mockup, no drift between picker and output.
//
// 2026-05-23 changes vs. previous static SharePanel mount:
//   - Theme picker is wired (was hardcoded to "dark")
//   - Size picker is wired (was hardcoded to "x")
//   - Preview is the real OG image (was the RankingPreviewCard mockup)
//   - Fixed latent bug: download URL used `size=x` but the OG route expects
//     `aspect=h` — silently rendered "h" for every size. Mapped below.
//   - Dropped Reddit + Embed + Tracking — kept X post + Copy link only,
//     per scope tightening.

"use client";

import { useMemo, useState } from "react";

import { SharePanel } from "@/components/share/SharePanel";

const SIZE_TO_ASPECT = {
  x: "h",
  square: "sq",
  story: "v",
  youtube: "yt",
} as const;

type SizeId = keyof typeof SIZE_TO_ASPECT;

const SIZE_DIMENSIONS: Record<SizeId, { w: number; h: number; label: string }> = {
  x: { w: 1200, h: 675, label: "X POST" },
  square: { w: 1080, h: 1080, label: "SQUARE" },
  story: { w: 1080, h: 1350, label: "STORY" },
  youtube: { w: 1280, h: 720, label: "YOUTUBE" },
};

const THEMES = [
  { id: "dark", label: "Dark", swatch: ["#151419", "#ff6b35"] as [string, string] },
  { id: "light", label: "Light", swatch: ["#fafaf7", "#ff6b35"] as [string, string] },
  { id: "mono", label: "Minimal", swatch: ["#000000", "#ffffff"] as [string, string] },
  { id: "sunset", label: "Sunset", swatch: ["#1a0a1c", "#ff6b9d"] as [string, string] },
  { id: "cyberpunk", label: "Cyberpunk", swatch: ["#0d0a1f", "#00ffd1"] as [string, string] },
  { id: "newsletter", label: "Newsletter", swatch: ["#f5f1e8", "#1a3a5c"] as [string, string] },
  { id: "pastel", label: "Pastel", swatch: ["#fef6f9", "#ff8da1"] as [string, string] },
  { id: "pitch", label: "Pitch deck", swatch: ["#0c1730", "#d4a017"] as [string, string] },
  { id: "hacker", label: "Hacker", swatch: ["#000000", "#00ff66"] as [string, string] },
  { id: "paper", label: "Paper", swatch: ["#f7f3ec", "#0c0d10"] as [string, string] },
];

interface Top10ShareSectionProps {
  activeDate: string;
  category: string;
  pagePath: string;
  shareText: string;
}

export function Top10ShareSection({
  activeDate,
  category,
  pagePath,
  shareText,
}: Top10ShareSectionProps) {
  const [size, setSize] = useState<SizeId>("x");
  const [theme, setTheme] = useState<string>("dark");

  const dims = SIZE_DIMENSIONS[size];
  const aspect = SIZE_TO_ASPECT[size];

  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({
      cat: category,
      aspect,
      theme,
      date: activeDate,
    });
    return `/api/og/top10?${params.toString()}`;
  }, [aspect, theme, activeDate, category]);

  const downloadUrl = `${previewUrl}&download=1`;

  return (
    <SharePanel
      title="Share this ranking"
      variant="ranking"
      statusLabel="Ready to post"
      statusTone="live"
      sizes={(Object.keys(SIZE_DIMENSIONS) as SizeId[]).map((id) => ({
        id,
        label: SIZE_DIMENSIONS[id].label,
        w: SIZE_DIMENSIONS[id].w,
        h: SIZE_DIMENSIONS[id].h,
      }))}
      activeSize={size}
      onSelectSize={(id) => {
        if (id in SIZE_DIMENSIONS) setSize(id as SizeId);
      }}
      themes={THEMES}
      activeTheme={theme}
      onSelectTheme={setTheme}
      preview={
        <div className="t10-og-preview" style={{ aspectRatio: `${dims.w} / ${dims.h}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- /api/og/* PNG, Next/Image not appropriate */}
          <img
            src={previewUrl}
            alt={`Top 10 ${activeDate} preview (${theme}, ${dims.w}×${dims.h})`}
            width={dims.w}
            height={dims.h}
            loading="lazy"
            decoding="async"
          />
        </div>
      }
      primaryCta={{
        label: `Download image ${dims.w}×${dims.h}`,
        icon: "download",
        href: downloadUrl,
        download: `trendingrepo-top10-${activeDate}-${theme}-${size}.png`,
      }}
      shareUrl={pagePath}
      shareText={shareText}
      hashtags={["opensource", "github", "trending"]}
      copyLink
      postOnX
      permalink={`https://trendingrepo.com${pagePath}`}
    />
  );
}
