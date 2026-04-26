import type { Metadata } from "next";

import { DropRevenuePage } from "@/components/submissions/DropRevenuePage";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const metadata: Metadata = {
  title: "Claim or Submit Revenue — TrendingRepo",
  description:
    "Link a verified-revenue profile, or self-report MRR and customers. Pending moderation before your repo page displays the signal.",
};

export default function SubmitRevenuePage() {
  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-4">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>SUBMIT · REVENUE · CLAIM
              </>
            }
            status="VERIFY"
          />
        </div>
      </section>
      <DropRevenuePage />
    </>
  );
}
