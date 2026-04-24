"use client";

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

function fmtUsd(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1_000)}K`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${Math.round(dollars).toLocaleString()}`;
}

const FALLBACK_COPY: Record<
  EstimateResponse["result"]["fallback"],
  string
> = {
  exact: "Exact bucket match.",
  ignored_ph: "No data for the PH-launched dimension — ignoring it for this estimate.",
  ignored_stars: "No data for this star band — weighting across all bands in the category.",
  category_only: "Sparse data — weighting across all bands + PH-launched states in the category.",
  none: "Not enough data — try a different category or star range.",
};

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
      if (phLaunched !== "any") params.set("phLaunched", phLaunched === "yes" ? "true" : "false");
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
    <section className="space-y-6">
      <div className="rounded-card border border-border-primary bg-bg-card p-5 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Category" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
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
              className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {starBands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="unmatched">not on GitHub / not tracked</option>
            </select>
          </Field>
          <Field label="Launched on ProductHunt">
            <select
              value={phLaunched}
              onChange={(e) =>
                setPhLaunched(e.target.value as "yes" | "no" | "any")
              }
              className="w-full rounded-md border border-border-primary bg-bg-muted px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="any">any</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-primary pt-4">
          <p className="text-[11px] text-text-tertiary">
            {totalBuckets.toLocaleString()} bucket(s)
            {generatedAt ? ` · built ${new Date(generatedAt).toISOString().slice(0, 10)}` : null}
          </p>
          <button
            type="button"
            onClick={() => void onEstimate()}
            disabled={loading || !category || !starBand}
            className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-brand/90 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-bg-primary hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
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

      {error ? (
        <div className="rounded-md border border-down/60 bg-down/5 px-4 py-3 text-sm text-down">
          {error}
        </div>
      ) : null}

      {result ? (
        <ResultCard
          category={category}
          starBand={starBand}
          phLaunched={phLaunched}
          result={result}
        />
      ) : (
        <div className="rounded-card border border-dashed border-border-primary bg-bg-muted/40 p-6 text-sm text-text-tertiary">
          <Sparkles className="mr-2 inline size-4" aria-hidden />
          Set your category and star band, then hit estimate.
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
      <div className="rounded-card border border-border-primary bg-bg-card p-5 shadow-card">
        <p className="text-sm text-text-secondary">
          {FALLBACK_COPY[result.fallback]}
        </p>
      </div>
    );
  }
  const { lowCents, midCents, highCents } = result.range;
  return (
    <div className="rounded-card border border-up/40 bg-up/5 p-5 shadow-card">
      <div className="font-mono text-[10px] uppercase tracking-wider text-up">
        Estimated MRR
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-3 font-mono tabular-nums">
        <span className="text-text-tertiary text-sm">p25</span>
        <span className="text-2xl font-semibold text-text-primary">{fmtUsd(lowCents)}</span>
        <span className="text-text-tertiary">—</span>
        <span className="text-2xl font-semibold text-up">{fmtUsd(midCents)}</span>
        <span className="text-text-tertiary">—</span>
        <span className="text-2xl font-semibold text-text-primary">{fmtUsd(highCents)}</span>
        <span className="text-text-tertiary text-sm">p75</span>
      </div>
      <p className="mt-3 text-sm text-text-secondary">
        Based on <strong>{result.bucket.n.toLocaleString()}</strong> comparable verified-revenue startup(s){" "}
        in <strong>{category}</strong>, <strong>{starBand}</strong> stars
        {phLaunched !== "any"
          ? `, ${phLaunched === "yes" ? "launched on" : "never launched on"} ProductHunt`
          : ""}
        .
      </p>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {FALLBACK_COPY[result.fallback]}
      </p>
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
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
        {required ? <span className="text-down"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
