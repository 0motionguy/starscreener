import type { Metadata } from "next";

import { DropRepoPage } from "@/components/submissions/DropRepoPage";

export const metadata: Metadata = {
  title: "Drop Your Repo",
  description:
    "Submit a GitHub repo to the TrendingRepo review queue. Dedupe against tracked repos, optional X share boost, and transparent pending counts.",
};

export default function SubmitPage() {
  return <DropRepoPage />;
}
