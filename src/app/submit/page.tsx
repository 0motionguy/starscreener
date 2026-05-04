import type { Metadata } from "next";

import { DropRepoPage } from "@/components/submissions/DropRepoPage";

export const metadata: Metadata = {
  title: "Drop Your Repo",
  description:
    "Submit a GitHub repo to the TrendingRepo review queue. Dedupe against tracked repos, optional X share boost, and transparent pending counts.",
  alternates: { canonical: "/submit" },
  openGraph: {
    title: "Drop your repo — TrendingRepo",
    description:
      "Submit a GitHub repo to the TrendingRepo review queue. Free, transparent, deduped against the tracked set.",
    url: "/submit",
    type: "website",
  },
};

export default function SubmitPage() {
  return <DropRepoPage />;
}
