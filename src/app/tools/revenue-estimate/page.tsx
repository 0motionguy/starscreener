import type { Metadata } from "next";
import Link from "next/link";

import { RevenueEstimateTool } from "@/components/tools/RevenueEstimateTool";
import {
  readRevenueBenchmarksFile,
  refreshRevenueBenchmarksFromStore,
} from "@/lib/revenue-benchmarks";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";

export const metadata: Metadata = {
  title: "Revenue Estimator — TrendingRepo",
  description:
    "Ballpark MRR estimate for a repo by category, star count, and ProductHunt-launched status. Illustrative benchmarks from verified-revenue startups. Not financial advice.",
  alternates: { canonical: "/tools/revenue-estimate" },
};

export const dynamic = "force-dynamic";

export default async function RevenueEstimatePage() {
  await refreshRevenueBenchmarksFromStore();
  const file = readRevenueBenchmarksFile();
  const categories = Array.from(
    new Set(file.buckets.map((b) => b.category)),
  ).sort();
  const hasData = file.buckets.length > 0;

  return (
    <>
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>TOOLS · REVENUE · ESTIMATOR
              </>
            }
            status={hasData ? `${file.totalBuckets} BUCKETS` : "COLD"}
          />

          <h1
            className="v2-mono mt-6 inline-flex items-center gap-2"
            style={{
              color: "var(--v2-ink-100)",
              fontSize: 12,
              letterSpacing: "0.20em",
            }}
          >
            <span aria-hidden>{"// "}</span>
            REVENUE · ESTIMATOR · MRR
            <span
              aria-hidden
              className="inline-block ml-1"
              style={{
                width: 6,
                height: 6,
                background: "var(--v2-acc)",
                borderRadius: 1,
                boxShadow: "0 0 6px var(--v2-acc-glow)",
              }}
            />
          </h1>
          <p
            className="text-[14px] leading-relaxed max-w-[80ch] mt-3"
            style={{ color: "var(--v2-ink-200)" }}
          >
            Based on bucketed percentiles from a corpus of startups whose
            revenue is verified through direct payment-provider sync. Pick a
            category and a star range — we return the p25 → p75 MRR span for
            comparable startups, with the median in the middle.
          </p>
        </div>
      </section>

      <section>
        <div className="v2-frame py-6 max-w-[960px]">
          {hasData ? (
            <RevenueEstimateTool
              categories={categories}
              starBands={file.starBands}
              totalBuckets={file.totalBuckets}
              generatedAt={file.generatedAt}
            />
          ) : (
            <div className="v2-card p-8">
              <p
                className="v2-mono mb-3"
                style={{ color: "var(--v2-acc)" }}
              >
                <span aria-hidden>{"// "}</span>
                BENCHMARKS · NOT COMPUTED
              </p>
              <p
                className="text-[14px] leading-relaxed max-w-[60ch]"
                style={{ color: "var(--v2-ink-200)" }}
              >
                Run{" "}
                <code
                  className="v2-mono-tight"
                  style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
                >
                  node scripts/sync-trustmrr.mjs --mode=full
                </code>{" "}
                then{" "}
                <code
                  className="v2-mono-tight"
                  style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
                >
                  node scripts/compute-revenue-benchmarks.mjs
                </code>{" "}
                to populate{" "}
                <code
                  className="v2-mono-tight"
                  style={{ color: "var(--v2-ink-100)", fontSize: 12 }}
                >
                  data/revenue-benchmarks.json
                </code>
                .
              </p>
            </div>
          )}

          <footer
            className="v2-card mt-8 p-4"
            style={{
              borderColor: "var(--v2-sig-amber)",
              background: "rgba(220, 168, 43, 0.05)",
            }}
          >
            <p
              className="v2-mono text-[11px]"
              style={{ color: "var(--v2-sig-amber)" }}
            >
              <span aria-hidden>{"// "}</span>
              ILLUSTRATIVE ONLY
            </p>
            <p
              className="text-[13px] leading-relaxed mt-2"
              style={{ color: "var(--v2-ink-200)" }}
            >
              Not financial, accounting, or investment advice. Your actual MRR
              depends on product, pricing, GTM, distribution, and a hundred
              other things this page cannot see.{" "}
              <Link
                href="/revenue"
                className="underline decoration-dotted"
                style={{ color: "var(--v2-ink-100)" }}
              >
                See real repos in the Revenue Terminal →
              </Link>
            </p>
          </footer>
        </div>
      </section>
    </>
  );
}
