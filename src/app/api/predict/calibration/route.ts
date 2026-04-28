// GET /api/predict/calibration
//
// Public read surface for calibration stats. Reads `.data/predictions.jsonl`,
// filters to rows that have been scored by the calibration cron
// (`actualStarsAtHorizon` + `scoredAt` populated), and aggregates into
// per-(modelVersion, horizonDays) buckets:
//
//   - count              — number of scored predictions in the bucket
//   - inBandRate (0..1)  — fraction whose actual fell inside [p10, p90]
//   - mape               — mean absolute percent error × 100
//   - mae                — mean absolute error (stars)
//   - meanSignedError    — mean signed error (positive = chronic undershoot)
//
// UI eventually renders "Model v1 MAPE: 12% (n=47)". Cache aggressively
// because the upstream data only changes when the calibration cron runs.

import { NextRequest, NextResponse } from "next/server";

import {
  isScoredPrediction,
  rehydrateScored,
  summarizeCalibration,
  type CalibrationSummary,
} from "@/lib/predictions-calibrator";
import type { PredictionRow } from "@/lib/predictions-writer";
import { PREDICTIONS_FILE } from "@/lib/repo-predictions";
import { readJsonlFile } from "@/lib/pipeline/storage/file-persistence";

export const runtime = "nodejs";

interface SuccessResponse {
  ok: true;
  fetchedAt: string;
  summaries: CalibrationSummary[];
}

interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;

// `NextRequest` isn't consumed by the handler, but we keep the signature
// aligned with every other GET route (and so future filters like
// `?modelVersion=` can be added without touching the call sites).
export async function GET(
  _request: NextRequest,
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const rows = await readJsonlFile<PredictionRow>(PREDICTIONS_FILE);

    // Filter down to rows the calibrator has already graded, then
    // rehydrate the derived error fields (signedError / absoluteError /
    // percentError / inBand) so the aggregator has everything it needs.
    // The on-disk jsonl only persists the two contract fields
    // (actualStarsAtHorizon + scoredAt) — the rest is computed here.
    //
    // Type guard: isScoredPrediction narrows `actualStarsAtHorizon` + `scoredAt`
    // to required. We widen the predicate's return to `PredictionRow &
    // {...}` so TS keeps the row's `id` through the filter pipeline.
    const scored = rows
      .filter((row): row is PredictionRow & {
        actualStarsAtHorizon: number;
        scoredAt: string;
      } => isScoredPrediction(row))
      .map(rehydrateScored);

    const summaries = summarizeCalibration(scored);

    return NextResponse.json(
      {
        ok: true,
        fetchedAt: new Date().toISOString(),
        summaries,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, code: "CALIBRATION_READ_FAILED" },
      { status: 500 },
    );
  }
}
