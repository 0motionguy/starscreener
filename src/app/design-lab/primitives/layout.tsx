// StarScreener - /design-lab/primitives metadata wrapper.
//
// Internal V4 primitive showcase used during design-system verification.
// Not linked from any public surface, but reachable; mark as `noindex` so
// it stays out of search results. The page itself is a server component
// today — using a co-located layout keeps the page free of metadata
// boilerplate and matches the /alerts, /search, /watchlist pattern.

import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Design Lab — Primitives — ${SITE_NAME}`;
const DESCRIPTION =
  "Internal design tokens and primitive showcase. Reference surface for the V4 design system.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/design-lab/primitives") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/design-lab/primitives"),
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
    index: false,
    follow: false,
  },
};

export default function DesignLabPrimitivesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
