import type { Metadata } from "next";

import { DropRevenuePage } from "@/components/submissions/DropRevenuePage";

export const metadata: Metadata = {
  title: "Claim or Submit Revenue — TrendingRepo",
  description:
    "Link a verified-revenue profile, or self-report MRR and customers. Pending moderation before your repo page displays the signal.",
};

export default function SubmitRevenuePage() {
  return <DropRevenuePage />;
}
