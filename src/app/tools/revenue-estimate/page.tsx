import type { Metadata } from "next";
import Link from "next/link";

import { RevenueEstimateTool } from "@/components/tools/RevenueEstimateTool";
import { readRevenueBenchmarksFile } from "@/lib/revenue-benchmarks";

export const metadata: Metadata = {
  title: "Revenue Estimator — TrendingRepo",
  description:
    "Ballpark MRR estimate for a repo by category, star count, and ProductHunt-launched status. Illustrative benchmarks from verified-revenue startups. Not financial advice.",
  alternates: { canonical: "/tools/revenue-estimate" },
};

export const dynamic = "force-dynamic";

export default function RevenueEstimatePage() {
  const file = readRevenueBenchmarksFile();
  const categories = Array.from(
    new Set(file.buckets.map((b) => b.category)),
  ).sort();
  const hasData = file.buckets.length > 0;

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary font-mono">
      <div className="max-w-[960px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <header className="mb-6 border-b border-border-primary pb-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-wider">
              Revenue Estimator
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// ballpark MRR from category × stars × PH launch"}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-text-secondary">
            Based on bucketed percentiles from a corpus of startups whose
            revenue is verified through direct payment-provider sync. Pick a
            category and a star range — we return the p25 → p75 MRR span for
            comparable startups, with the median in the middle.
          </p>
        </header>

        {hasData ? (
          <RevenueEstimateTool
            categories={categories}
            starBands={file.starBands}
            totalBuckets={file.totalBuckets}
            generatedAt={file.generatedAt}
          />
        ) : (
          <section className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 p-8">
            <h2 className="text-lg font-bold uppercase tracking-wider text-brand">
              {"// benchmarks not computed yet"}
            </h2>
            <p className="mt-3 max-w-xl text-sm text-text-secondary">
              Run{" "}
              <code className="text-text-primary">
                node scripts/sync-trustmrr.mjs --mode=full
              </code>{" "}
              then{" "}
              <code className="text-text-primary">
                node scripts/compute-revenue-benchmarks.mjs
              </code>{" "}
              to populate <code className="text-text-primary">data/revenue-benchmarks.json</code>.
              The hourly GitHub Action does this automatically once{" "}
              <code className="text-text-primary">TRUSTMRR_API_KEY</code> is set.
            </p>
          </section>
        )}

        <footer className="mt-10 rounded-card border border-warning/30 bg-warning/5 p-4 text-xs text-text-secondary">
          <strong className="font-mono uppercase tracking-wider text-warning">
            Illustrative only.
          </strong>{" "}
          Not financial, accounting, or investment advice. Your actual MRR
          depends on product, pricing, GTM, distribution, and a hundred other
          things this page cannot see.{" "}
          <Link href="/revenue" className="text-text-primary hover:underline">
            See real repos in the Revenue Terminal →
          </Link>
        </footer>
      </div>
    </main>
  );
}
