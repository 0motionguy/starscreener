// StarScreener — /compare metadata wrapper (client-component sibling).

import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Compare — ${SITE_NAME}`;
const DESCRIPTION =
  "Compare up to four GitHub repos side-by-side — stars, forks, momentum, and 30-day star history.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["compare repos", "GitHub compare", "repo side-by-side"],
  alternates: { canonical: absoluteUrl("/compare") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/compare"),
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

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
