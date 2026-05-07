// /top10 — community sharing tool (live).
//
// Server component. Builds the full 8-category Top10Payload via the shared
// `buildLiveTop10Payload()` helper (mirrors the daily snapshot script's logic
// so live and frozen views stay in lock-step), then hands it to the rich
// client renderer at `<Top10Page />`.
//
// The previous version of this route rendered a V4 leaderboard surface
// (PageHead + VerdictRibbon + KpiBand + RankRow). It was replaced once the
// /top10 surface became the public community-share entry point — the rich
// category tabs + share-card preview UI is now the canonical /top10 view.
// The V4 leaderboard's data inputs are absorbed by the same payload here.
//
// ISR — 60s cadence. The underlying refresh hooks are rate-limited at 30s
// internally, so a true rebuild only happens once a minute even on a hot
// route. The cron snapshot at 23:55 UTC writes the day's frozen Top10Payload
// for /top10/[date] regardless.

import type { Metadata } from "next";

import { SITE_NAME, absoluteUrl } from "@/lib/seo";
import { buildLiveTop10Payload } from "@/lib/top10/live-payload";
import {
  CATEGORY_META,
  TOP10_CATEGORIES,
  TOP10_WINDOWS,
  type Top10Category,
  type Top10Window,
} from "@/lib/top10/types";
import { isValidThemeId } from "@/lib/top10/themes";
import { Top10Page } from "@/components/top10/Top10Page";
import { FunnelMount } from "@/components/analytics/FunnelMount";

export const revalidate = 60;

interface Top10SearchParams {
  cat?: string;
  w?: string;
  aspect?: string;
  theme?: string;
  m?: string;
  /** Brand-pack short id (V1+ — Redis-resolved override). */
  b?: string;
}

// ---------------------------------------------------------------------------
// Param sanitization — every share URL is user-shaped, so parse defensively.
// Unknown values fall back to category defaults so a copy/paste typo never
// renders a broken page.
// ---------------------------------------------------------------------------

function pickCategory(v: string | undefined): Top10Category {
  if (v && (TOP10_CATEGORIES as readonly string[]).includes(v)) {
    return v as Top10Category;
  }
  return "repos";
}

function pickWindow(v: string | undefined, fallback: Top10Window): Top10Window {
  if (v && (TOP10_WINDOWS as readonly string[]).includes(v)) {
    return v as Top10Window;
  }
  return fallback;
}

function pickAspect(v: string | undefined): "h" | "sq" | "v" | "yt" {
  return v === "sq" || v === "v" || v === "yt" ? v : "h";
}

function pickTheme(v: string | undefined): string {
  return isValidThemeId(v) ? v : "dark";
}

// ---------------------------------------------------------------------------
// Dynamic metadata — every share URL unfurls with its own card. Without this,
// every X / Reddit / Slack / Discord paste of /top10?cat=funding&theme=sunset
// would show the same default repos+dark card. This is the single most
// important change for cross-platform unfurling.
// ---------------------------------------------------------------------------

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Top10SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const category = pickCategory(sp.cat);
  const meta = CATEGORY_META[category];
  const window = pickWindow(sp.w, meta.defaultWindow);
  const aspect = pickAspect(sp.aspect);
  const theme = pickTheme(sp.theme);

  // OG image carries the same params the user is viewing — so the link
  // unfurl shows what they're sharing, not a generic default.
  const ogParams = new URLSearchParams();
  ogParams.set("cat", category);
  ogParams.set("window", window);
  ogParams.set("aspect", aspect);
  if (theme !== "dark") ogParams.set("theme", theme);
  if (sp.b) ogParams.set("b", sp.b);
  const ogImage = absoluteUrl(`/api/og/top10?${ogParams.toString()}`);

  // Canonical strips UTM but preserves view-defining params so
  // social-media canonicalizers don't fold every share-tagged copy back to
  // the bare /top10 (which would render the wrong category).
  const canonicalParams = new URLSearchParams();
  if (category !== "repos") canonicalParams.set("cat", category);
  if (window !== meta.defaultWindow) canonicalParams.set("w", window);
  if (theme !== "dark") canonicalParams.set("theme", theme);
  if (sp.b) canonicalParams.set("b", sp.b);
  const canonicalQs = canonicalParams.toString();
  const canonical = canonicalQs
    ? absoluteUrl(`/top10?${canonicalQs}`)
    : absoluteUrl("/top10");

  // Title + description per category — better unfurl than a single static
  // string. Reads natural when posted alongside the image.
  const title = `Top 10 ${meta.label.toLowerCase()} this ${
    window === "24h" ? "day" : window === "7d" ? "week" : window === "30d" ? "month" : "year"
  } — ${SITE_NAME}`;
  const description = meta.blurb;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          // Width/height per aspect so unfurlers crop correctly.
          width:
            aspect === "h" ? 1200
            : aspect === "sq" ? 1080
            : aspect === "v" ? 1080
            : 1280,
          height:
            aspect === "h" ? 675
            : aspect === "sq" ? 1080
            : aspect === "v" ? 1350
            : 720,
          alt: `${SITE_NAME} — ${title}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function Top10RootPage() {
  const { payload, repoSlice } = await buildLiveTop10Payload();

  return (
    <>
      <FunnelMount step="top10_view" flow="top10-discover" />
      <Top10Page
        payload={payload}
        categoryMeta={CATEGORY_META}
        repoSlice={repoSlice}
      />
    </>
  );
}
