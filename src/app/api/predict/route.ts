// GET /api/predict?repo=<owner/name>&horizon=7|30|90
//
// Returns a transparent forecast for the repo's star count at +N days.
// Public read — predictions are derived from already-public data.
// Optional `horizon` defaults to 30. Multiple horizons can be requested
// at once via repeated `horizon` params:
//
//   /api/predict?repo=vercel/next.js&horizon=7&horizon=30&horizon=90
//
// The model is described in src/lib/predictions.ts; the inputs snapshot
// is included in every response so consumers (UI, agent tools, future
// calibration cron) can audit what fed the forecast.

import { NextRequest, NextResponse } from "next/server";

import { getDerivedRepoByFullName } from "@/lib/derived-repos";
import {
  PREDICTION_HORIZONS,
  PREDICTION_MODEL_VERSION,
  explainPrediction,
  isPredictionHorizon,
  predictRepoTrajectory,
  type PredictionDriver,
  type PredictionHorizonDays,
  type PredictionRecord,
} from "@/lib/predictions";
import { normalizeRepoReference } from "@/lib/repo-submissions";

interface PredictItem {
  horizonDays: PredictionHorizonDays;
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

function parseHorizons(searchParams: URLSearchParams): PredictionHorizonDays[] {
  // Multiple ?horizon= params, OR a single comma-separated value, OR
  // none → default to [30].
  const raw = searchParams.getAll("horizon");
  const candidates = raw.flatMap((value) =>
    value
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((n) => Number.isFinite(n)),
  );
  const valid = candidates.filter(isPredictionHorizon);
  if (valid.length === 0) return [30];
  // Dedupe + sort ascending so consumers don't have to re-sort.
  return Array.from(new Set(valid)).sort((a, b) => a - b);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<PredictResponse | ErrorResponse>> {
  const { searchParams } = request.nextUrl;
  const repoParam = (searchParams.get("repo") ?? "").trim();
  if (!repoParam) {
    return NextResponse.json(
      { ok: false, error: "repo query parameter is required" },
      { status: 400 },
    );
  }

  const normalized = normalizeRepoReference(repoParam);
  if (!normalized) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "repo must be a GitHub repo URL or owner/name (e.g. vercel/next.js)",
      },
      { status: 400 },
    );
  }

  const repo = getDerivedRepoByFullName(normalized.fullName);
  if (!repo) {
    return NextResponse.json(
      {
        ok: false,
        error: `repo '${normalized.fullName}' is not in the trending feed yet`,
      },
      { status: 404 },
    );
  }

  const horizons = parseHorizons(searchParams);
  // Validate at least one horizon survived the filter — if the caller
  // sent only invalid values, surface that explicitly rather than
  // silently switching to default.
  const requestedRaw = searchParams.getAll("horizon");
  if (requestedRaw.length > 0 && horizons.length === 1 && horizons[0] === 30) {
    const requestedNumbers = requestedRaw.flatMap((v) =>
      v.split(",").map((p) => Number.parseInt(p.trim(), 10)),
    );
    const anyValid = requestedNumbers.some(isPredictionHorizon);
    if (!anyValid) {
      return NextResponse.json(
        {
          ok: false,
          error: `horizon must be one of: ${PREDICTION_HORIZONS.join(", ")}`,
        },
        { status: 400 },
      );
    }
  }

  const results: PredictItem[] = horizons.map((horizonDays) => {
    const result = predictRepoTrajectory(repo, horizonDays);
    if (result.kind === "ok") {
      return {
        horizonDays,
        prediction: result.prediction,
        drivers: explainPrediction(result.prediction),
        reason: null,
      };
    }
    return {
      horizonDays,
      prediction: null,
      drivers: null,
      reason: result.reason,
    };
  });

  return NextResponse.json({
    ok: true,
    fullName: repo.fullName,
    modelVersion: PREDICTION_MODEL_VERSION,
    results,
  });
}
