// TrendingRepo - /you profile landing.
//
// Personal signal panel. Pulls local-only state (watchlist + compare +
// filters) out of zustand and renders a compact "what you've been tracking"
// summary. When a Clerk session is present, the same hub also exposes
// server-backed account tools such as alerts and referrals.
//
// Server wrapper owns the metadata export; the interactive shell lives
// in ./YouClient because Next.js 15 forbids `export const metadata` from
// a "use client" module.

import type { Metadata } from "next";

import { getUser } from "@/lib/auth/server";

import YouClient from "./YouClient";

export const metadata: Metadata = {
  title: "Your signal - TrendingRepo",
  description:
    "Personal watchlist, compare shortlist, account tools, and saved filter summary.",
};

export const dynamic = "force-dynamic";

export default async function YouPage() {
  const user = await getUser();
  const account = user
    ? {
        handle: user.profile.handle,
        email: user.profile.email,
        displayName: user.profile.displayName,
      }
    : null;

  return <YouClient account={account} />;
}
