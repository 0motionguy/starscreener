// /predict — V4 forecasted-breakouts surface.
//
// Composes V4 chrome directly (no template — this is a custom layout):
//   PageHead (crumb / h1 / lede / clock-meta)
//   VerdictRibbon (acc tone — model version + last calibration window)
//   KpiBand (4 cells — predicted breakouts, avg confidence, top forecast,
//            model version)
//   // 01 SectionHead → list of <RankRow> entries (top forecasted breakouts,
//                       sorted by projected % delta over a 30d horizon)
//   // 02 SectionHead → methodology blurb
//
// Data:
//   - getDerivedRepos() returns the merged trending list.
//   - For each repo with a usable sparkline we run `predictTrajectory`
//     (pure, server-side) at the 30-day horizon. Repos with insufficient
//     history are dropped from the list.
//   - Sort by projected % delta (relative growth, not absolute) so the page
//     surfaces breakouts rather than already-large repos.
//
// ISR — 10 min (revalidate = 600). The forecast is recomputed on each cache
// miss from whatever sparkline data the trending payload carries; that
// payload only refreshes when the GHA scrape commits new data, so 10 min
// is plenty fresh while keeping per-request work bounded.

import type { Metadata } from "next";

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
import { getDerivedRepos } from "@/lib/derived-repos";
import { refreshTrendingFromStore } from "@/lib/trending";
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
  title: `Forecasted breakouts — ${SITE_NAME}`,
  description:
    "Transparent star-trajectory forecasts across the trending universe. 30-day horizon, recency-weighted velocity model, 80% confidence bands.",
  alternates: { canonical: absoluteUrl("/predict") },
  openGraph: {
    type: "website",
    title: `Forecasted breakouts — ${SITE_NAME}`,
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

function pickForecasts(repos: Repo[], limit: number): ForecastEntry[] {
  const out: ForecastEntry[] = [];
  for (const repo of repos) {
    const prediction = predictTrajectory(repo, FORECAST_HORIZON_DAYS);
    if (!prediction) continue;
    const delta = prediction.pointEstimate - repo.stars;
    const deltaPct = repo.stars > 0 ? (delta / repo.stars) * 100 : 0;
    // Drop forecasts that don't move — they're not "breakouts" by any
    // definition, and would dilute the list.
    if (delta <= 0) continue;
    out.push({
      repo,
      prediction,
      delta,
      deltaPct,
      confidence: computeConfidence(prediction),
    });
  }
  return out
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, limit);
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "−";
  const abs = Math.abs(pct);
  const rendered = abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  return `${sign}${rendered}%`;
}

export default async function PredictPage() {
  await refreshTrendingFromStore();
  const repos = getDerivedRepos();
  const forecasts = pickForecasts(repos, FORECAST_LIMIT);

  const computedAt = new Date().toISOString();
  const computedAgo = getRelativeTime(computedAt);

  const breakoutCount = forecasts.length;
  const avgConfidence =
    breakoutCount > 0
      ? Math.round(
          forecasts.reduce((acc, f) => acc + f.confidence, 0) / breakoutCount,
        )
      : 0;
  const topForecast = forecasts[0] ?? null;

  return (
    <main className="home-surface">
      <PageHead
        crumb={
          <>
            <b>PREDICT</b> · TERMINAL · /PREDICT
          </>
        }
        h1="Forecasted breakouts."
        lede="Transparent 30-day star-trajectory projections. Recency-weighted velocity with horizon damping; 80% confidence bands derived from daily-delta volatility. Surfaces relative breakouts — fastest projected percent gain — not just already-large repos."
        clock={
          <>
            <span className="big">{breakoutCount}</span>
            <span className="muted">FORECASTS · 30D</span>
            <LiveDot label="LIVE" />
          </>
        }
      />

      <VerdictRibbon
        tone="acc"
        stamp={{
          eyebrow: "// MODEL",
          headline: PREDICTION_MODEL_VERSION,
          sub: `computed ${computedAgo} · calibration starts after 30d`,
        }}
        text={
          breakoutCount > 0 && topForecast ? (
            <>
              <b>{breakoutCount} forecasted breakouts</b> over the next 30 days
              — led by{" "}
              <b>{topForecast.repo.fullName}</b> at{" "}
              <b>{formatPct(topForecast.deltaPct)}</b> projected growth (
              {formatNumber(topForecast.prediction.pointEstimate)} stars,
              80% band {formatNumber(topForecast.prediction.lowP10)}–
              {formatNumber(topForecast.prediction.highP90)}).
            </>
          ) : (
            <>
              No forecasts available — repos in the current trending payload
              don&apos;t have enough sparkline history to project. The model
              needs at least 14 days of star data per repo before it will
              forecast.
            </>
          )
        }
      />

      <KpiBand
        cells={[
          {
            label: "Predicted breakouts · 30d",
            value: breakoutCount.toString().padStart(2, "0"),
            sub: `top ${FORECAST_LIMIT} by projected % gain`,
          },
          {
            label: "Avg confidence",
            value: breakoutCount > 0 ? `${avgConfidence}%` : "—",
            tone: avgConfidence >= 70 ? "money" : avgConfidence >= 50 ? "amber" : "default",
            sub: "data quality + horizon penalty",
          },
          {
            label: "Top forecast",
            value: topForecast
              ? formatPct(topForecast.deltaPct)
              : "—",
            tone: "acc",
            sub: topForecast ? topForecast.repo.fullName : "no signal",
          },
          {
            label: "Model version",
            value: "v1",
            sub: PREDICTION_MODEL_VERSION,
            pip: "var(--v4-acc)",
          },
        ]}
      />

      <SectionHead
        num="// 01"
        title="Top predicted breakouts"
        meta={
          breakoutCount > 0 ? (
            <>
              <b>{breakoutCount}</b> repos · 30-day horizon · 80% band
            </>
          ) : (
            <>insufficient sparkline data</>
          )
        }
      />
      {breakoutCount > 0 ? (
        <div className="v4-rank-list">
          {forecasts.map((f, idx) => (
            <RankRow
              key={f.repo.fullName}
              rank={idx + 1}
              first={idx === 0}
              href={`/repo/${f.repo.owner}/${f.repo.name}`}
              avatar={f.repo.name.slice(0, 1).toUpperCase()}
              title={
                <>
                  {f.repo.owner} <span className="o">/</span> {f.repo.name}
                </>
              }
              desc={
                f.repo.description?.trim()
                  ? f.repo.description
                  : `Projected ${formatNumber(f.prediction.pointEstimate)} stars at +30d (band ${formatNumber(f.prediction.lowP10)}–${formatNumber(f.prediction.highP90)})`
              }
              metric={{
                value: formatNumber(f.prediction.pointEstimate),
                label: `from ${formatNumber(f.repo.stars)}`,
              }}
              delta={{
                value: formatPct(f.deltaPct),
                direction: "up",
                label: `${f.confidence}% conf`,
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">
          No repos in the current trending window have enough star history to
          forecast. Check back after the next collector run, or pick a repo
          manually from the{" "}
          <a className="link" href="/compare">
            compare tool
          </a>
          .
        </p>
      )}

      <SectionHead
        num="// 02"
        title="Methodology"
        meta={<>transparent · auditable</>}
      />
      <div className="v4-prose">
        <p>
          The forecast is a recency-weighted extrapolation of daily-star
          velocity, damped by horizon. Each repo&apos;s last 30 days of star
          history are converted to per-day deltas; the model takes a
          geometrically-weighted mean (newest day weight 1.0, decay 0.92 per
          step back), multiplies by the horizon, and damps long horizons by
          {" "}
          <code>exp(−horizon / 60)</code>. Without damping a 90-day projection
          would be a hockey-stick lie — damping pulls the long tail toward
          a more honest cone.
        </p>
        <p>
          Confidence bands (P10..P90) come from the sample standard deviation
          of those daily deltas, scaled by{" "}
          <code>sqrt(horizon)</code> — a Brownian-motion approximation that
          keeps short horizons tight and long horizons honestly fuzzy. The
          lower bound is clamped at the current star count; GitHub stars are
          ~monotonic, so a forecast that says &quot;stars will go down&quot;
          would be physically impossible.
        </p>
        <p>
          We list only repos with at least 14 days of recorded sparkline
          data; below that, the band would be wider than the signal and we
          surface nothing rather than fake numbers. The confidence number
          beside each row blends data-quality (point count, coefficient of
          variation) and horizon length — read it as &quot;how much would
          you weight this number if you had to act on it tomorrow?&quot;
        </p>
        <p>
          Calibration scoring (per-row error against actuals at horizon) is
          recorded once each prediction&apos;s 30-day window elapses, then
          surfaced on a future model-quality page. The current model
          identifier is <code>{PREDICTION_MODEL_VERSION}</code>; that string
          is bumped whenever the formula changes so historical accuracy
          buckets stay clean.
        </p>
      </div>
    </main>
  );
}
