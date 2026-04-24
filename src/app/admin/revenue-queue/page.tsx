import type { Metadata } from "next";

import { RevenueQueueAdmin } from "@/components/admin/RevenueQueueAdmin";

export const metadata: Metadata = {
  title: "Admin — Revenue Moderation Queue",
  description:
    "Approve or reject revenue submissions. Gated by the ADMIN_TOKEN bearer token.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RevenueQueueAdminPage() {
  return <RevenueQueueAdmin />;
}
