// /predict — V2 repo forecasting tool.

import type { Metadata } from "next";

import { PredictTool } from "@/components/predict/PredictTool";
import { PREDICTION_MODEL_VERSION } from "@/lib/predictions";
import { TerminalBar } from "@/components/today-v2/primitives/TerminalBar";
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
      <section className="border-b border-[color:var(--v2-line-100)]">
        <div className="v2-frame pt-6 pb-6">
          <TerminalBar
            label={
              <>
                <span aria-hidden>{"// "}</span>PREDICT · STAR · TRAJECTORY
              </>
            }
            status={`MODEL ${PREDICTION_MODEL_VERSION.toUpperCase()}`}
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
            PREDICT · STAR FORECAST
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
            Pick a repo. Get 7-day, 30-day, and 90-day forecasts with{" "}
            <strong style={{ color: "var(--v2-acc)" }}>
              80% confidence bands
            </strong>{" "}
            and a short list of drivers (acceleration, volatility, baseline
            pace). The model is transparent and reproducible — read{" "}
            <code
              className="v2-mono-tight"
              style={{ color: "var(--v2-ink-100)", fontSize: 13 }}
            >
              src/lib/predictions.ts
            </code>
            .
          </p>
        </div>
      </section>

      <section>
        <div className="v2-frame py-6 max-w-[1100px]">
          <aside
            className="v2-card mb-6 p-4"
            style={{
              borderColor: "var(--v2-sig-amber)",
              background: "rgba(220, 168, 43, 0.05)",
            }}
            role="note"
          >
            <p
              className="v2-mono"
              style={{ color: "var(--v2-sig-amber)", fontSize: 11 }}
            >
              <span aria-hidden>{"// "}</span>
              V1 BASELINE · MODEL{" "}
              <code
                className="v2-mono-tight"
                style={{ color: "var(--v2-ink-100)", fontSize: 11 }}
              >
                {PREDICTION_MODEL_VERSION}
              </code>
            </p>
            <p
              className="text-[13px] leading-relaxed mt-2"
              style={{ color: "var(--v2-ink-200)" }}
            >
              Recent-velocity extrapolation with horizon damping. Calibration
              scoring (how often actuals land in the band) starts after 30
              days of recorded predictions.
            </p>
          </aside>

          <PredictTool initialRepo={repo ?? ""} />
        </div>
      </section>
    </>
  );
}
