// /tools/tier-list — drag-drop tier list builder, tools-hub entry.
//
// Mounts the same canonical <TierListEditor /> as the /tierlist share-URL
// surface — both routes share the same client editor + Zustand store.
//
// 2026-05-24: switched from `force-static` to dynamic metadata generation
// so an unsaved draft can be shared with its full state encoded in the URL
// (`?state=<base64>`). The crawler (Twitter, Slack, iMessage) lands here
// after the /tierlist → /tools/tier-list 308 redirect, decodes the state,
// and the openGraph image points at `/api/og/tier-list?state=<base64>`
// so it renders the user's actual draft instead of a generic builder card.

import type { Metadata } from "next";

// Client-only wrapper — defers the editor mount to first client paint so the
// Zustand store can hydrate from URL params without colliding with SSR.
import { TierListEditor } from "@/components/tools/tier-list/TierListEditorClient";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { decodeStateParam, pickFirst } from "@/lib/tier-list/state-url";

export const dynamic = "force-dynamic";

const DEFAULT_DESCRIPTION =
  "Drag the AI ecosystem onto an S-to-F tier list. Search repos, drop into tiers, export a branded PNG card. Share-ready in seconds.";
const DEFAULT_TITLE = `Tier List Builder · ${SITE_NAME}`;

interface PageProps {
  searchParams: Promise<{ state?: string | string[] }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { state } = await searchParams;
  const payload = decodeStateParam(state);

  if (!payload) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      alternates: { canonical: absoluteUrl("/tools/tier-list") },
      openGraph: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: absoluteUrl("/tools/tier-list"),
        type: "website",
        images: [
          {
            url: absoluteUrl("/api/og/tier-list?aspect=h"),
            width: 1200,
            height: 630,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        site: "@TrendingRepo",
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [absoluteUrl("/api/og/tier-list?aspect=h")],
      },
    };
  }

  // Got a decodable draft — emit OG meta pointed at the state-encoded card
  // so the crawler renders the user's actual ranking, not a generic builder.
  const stateValue = pickFirst(state) ?? "";
  const ogUrl = absoluteUrl(
    `/api/og/tier-list?state=${stateValue}&aspect=h`,
  );
  const itemCount =
    payload.unrankedItems.length +
    payload.tiers.reduce((sum, t) => sum + t.items.length, 0);
  const description = payload.description
    ? payload.description
    : `${payload.title} — ${itemCount} repos ranked on TrendingRepo.`;
  const pageUrl = absoluteUrl(`/tools/tier-list?state=${stateValue}`);

  return {
    title: `${payload.title} · ${SITE_NAME}`,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title: payload.title,
      description,
      url: pageUrl,
      type: "article",
      // 1200×630 is the documented Twitter `summary_large_image` aspect.
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      site: "@TrendingRepo",
      title: payload.title,
      description,
      images: [ogUrl],
    },
  };
}

export default function TierListPage() {
  return (
    <main className="home-surface tools-page tierlist-page">
      <TierListEditor />
    </main>
  );
}
