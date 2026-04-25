import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RevenueQueueAdmin } from "@/components/admin/RevenueQueueAdmin";
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin — Revenue Moderation Queue",
  description: "Approve or reject revenue submissions. Gated by admin login.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RevenueQueueAdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (!verifyAdminSession(session)) {
    redirect("/admin/login?next=/admin/revenue-queue");
  }
  return <RevenueQueueAdmin />;
}
