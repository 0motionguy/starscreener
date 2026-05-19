import type { Metadata } from "next";

import { DropRevenuePage } from "@/components/submissions/DropRevenuePage";

export const metadata: Metadata = {
  title: "Claim or submit open-source revenue",
  description:
    "Link a verified-revenue profile, or self-report MRR and customers. Pending moderation before your repo page displays the signal.",
};

interface SubmitRevenuePageProps {
  searchParams?: Promise<{ repo?: string | string[]; source?: string | string[] }>;
}

export default async function SubmitRevenuePage({
  searchParams,
}: SubmitRevenuePageProps) {
  const sp = (await searchParams) ?? {};
  const repoParam = Array.isArray(sp.repo) ? sp.repo[0] : sp.repo;
  const sourceParam = Array.isArray(sp.source) ? sp.source[0] : sp.source;
  const source =
    sourceParam === "repo_detail" ? "repo_detail" : "submit_revenue_page";
  return <DropRevenuePage initialRepo={repoParam ?? ""} source={source} />;
}
