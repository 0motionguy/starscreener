// /tierlist — blank-canvas tier-list builder (share-URL surface).
//
// URL state (?title=…&tiers=…&pool=…) is decoded by the client editor on
// mount, so this server page can stay a thin wrapper. The /tools/tier-list
// route mounts the same editor with a tools-hub crumb.
//
// Note: this route is normally unreachable because next.config.ts redirects
// /tierlist → /tools/tier-list (308). The /tools/tier-list page owns the
// dynamic OG metadata generation for unsaved drafts (?state=<base64>). This
// file is kept as a defensive fallback in case the redirect is ever removed.

import type { Metadata } from "next";

import { TierListEditor } from "@/components/tools/tier-list/TierListEditorClient";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-static";

const DESCRIPTION =
  "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.";

export const metadata: Metadata = {
  title: `Tier List Builder · ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: {
    canonical: absoluteUrl("/tierlist"),
  },
  openGraph: {
    title: `Tier List Builder · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl("/tierlist"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Tier List Builder · ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default function TierListBuilderPage() {
  return (
    <main className="home-surface tools-page tierlist-page">
      <TierListEditor />
    </main>
  );
}
