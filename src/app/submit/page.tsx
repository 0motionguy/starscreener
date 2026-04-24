import type { Metadata } from "next";

import { SubmitTabs } from "@/components/submissions/SubmitTabs";

export const metadata: Metadata = {
  title: "Submit — Repo or Idea",
  description:
    "Drop a GitHub repo into the TrendingRepo review queue, or post a builder-grade idea anchored to trending repos.",
};

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <SubmitTabs initialTab={tab === "idea" ? "idea" : "repo"} />;
}
