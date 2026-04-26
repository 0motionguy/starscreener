import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RevenueQueueAdmin } from "@/components/admin/RevenueQueueAdmin";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
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
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-4">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>ADMIN · REVENUE · MODERATION
              </>
            }
            status="QUEUE"
          />
        </div>
      </section>
      <RevenueQueueAdmin />
    </>
  );
}
