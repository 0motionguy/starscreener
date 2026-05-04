import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Metric, MetricGrid } from "@/components/ui/Metric";
import { RevenueEstimateTool } from "@/components/tools/RevenueEstimateTool";
import {
  readRevenueBenchmarksFile,
  refreshRevenueBenchmarksFromStore,
} from "@/lib/revenue-benchmarks";

// V4 (CORPUS) primitives.
import { PageHead } from "@/components/ui/PageHead";
import { KpiBand } from "@/components/ui/KpiBand";
import { LiveDot } from "@/components/ui/LiveDot";

export const metadata: Metadata = {
  title: "Revenue Estimator - TrendingRepo",
  description:
    "Ballpark MRR estimate for a repo by category, star count, and ProductHunt-launched status. Illustrative benchmarks from verified-revenue startups.",
  alternates: { canonical: "/tools/revenue-estimate" },
};

export const dynamic = "force-dynamic";

function formatClock(value: string | null): string {
  if (!value) return "warming";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 19)
    : "warming";
}

export default async function RevenueEstimatePage() {
  await refreshRevenueBenchmarksFromStore();
  const file = readRevenueBenchmarksFile();
  const categories = Array.from(
    new Set(file.buckets.map((b) => b.category)),
  ).sort();
  const hasData = file.buckets.length > 0;
  const phBuckets = file.buckets.filter((bucket) => bucket.phLaunched).length;
  const largestBucket = file.buckets.reduce(
    (max, bucket) => Math.max(max, bucket.n),
    0,
  );

  return (
    <main className="home-surface tools-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Tools</b> / creator suite / revenue estimate
          </div>
          <h1>Estimate repo revenue bands.</h1>
          <p className="lede">
            A compact calculator for mapping category, stars, and launch signal
            to verified-revenue benchmark buckets.
          </p>
        </div>
        <div className="clock">
          <span className="big">{formatClock(file.generatedAt)}</span>
          <span className="live">benchmarks</span>
        </div>
      </section>

      <div className="tool-grid">
        <Link className="tool active" href="/tools/revenue-estimate">
          <span className="t-num">01</span>
          <span className="t-h">Revenue estimator</span>
          <span className="t-d">MRR range from category, stars, and PH launch.</span>
          <span className="t-foot"><span className="live">live</span><span className="ar">-&gt;</span></span>
        </Link>
        <Link className="tool" href="/tierlist">
          <span className="t-num">02</span>
          <span className="t-h">Tier list</span>
          <span className="t-d">Rank repos into a shareable board.</span>
          <span className="t-foot">builder<span className="ar">-&gt;</span></span>
        </Link>
        <Link className="tool" href="/compare">
          <span className="t-num">03</span>
          <span className="t-h">Compare</span>
          <span className="t-d">Compare repo profile and signal strength.</span>
          <span className="t-foot">analysis<span className="ar">-&gt;</span></span>
        </Link>
        <Link className="tool" href="/repo/vercel/next.js/star-activity">
          <span className="t-num">04</span>
          <span className="t-h">Star history</span>
          <span className="t-d">Inspect velocity curves and event cliffs.</span>
          <span className="t-foot">chart<span className="ar">-&gt;</span></span>
        </Link>
      </div>

      <MetricGrid columns={5} className="kpi-band">
        <Metric label="Buckets" value={file.totalBuckets} sub="benchmark cells" tone="accent" pip />
        <Metric label="Startups" value={file.totalStartups} sub="verified corpus" tone="positive" pip />
        <Metric label="Categories" value={categories.length} sub="segments" pip />
        <Metric label="Star bands" value={file.starBands.length} sub="github ranges" tone="external" pip />
        <Metric label="PH buckets" value={phBuckets} sub={`max n ${largestBucket}`} tone="warning" pip />
      </MetricGrid>

      <div className="grid">
        <Card className="col-8">
          <CardHeader showCorner right={<span>{hasData ? "ready" : "empty"}</span>}>
            Revenue estimator
          </CardHeader>
          <CardBody>
            {hasData ? (
              <RevenueEstimateTool
                categories={categories}
                starBands={file.starBands}
                totalBuckets={file.totalBuckets}
                generatedAt={file.generatedAt}
              />
            ) : (
              <section className="tool-empty">
                <span>Benchmarks are not computed yet.</span>
              </section>
            )}
          </CardBody>
        </Card>
        <Card className="col-4">
          <CardHeader showCorner right={<span>rules</span>}>
            Model notes
          </CardHeader>
          <div className="share-list">
            <div className="share-row">
              <span className="ic">P25</span>
              <span className="body">
                <span className="h">Low bound</span>
                <span className="d">lower comparable percentile</span>
              </span>
            </div>
            <div className="share-row">
              <span className="ic">P50</span>
              <span className="body">
                <span className="h">Median</span>
                <span className="d">center of matched bucket</span>
              </span>
            </div>
            <div className="share-row">
              <span className="ic">P75</span>
              <span className="body">
                <span className="h">High bound</span>
                <span className="d">upper comparable percentile</span>
              </span>
            </div>
          </div>
        </Card>
      </div>

      <footer className="tool-disclaimer">
        <strong>Illustrative only.</strong> Not financial, accounting, or
        investment advice.{" "}
        <Link href="/revenue">See real repos in the Revenue Terminal -&gt;</Link>
      </footer>
    </main>
  );
}
