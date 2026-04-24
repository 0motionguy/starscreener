import type { Metadata } from "next";

import { IdeasQueueAdmin } from "@/components/admin/IdeasQueueAdmin";

export const metadata: Metadata = {
  title: "Admin — Ideas Moderation Queue",
  description:
    "Approve or reject pending ideas. Gated by the ADMIN_TOKEN bearer token.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function IdeasQueueAdminPage() {
  return <IdeasQueueAdmin />;
}
