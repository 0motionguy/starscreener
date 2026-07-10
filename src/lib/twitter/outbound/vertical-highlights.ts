// Vertical spotlight pickers for the daily outbound thread (Wave 6
// distribution). Pulls the top funding deal of the week and the best
// value-score model from their respective data-stores so the funding +
// models verticals ride the daily X/Bluesky thread on alternating days
// (rotation + Friday-skip logic lives in the composer).
//
// Both pickers are best-effort: any read failure returns null and the
// thread simply goes out without a spotlight. Lives beside the composer
// (not in the route file) per the Next 15 route-export rule.

import {
  getFundingSignalsWithExtraction,
  refreshFundingNewsFromStore,
} from "@/lib/funding-news";
import { getModels, refreshModelsFromStore, sortModels } from "@/lib/models";

import type { FundingHighlight, ModelHighlight } from "./composer";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Biggest disclosed AI funding round of the last 7 days, or null. */
export async function pickFundingHighlight(): Promise<FundingHighlight | null> {
  await refreshFundingNewsFromStore().catch(() => {});
  const weekAgo = Date.now() - WEEK_MS;
  const candidates = getFundingSignalsWithExtraction().filter((s) => {
    const t = Date.parse(s.publishedAt);
    if (!Number.isFinite(t) || t < weekAgo) return false;
    const x = s.extracted;
    return Boolean(
      x &&
        typeof x.amount === "number" &&
        x.amount > 0 &&
        x.companyName &&
        x.companyName !== "Unknown",
    );
  });
  if (candidates.length === 0) return null;
  const top = candidates.reduce((a, b) =>
    (b.extracted?.amount ?? 0) > (a.extracted?.amount ?? 0) ? b : a,
  );
  const x = top.extracted;
  if (!x) return null;
  return {
    companyName: x.companyName,
    amountDisplay: x.amountDisplay,
    roundType: x.roundType,
  };
}

/** Best capability-per-dollar model from the public catalog, or null. */
export async function pickModelHighlight(): Promise<ModelHighlight | null> {
  await refreshModelsFromStore().catch(() => {});
  const models = getModels().filter(
    (m) => m.context_length > 0 && m.input_price_per_million >= 0,
  );
  if (models.length === 0) return null;
  const best = sortModels(models, "value")[0];
  if (!best) return null;
  return {
    name: best.name,
    provider: best.provider,
    inputPricePerMillion: best.input_price_per_million,
    contextLength: best.context_length,
  };
}
