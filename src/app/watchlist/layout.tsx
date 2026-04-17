// StarScreener — /watchlist metadata wrapper (client-component sibling).

import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Watchlist — ${SITE_NAME}`;
const DESCRIPTION =
  "Your personal watchlist of GitHub repos — track momentum across the projects you care about.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["GitHub watchlist", "repo tracking", "open source alerts"],
  alternates: { canonical: absoluteUrl("/watchlist") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/watchlist"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    // Personal view — not useful to search engines.
    index: false,
    follow: true,
  },
};

export default function WatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
