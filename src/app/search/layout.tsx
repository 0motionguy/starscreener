// StarScreener - /search metadata wrapper.

import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Search - ${SITE_NAME}`;
const DESCRIPTION =
  "Search every repo tracked in the momentum terminal by name, owner, language, topic, or description.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["GitHub search", "repo search", "open source search"],
  alternates: { canonical: absoluteUrl("/search") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/search"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
