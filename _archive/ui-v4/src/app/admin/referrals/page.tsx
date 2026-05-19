// Admin moderation queue for referral attributions with non-blocking
// fraud signals (same_ip_24h, same_email_domain, fast_signup, etc.).
//
// Auth: server-gated on the ss_admin cookie (mirror of /admin/ideas-queue).
// Once approved, fraud_flags are cleared and credit math runs. Once
// rejected, 'admin_rejected' is appended (which is also a BLOCKING flag,
// so any subsequent qualify-cron pass will skip the row).
//
// Mirrors src/app/admin/ideas-queue/page.tsx.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ReferralsQueueAdmin } from "@/components/admin/ReferralsQueueAdmin";
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin — Referrals Review Queue",
  description:
    "Approve or reject flagged referral attributions. Gated by admin login.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReferralsQueueAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/referrals");
  }
  return <ReferralsQueueAdmin />;
}
