import type { Metadata } from "next";

import { DropRevenuePage } from "@/components/submissions/DropRevenuePage";

export const metadata: Metadata = {
  // Layout template appends ` — TrendingRepo`; bare title here.
  title: "Claim or Submit Revenue",
  description:
    "Link a verified-revenue profile, or self-report MRR and customers. Pending moderation before your repo page displays the signal.",
  alternates: { canonical: "/submit/revenue" },
  openGraph: {
    title: "Claim or Submit Revenue — TrendingRepo",
    description:
      "Link a verified-revenue profile, or self-report MRR and customers. Moderated before your repo page displays the signal.",
    url: "/submit/revenue",
    type: "website",
  },
};

export default function SubmitRevenuePage() {
  return <DropRevenuePage />;
}
