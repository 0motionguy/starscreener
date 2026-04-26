// /predict — standalone repo forecasting tool. Wraps the PredictTool
// client component with the same chrome conventions used by
// /tools/revenue-estimate.

import type { Metadata } from "next";
import { LineChart, ShieldAlert } from "lucide-react";

import { PredictTool } from "@/components/predict/PredictTool";
import { PREDICTION_MODEL_VERSION } from "@/lib/predictions";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Predict — repo trajectory forecast · ${SITE_NAME}`,
  description:
    "Transparent star-trajectory forecast for any tracked repo. 7d / 30d / 90d horizons with 80% confidence bands and per-driver explanations.",
  alternates: { canonical: absoluteUrl("/predict") },
  openGraph: {
    type: "website",
    title: `Predict — ${SITE_NAME}`,
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

  return (
    <>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <header className="border-b border-border-primary pb-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-wider inline-flex items-center gap-2">
              <LineChart className="size-5 text-brand" aria-hidden />
              Predict
            </h1>
            <span className="text-xs text-text-tertiary">
              {"// star-trajectory forecast for any tracked repo"}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Pick a repo. Get 7-day, 30-day, and 90-day forecasts with{" "}
            <strong className="text-brand">80% confidence bands</strong> and a
            short list of drivers (acceleration, volatility, baseline pace).
            The model is transparent and reproducible — read{" "}
            <code className="text-text-primary">src/lib/predictions.ts</code>.
          </p>
        </header>

        <aside
          className="rounded-card border border-warning/40 bg-warning/5 p-3 text-[11px] text-text-secondary inline-flex items-start gap-2"
          role="note"
        >
          <ShieldAlert
            className="size-3.5 text-warning mt-0.5"
            aria-hidden
          />
          <div>
            <strong className="text-warning">v1 baseline.</strong> Model{" "}
            <code className="text-text-primary">{PREDICTION_MODEL_VERSION}</code>
            : recent-velocity extrapolation with horizon damping.
            Calibration scoring (how often actuals land in the band) starts
            after 30 days of recorded predictions.
          </div>
        </aside>

        <PredictTool initialRepo={repo ?? ""} />
      </div>
    </>
  );
}
