// /predict - standalone repo forecasting tool.

import type { Metadata } from "next";
import Link from "next/link";

import { PageHead } from "@/components/ui/PageHead";
import { VerdictRibbon } from "@/components/ui/VerdictRibbon";
import { KpiBand } from "@/components/ui/KpiBand";
import { SectionHead } from "@/components/ui/SectionHead";
import { RankRow } from "@/components/ui/RankRow";
import { LiveDot } from "@/components/ui/LiveDot";
import {
  PREDICTION_MODEL_VERSION,
  predictTrajectory,
  type PredictionRecord,
} from "@/lib/predictions";
import { getDerivedRepos, getDerivedRepoByFullName } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
import { PredictTool } from "@/components/predict/PredictTool";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { formatNumber, getRelativeTime } from "@/lib/utils";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";
// 10-minute ISR — predictions are pure functions of the trending payload,
// which itself only refreshes when the scraper writes new sparkline data.
// 10 min keeps the page responsive on first paint without blowing the
// cache budget.
export const revalidate = 600;

const FORECAST_HORIZON_DAYS = 30;
const FORECAST_LIMIT = 12;

interface ForecastEntry {
  repo: Repo;
  prediction: PredictionRecord;
  delta: number;
  deltaPct: number;
  confidence: number;
}

export const metadata: Metadata = {
  title: `Predict - repo trajectory forecast - ${SITE_NAME}`,
  description:
    "Transparent star-trajectory forecasts across the trending universe. 30-day horizon, recency-weighted velocity model, 80% confidence bands.",
  alternates: { canonical: absoluteUrl("/predict") },
  openGraph: {
    type: "website",
    title: `Predict - ${SITE_NAME}`,
    description:
      "30-day star-trajectory forecasts for trending repos with confidence bands and per-driver explanations.",
    url: absoluteUrl("/predict"),
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `Forecasted breakouts — ${SITE_NAME}`,
    description:
      "30-day star-trajectory forecasts for trending repos with transparent confidence bands.",
  },
};

/**
 * Heuristic confidence — mirrors the per-card calculation used elsewhere
 * (PredictTool client) but kept inline because we only need a single
 * scalar per repo for the KPI band.
 */
function computeConfidence(prediction: PredictionRecord): number {
  const inputs = prediction.inputs;
  let score = 55;
  if (inputs.sparklinePoints >= 30) score += 20;
  else if (inputs.sparklinePoints >= 14) score += 10;
  const cv =
    inputs.meanDailyDelta > 0
      ? inputs.stdDailyDelta / inputs.meanDailyDelta
      : Number.POSITIVE_INFINITY;
  if (cv < 0.3) score += 10;
  else if (cv > 1.0) score -= 15;
  else if (cv > 0.7) score -= 8;
  if (prediction.horizonDays === 7) score += 5;
  else if (prediction.horizonDays === 90) score -= 12;
  return Math.min(95, Math.max(15, Math.round(score)));
}

interface PredictPageProps {
  searchParams: Promise<{ repo?: string }>;
}

export default async function PredictPage({ searchParams }: PredictPageProps) {
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
