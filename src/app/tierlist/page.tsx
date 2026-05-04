// /tierlist — blank-canvas tier list editor (edit mode).
//
// URL state (?title=..&tiers=..&pool=..) is decoded by the client editor on
// mount, so this server page can stay a thin wrapper.

import type { Metadata } from "next";

import { TierListEditor } from "@/components/tier-list/TierListEditor";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Tier List Maker — ${SITE_NAME}`,
  description:
    "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.",
  alternates: {
    canonical: absoluteUrl("/tierlist"),
  },
  openGraph: {
    title: `Tier List Maker — ${SITE_NAME}`,
    description:
      "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.",
    url: absoluteUrl("/tierlist"),
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Tier List Maker — ${SITE_NAME}`,
    description:
      "Drag the AI ecosystem onto a tier list. Search repos, rank them, share the card.",
  },
};

export default function TierListEditorPage() {
  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#151419" }}>
      <TierListEditor />
    </main>
  );
}
