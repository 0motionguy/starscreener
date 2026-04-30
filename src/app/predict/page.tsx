// /predict - standalone repo forecasting tool.

import type { Metadata } from "next";
import Link from "next/link";

import { PredictTool } from "@/components/predict/PredictTool";
import { PREDICTION_MODEL_VERSION } from "@/lib/predictions";
import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Predict - repo trajectory forecast - ${SITE_NAME}`,
  description:
    "Transparent star-trajectory forecast for any tracked repo. 7d / 30d / 90d horizons with 80% confidence bands and per-driver explanations.",
  alternates: { canonical: absoluteUrl("/predict") },
  openGraph: {
    type: "website",
    title: `Predict - ${SITE_NAME}`,
    description:
      "Forecast star growth for any tracked repo with transparent confidence bands.",
    url: absoluteUrl("/predict"),
    siteName: SITE_NAME,
  },
};

export const dynamic = "force-static";

interface PageProps {
  searchParams: Promise<{ repo?: string }>;
}

export default async function PredictPage({ searchParams }: PageProps) {
  const { repo } = await searchParams;
  const baseRepo = repo ? getDerivedRepoByFullName(repo.trim()) : null;
  const sparklineData = baseRepo?.sparklineData ?? null;

  return (
    <main className="home-surface tools-page predict-page">
      <section className="page-head">
        <div>
          <div className="crumb">
            <b>Tools</b> / predict
          </div>
          <h1>Forecast repo trajectory.</h1>
          <p className="lede">
            Pick a tracked repo and inspect 7-day, 30-day, and 90-day star
            projections with confidence bands and transparent drivers.
          </p>
        </div>
        <div className="clock">
          <span className="big">v1</span>
          <span className="live">baseline model</span>
        </div>
      </section>

      <section className="tool-grid predict-tool-grid" aria-label="Tool context">
        <Link className="tool active" href="/predict">
          <span className="t-num">01 / active</span>
          <span className="t-h">Prediction</span>
          <span className="t-d">
            Extrapolate star growth with confidence bands and driver notes.
          </span>
          <span className="t-foot">
            <span className="live">live</span>
            <span className="ar">-&gt;</span>
          </span>
        </Link>
        <Link className="tool" href="/compare">
          <span className="t-num">02 / compare</span>
          <span className="t-h">Star History</span>
          <span className="t-d">
            Plot the same repo beside peers before trusting the forecast.
          </span>
          <span className="t-foot">
            chart
            <span className="ar">-&gt;</span>
          </span>
        </Link>
        <Link className="tool" href="/repo/vercel/next.js">
          <span className="t-num">03 / detail</span>
          <span className="t-h">Repo Detail</span>
          <span className="t-d">
            Validate sources, revenue signals, and recent mentions.
          </span>
          <span className="t-foot">
            profile
            <span className="ar">-&gt;</span>
          </span>
        </Link>
      </section>

      <aside className="panel predict-note" role="note">
        <div className="panel-head">
          <span className="key">{"// MODEL BASELINE"}</span>
          <span className="right">
            <span>{PREDICTION_MODEL_VERSION}</span>
          </span>
        </div>
        <div className="panel-body">
          Recent-velocity extrapolation with horizon damping. Calibration
          scoring starts after 30 days of recorded predictions.
        </div>
      </aside>

      <PredictTool initialRepo={repo ?? ""} sparklineData={sparklineData} />
    </main>
  );
}
