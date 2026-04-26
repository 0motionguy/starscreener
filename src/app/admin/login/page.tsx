import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import {
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSession,
} from "@/lib/api/admin-session";

export const metadata: Metadata = {
  title: "Admin — Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? null;
  if (verifyAdminSession(existing)) {
    redirect("/admin");
  }
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
