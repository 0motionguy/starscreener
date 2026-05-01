// StarScreener - /alerts metadata wrapper.
//
// /alerts is a client component (cookie-derived per-user data), so the
// metadata export has to live on a server-only sibling. Mirrors the
// /watchlist layout pattern.

import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Alerts - ${SITE_NAME}`;
const DESCRIPTION =
  "Alert rules and recent fired events for the repos you're tracking. Per-user alerts inbox keyed off your session cookie.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["GitHub alerts", "repo momentum alerts", "open source alerts"],
  alternates: { canonical: absoluteUrl("/alerts") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/alerts"),
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
    follow: true,
  },
};

export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
