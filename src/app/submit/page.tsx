import type { Metadata } from "next";

import { DropRepoPage } from "@/components/submissions/DropRepoPage";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const metadata: Metadata = {
  title: "Drop Your Repo",
  description:
    "Submit a GitHub repo to the TrendingRepo review queue. Dedupe against tracked repos, optional X share boost, and transparent pending counts.",
};

export default function SubmitPage() {
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-4">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>SUBMIT · REPO · QUEUE
              </>
            }
            status="OPEN"
          />
        </div>
      </section>
      <DropRepoPage />
    </>
  );
}
