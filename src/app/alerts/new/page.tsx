// /alerts/new — V4 W10-B alert rule creation surface.
//
// Server wrapper owns the metadata export; the interactive form lives in
// ./NewAlertClient because Next.js 15 disallows `export const metadata`
// from a "use client" module. The shell is otherwise empty so the route
// stays lean and so async metadata can be added later without touching
// the client form.

import type { Metadata } from "next";

import NewAlertClient from "./NewAlertClient";

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "New alert",
  description:
    "Create a movement alert for a tracked repository. Choose a trigger, set a threshold, and TrendingRepo fires a browser notification when the condition is met.",
  alternates: { canonical: "/alerts/new" },
  openGraph: {
    title: "Create a new alert — TrendingRepo",
    description:
      "Set a trigger + threshold; get notified when a tracked repo crosses the line.",
    url: "/alerts/new",
    type: "website",
  },
};

export default function NewAlertPage() {
  return <NewAlertClient />;
}
