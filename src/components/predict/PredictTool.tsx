"use client";

// /predict — standalone forecasting tool. Search any tracked repo, see
// 7d / 30d / 90d projections with confidence bands and a list of
// drivers.
//
// Calibration disclosure is rendered in the page itself as a fixed
// banner — the model is v1 baseline and we explicitly say so.

import { useState } from "react";
import {
  AlertTriangle,
  LineChart,
  LoaderCircle,
  Search,
  TrendingUp,
} from "lucide-react";

import type {
  PredictionDriver,
  PredictionRecord,
} from "@/lib/predictions";
import { cn } from "@/lib/utils";

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

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtNumber(n)}`;
}

interface PredictToolProps {
  initialRepo?: string;
}

export function PredictTool({ initialRepo = "" }: PredictToolProps) {
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
        className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card"
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
                "inline-flex items-center gap-2 rounded-md border border-border-primary bg-brand/90 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-bg-primary hover:bg-brand transition-colors min-h-[40px]",
                (loading || !query.trim()) &&
                  "cursor-not-allowed opacity-50 hover:bg-brand/90",
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

      {response ? <ResultPanel response={response} /> : null}
    </div>
  );
}

function ResultPanel({ response }: { response: PredictResponse }) {
  return (
    <section
      aria-label={`Forecasts for ${response.fullName}`}
      className="space-y-3"
      data-testid="predict-result"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-base font-semibold text-text-primary">
          {response.fullName}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          model: {response.modelVersion}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {response.results.map((item) => (
          <ForecastCard key={item.horizonDays} item={item} />
        ))}
      </div>
    </section>
  );
}

function ForecastCard({ item }: { item: PredictItem }) {
  if (!item.prediction) {
    return (
      <article className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 p-4">
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
  const bandWidth = prediction.highP90 - prediction.lowP10;
  return (
    <article className="rounded-card border border-border-primary bg-bg-card p-4 shadow-card space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-brand" aria-hidden />
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-tertiary">
            +{item.horizonDays}d horizon
          </h3>
        </div>
        <span className="font-mono text-[10px] text-text-tertiary tabular-nums">
          band ±{fmtNumber(Math.round(bandWidth / 2))}
        </span>
      </header>

      <div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-text-primary">
          {fmtNumber(prediction.pointEstimate)}
        </div>
        <div className="font-mono text-[11px] text-text-tertiary tabular-nums">
          from {fmtNumber(prediction.inputs.stars)} ·{" "}
          <span className={delta >= 0 ? "text-up" : "text-down"}>
            {fmtSigned(delta)} ({deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
          80% confidence
        </div>
        <div className="font-mono text-[11px] tabular-nums text-text-secondary">
          {fmtNumber(prediction.lowP10)} – {fmtNumber(prediction.highP90)}
        </div>
      </div>

      {drivers && drivers.length > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-border-primary">
          {drivers.map((d) => (
            <div key={d.label} className="text-[11px]">
              <span
                className={cn(
                  "font-mono uppercase tracking-wider mr-2",
                  d.tone === "positive"
                    ? "text-up"
                    : d.tone === "negative"
                      ? "text-down"
                      : "text-text-tertiary",
                )}
              >
                {d.label}
              </span>
              <span className="text-text-secondary">{d.detail}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default PredictTool;
