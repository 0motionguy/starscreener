// /you/settings — account settings landing.
//
// Server component owns the metadata + initial profile fetch via
// `requireUser()`. Interactive form lives in `./SettingsClient.tsx`
// so we can keep the `metadata` export server-side per Next 15.

import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/server";

import SettingsClient, { type SettingsInitialProfile } from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account settings — TrendingRepo",
  description:
    "Update your display name, avatar, and account preferences.",
  robots: { index: false, follow: false },
};

export default async function YouSettingsPage() {
  const { profile } = await requireUser();
  const initialProfile: SettingsInitialProfile = {
    handle: profile.handle,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
  return <SettingsClient initialProfile={initialProfile} />;
}
