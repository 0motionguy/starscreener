// StarScreener — /search metadata wrapper
//
// The search page itself is a client component because it reads the URL query
// via next/navigation. Next.js doesn't let client components export metadata,
// so we hoist SEO into this adjacent server-component layout.

import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Search — ${SITE_NAME}`;
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
