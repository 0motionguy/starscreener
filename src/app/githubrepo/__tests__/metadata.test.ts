import assert from "node:assert/strict";
import { test } from "node:test";

import { metadata } from "../page";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

test("/githubrepo metadata matches expected SEO snapshot", () => {
  const base = SITE_URL.replace(/\/+$/, "");
  const canonical = `${base}/githubrepo`;
  const ogImage = `${base}/og-card.png`;

  assert.deepEqual(
    {
      title: metadata.title,
      description: metadata.description,
      alternates: metadata.alternates,
      robots: metadata.robots,
      openGraph: metadata.openGraph,
      twitter: metadata.twitter,
    },
    {
      title: `Top 50 Trending GitHub Repos - ${SITE_NAME}`,
      description:
        "Live top 50 trending GitHub repositories ranked by momentum, star velocity, and cross-source agreement.",
      alternates: { canonical },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      },
      openGraph: {
        type: "website",
        url: canonical,
        title: `Top 50 Trending GitHub Repos - ${SITE_NAME}`,
        description:
          "Live top 50 trending GitHub repositories ranked by momentum, star velocity, and cross-source agreement.",
        siteName: SITE_NAME,
        locale: "en_US",
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: `${SITE_NAME} GitHub trending repositories`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `Top 50 Trending GitHub Repos - ${SITE_NAME}`,
        description:
          "Live top 50 trending GitHub repositories ranked by momentum, star velocity, and cross-source agreement.",
        images: [ogImage],
      },
    },
  );
});
