"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Calculator, LoaderCircle, Sparkles } from "lucide-react";

interface RevenueEstimateToolProps {
  categories: string[];
  starBands: string[];
  totalBuckets: number;
  generatedAt: string | null;
}

interface EstimateResponse {
  ok: true;
  result: {
    fallback: "exact" | "ignored_ph" | "ignored_stars" | "category_only" | "none";
    bucket: {
      category: string;
      starBand: string;
      phLaunched: boolean;
      n: number;
      p25: number;
      p50: number;
      p75: number;
    } | null;
    range: { lowCents: number; midCents: number; highCents: number } | null;
  };
}

const FALLBACK_COPY: Record<EstimateResponse["result"]["fallback"], string> = {
  exact: "Exact bucket match.",
  ignored_ph: "No data for the PH-launched dimension; ignoring it for this estimate.",
  ignored_stars: "No data for this star band; weighting across all bands in the category.",
  category_only: "Sparse data; weighting across all bands and PH states in the category.",
  none: "Not enough data; try a different category or star range.",
};

function fmtUsd(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1_000)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

export function RevenueEstimateTool({
  categories,
  starBands,
  totalBuckets,
  generatedAt,
}: RevenueEstimateToolProps) {
  const defaultCategory = useMemo(
    () => categories.find((c) => c.toLowerCase().includes("ai")) ?? categories[0] ?? "",
    [categories],
  );
  const [category, setCategory] = useState<string>(defaultCategory);
  const [starBand, setStarBand] = useState<string>(
    starBands.find((b) => b === "500-2K") ?? starBands[0] ?? "",
  );
  const [phLaunched, setPhLaunched] = useState<"yes" | "no" | "any">("any");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResponse["result"] | null>(null);

  async function onEstimate() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (starBand) params.set("starBand", starBand);
      if (phLaunched !== "any") {
        params.set("phLaunched", phLaunched === "yes" ? "true" : "false");
      }
      const res = await fetch(`/api/tools/revenue-estimate?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as
        | EstimateResponse
        | { ok: false; error: string };
      if (!payload.ok) throw new Error(payload.error);
      setResult(payload.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="tool-workbench">
      <div className="tool-panel">
        <PanelHead right={`buckets / ${totalBuckets.toLocaleString("en-US")}`}>
          Estimator inputs
        </PanelHead>
        <div className="tool-form-grid">
          <Field label="Category" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="tool-select"
            >
              {categories.length === 0 ? (
                <option value="">(no data)</option>
              ) : (
                categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              )}
            </select>
          </Field>
          <Field label="GitHub stars" required>
            <select
              value={starBand}
              onChange={(e) => setStarBand(e.target.value)}
              className="tool-select"
            >
              {starBands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="unmatched">not on GitHub / not tracked</option>
            </select>
          </Field>
          <Field label="Product Hunt">
            <select
              value={phLaunched}
              onChange={(e) =>
                setPhLaunched(e.target.value as "yes" | "no" | "any")
              }
              className="tool-select"
            >
              <option value="any">any</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </Field>
        </div>
        <div className="tool-actions">
          <p>
            {generatedAt
              ? `built ${new Date(generatedAt).toISOString().slice(0, 10)}`
              : "benchmark build pending"}
          </p>
          <button
            type="button"
            onClick={() => void onEstimate()}
            disabled={loading || !category || !starBand}
            className="tool-button"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Calculator className="size-4" aria-hidden />
            )}
            Estimate MRR
          </button>
        </div>
      </div>

      {error ? <div className="tool-error">{error}</div> : null}

      {result ? (
        <ResultCard
          category={category}
          starBand={starBand}
          phLaunched={phLaunched}
          result={result}
        />
      ) : (
        <div className="tool-empty">
          <Sparkles className="size-4" aria-hidden />
          <span>Set your category and star band, then run the estimate.</span>
        </div>
      )}
    </section>
  );
}

function ResultCard({
  category,
  starBand,
  phLaunched,
  result,
}: {
  category: string;
  starBand: string;
  phLaunched: "yes" | "no" | "any";
  result: EstimateResponse["result"];
}) {
  if (!result.range || !result.bucket) {
    return (
      <div className="tool-panel">
        <PanelHead>No estimate</PanelHead>
        <p className="tool-note">{FALLBACK_COPY[result.fallback]}</p>
      </div>
    );
  }

  const { lowCents, midCents, highCents } = result.range;
  return (
    <div className="tool-result">
      <PanelHead right={`${result.bucket.n.toLocaleString("en-US")} comps`}>
        Estimated MRR
      </PanelHead>
      <div className="tool-range">
        <span>
          <b>{fmtUsd(lowCents)}</b>
          <em>p25</em>
        </span>
        <span className="mid">
          <b>{fmtUsd(midCents)}</b>
          <em>median</em>
        </span>
        <span>
          <b>{fmtUsd(highCents)}</b>
          <em>p75</em>
        </span>
      </div>
      <p className="tool-result-copy">
        Based on <strong>{result.bucket.n.toLocaleString("en-US")}</strong>{" "}
        comparable verified-revenue startup(s) in <strong>{category}</strong>,{" "}
        <strong>{starBand}</strong> stars
        {phLaunched !== "any"
          ? `, ${phLaunched === "yes" ? "launched on" : "never launched on"} Product Hunt`
          : ""}
        .
      </p>
      <p className="tool-result-meta">{FALLBACK_COPY[result.fallback]}</p>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="tool-field">
      <span>
        {label}
        {required ? <b> *</b> : null}
      </span>
      {children}
    </label>
  );
}

function PanelHead({ right, children }: { right?: ReactNode; children: ReactNode }) {
  return (
    <div className="tool-panel-head">
      <span className="corner" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="key">{children}</span>
      {right ? <span className="right">{right}</span> : null}
    </div>
  );
}
