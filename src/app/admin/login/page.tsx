import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
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
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-4">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>ADMIN · SIGN IN
              </>
            }
            status="GATED"
          />
        </div>
      </section>
      <Suspense fallback={null}>
        <AdminLoginForm />
      </Suspense>
    </>
  );
}
