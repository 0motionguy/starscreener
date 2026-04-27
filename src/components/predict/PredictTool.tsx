"use client";

// /predict — standalone forecasting tool (v2-styled).
//
// Search any tracked repo, see 7d / 30d / 90d projections with confidence
// gauge, forecast sparkline band, stat pills, and driver list.

import { useState } from "react";
import {
  AlertTriangle,
  LineChart,
  LoaderCircle,
  Search,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";

import type {
  PredictionDriver,
  PredictionRecord,
} from "@/lib/predictions";
import { cn } from "@/lib/utils";
import {
  ConfidenceGauge,
  StatPill,
  ForecastSparkline,
  TerminalBar,
  BarcodeTicker,
} from "@/components/v2";

interface PredictItem {
  horizonDays: number;
  prediction: PredictionRecord | null;
  drivers: PredictionDriver[] | null;
  reason: string | null;
}

interface PredictResponse {
  ok: true;
  fullName: string;
  modelVersion: string;
  results: PredictItem[];
}

interface ErrorResponse {
  ok: false;
  error: string;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

/** Heuristic confidence derived from data quality + horizon. Transparent. */
function computeConfidence(prediction: PredictionRecord): number {
  const inputs = prediction.inputs;
  let score = 55;
  // More data points = higher confidence
  if (inputs.sparklinePoints >= 30) score += 20;
  else if (inputs.sparklinePoints >= 14) score += 10;
  // Low volatility (CV < 0.5) = higher confidence
  const cv = inputs.meanDailyDelta > 0 ? inputs.stdDailyDelta / inputs.meanDailyDelta : Infinity;
  if (cv < 0.3) score += 10;
  else if (cv > 1.0) score -= 15;
  else if (cv > 0.7) score -= 8;
  // Horizon penalty
  if (prediction.horizonDays === 7) score += 5;
  else if (prediction.horizonDays === 90) score -= 12;
  return Math.min(95, Math.max(15, Math.round(score)));
}

interface PredictToolProps {
  initialRepo?: string;
  sparklineData?: number[] | null;
}

export function PredictTool({ initialRepo = "", sparklineData }: PredictToolProps) {
  const [query, setQuery] = useState(initialRepo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<PredictResponse | null>(null);

  async function runPrediction(repo: string) {
    if (!repo.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const url =
        `/api/predict?repo=${encodeURIComponent(repo.trim())}` +
        `&horizon=7&horizon=30&horizon=90`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as PredictResponse | ErrorResponse;
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setResponse(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runPrediction(query);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="v2-card rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
      >
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
            Repo (owner/name)
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="vercel/next.js"
              className="min-w-[260px] flex-1 rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className={cn(
                "v2-btn v2-btn-primary inline-flex items-center gap-2 rounded-md border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider min-h-[40px]",
                (loading || !query.trim()) &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Search className="size-4" aria-hidden />
              )}
              Forecast
            </button>
          </div>
        </label>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-down/60 bg-down/5 px-4 py-3 text-sm text-down inline-flex items-center gap-2"
        >
          <AlertTriangle className="size-4" aria-hidden />
          {error}
        </div>
      ) : null}

      {response ? (
        <ResultPanel response={response} sparklineData={sparklineData} />
      ) : null}
    </div>
  );
}

function ResultPanel({
  response,
  sparklineData,
}: {
  response: PredictResponse;
  sparklineData?: number[] | null;
}) {
  return (
    <section
      aria-label={`Forecasts for ${response.fullName}`}
      className="space-y-4"
      data-testid="predict-result"
    >
      <div className="v2-frame overflow-hidden">
        <TerminalBar
          label={`// PREDICT · ${response.fullName.toUpperCase()}`}
          status={`MODEL ${response.modelVersion} · LIVE`}
          live
        />
        <BarcodeTicker count={96} height={12} seed={response.results.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {response.results.map((item) => (
          <ForecastCard
            key={item.horizonDays}
            item={item}
            sparklineData={sparklineData}
          />
        ))}
      </div>
    </section>
  );
}

function ForecastCard({
  item,
  sparklineData,
}: {
  item: PredictItem;
  sparklineData?: number[] | null;
}) {
  if (!item.prediction) {
    return (
      <article className="v2-card rounded-card border border-dashed border-border-primary bg-bg-muted/40 p-4">
        <header className="flex items-center gap-2">
          <LineChart className="size-4 text-text-tertiary" aria-hidden />
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            +{item.horizonDays}d horizon
          </h3>
        </header>
        <p className="mt-3 text-sm text-text-secondary">
          {item.reason ?? "No forecast available."}
        </p>
      </article>
    );
  }

  const { prediction, drivers } = item;
  const delta = prediction.pointEstimate - prediction.inputs.stars;
  const deltaPct =
    prediction.inputs.stars > 0
      ? (delta / prediction.inputs.stars) * 100
      : 0;
  const confidence = computeConfidence(prediction);
  const confTier =
    confidence >= 75 ? "high" : confidence >= 50 ? "mid" : "low";
  const confColor =
    confTier === "high"
      ? "text-up"
      : confTier === "mid"
        ? "text-warning"
        : "text-down";
  const glow =
    confTier === "high"
      ? "shadow-[0_0_40px_rgba(34,197,94,0.12)]"
      : confTier === "mid"
        ? "shadow-[0_0_40px_rgba(245,158,11,0.10)]"
        : "shadow-[0_0_40px_rgba(239,68,68,0.08)]";

  return (
    <article
      className={`v2-card rounded-card border border-border-primary bg-bg-primary/60 ${glow} overflow-hidden hover:border-brand/40 transition-colors`}
    >
      {/* Terminal-bar header */}
      <div className="v2-term-bar flex items-center gap-2 px-4 pt-4">
        <TrendingUp className="size-4 text-brand" aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-tertiary font-bold">
          +{item.horizonDays}d horizon
        </span>
        <span className="ml-auto">
          <ConfidenceGauge value={confidence} color={confColor} />
        </span>
      </div>

      {/* Big estimate */}
      <div className="px-4 pt-3">
        <div
          className="font-mono font-bold tabular-nums leading-none bg-clip-text text-transparent"
          style={{
            fontSize: "40px",
            backgroundImage:
              delta >= 0
                ? "linear-gradient(135deg, #FBFBFB 0%, #22C55E 100%)"
                : "linear-gradient(135deg, #FBFBFB 0%, #EF4444 100%)",
          }}
        >
          {fmtNumber(prediction.pointEstimate)}
        </div>
        <div className="mt-1 font-mono text-[11px] tabular-nums text-text-tertiary">
          from{" "}
          <span className="text-text-secondary">
            {fmtNumber(prediction.inputs.stars)}
          </span>{" "}
          ·{" "}
          <span className={`${delta >= 0 ? "text-up" : "text-down"} font-bold`}>
            {delta >= 0 ? "+" : ""}
            {fmtNumber(delta)} ({deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 ? (
        <div className="px-4 py-3">
          <ForecastSparkline
            past={sparklineData}
            currentStars={prediction.inputs.stars}
            pointEstimate={prediction.pointEstimate}
            lowP10={prediction.lowP10}
            highP90={prediction.highP90}
            horizonDays={item.horizonDays}
          />
        </div>
      ) : null}

      {/* Pills */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-1.5">
        <StatPill label="P10" value={fmtNumber(prediction.lowP10)} tone="down" />
        <StatPill label="EST" value={fmtNumber(prediction.pointEstimate)} tone="brand" />
        <StatPill label="P90" value={fmtNumber(prediction.highP90)} tone="up" />
      </div>

      {/* Drivers */}
      {drivers && drivers.length > 0 ? (
        <div className="px-4 py-3 border-t border-border-primary space-y-2">
          {drivers.map((d) => (
            <div key={d.label} className="flex items-start gap-2 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider font-bold whitespace-nowrap ${
                  d.tone === "positive"
                    ? "text-up"
                    : d.tone === "negative"
                      ? "text-down"
                      : "text-text-tertiary"
                }`}
              >
                {d.tone === "positive" ? (
                  <TrendingUp className="size-3" aria-hidden />
                ) : d.tone === "negative" ? (
                  <TrendingDown className="size-3" aria-hidden />
                ) : (
                  <Zap className="size-3" aria-hidden />
                )}
                {d.label}
              </span>
              <span className="text-text-secondary flex-1 leading-snug">
                {d.detail}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default PredictTool;
