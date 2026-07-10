// /alerts — server gate for the alerts surface (Wave 7 unification).
//
// TWO alert systems used to run side by side with no bridge: this
// anonymous cookie-keyed inbox (ss_user → /api/pipeline/alerts*) and the
// Clerk account surface (/you/alerts → Drizzle alert_rules with per-tier
// quotas, email + webhook delivery). Signed-in users landing here were
// silently managing a SECOND, inferior rule set that their paid tier
// never applied to.
//
// Now: a Clerk-authenticated visitor is redirected to /you/alerts (the
// canonical surface — email/webhook delivery, tier quotas, quiet hours).
// Anonymous visitors keep the cookie inbox exactly as before, plus an
// upsell banner explaining what an account adds. The route is on the
// middleware's isClerkSessionRoute list so getOptionalUser() has Clerk
// context; without keys (CI/local) it degrades to the anonymous view.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOptionalUser } from "@/lib/auth/server";

import AlertsClient from "./AlertsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alerts — TrendingRepo",
  description:
    "Repo alerts inbox: breakout, velocity, and cross-signal triggers for the repos you track.",
  robots: { index: false, follow: false },
};

export default async function AlertsPage() {
  let signedIn = false;
  try {
    signedIn = (await getOptionalUser()) !== null;
  } catch {
    // Profile-store hiccup — treat as anonymous rather than 500 the inbox.
    signedIn = false;
  }
  if (signedIn) {
    redirect("/you/alerts");
  }
  return <AlertsClient />;
}
