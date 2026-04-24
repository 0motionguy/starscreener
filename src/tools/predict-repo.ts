// StarScreener — `predict_repo` agent tool.
//
// Thin wrapper over the v1 predictions model in src/lib/predictions.
// Exposes the same /api/predict shape (multi-horizon forecast +
// drivers) over Portal/MCP so agents can reason about repo trajectory
// without scraping the web UI.

import { getDerivedRepoByFullName } from "../lib/derived-repos";
import {
  PREDICTION_HORIZONS,
  PREDICTION_MODEL_VERSION,
  explainPrediction,
  isPredictionHorizon,
  predictRepoTrajectory,
  type PredictionDriver,
  type PredictionHorizonDays,
  type PredictionRecord,
} from "../lib/predictions";
import { normalizeRepoReference } from "../lib/repo-submissions";
import { NotFoundError, ParamError } from "./errors";

export interface PredictRepoParams {
  repo: string;
  horizons?: PredictionHorizonDays[];
}

export interface PredictRepoItem {
  horizon_days: PredictionHorizonDays;
  prediction: PredictionRecord | null;
  drivers: PredictionDriver[] | null;
  reason: string | null;
}

export interface PredictRepoResult {
  full_name: string;
  model_version: string;
  results: PredictRepoItem[];
}

export function parsePredictRepoParams(raw: unknown): PredictRepoParams {
  if (raw === null || typeof raw !== "object") {
    throw new ParamError("params must be an object");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.repo !== "string" || !r.repo.trim()) {
    throw new ParamError("repo must be a non-empty string (owner/name or URL)");
  }

  const out: PredictRepoParams = { repo: r.repo.trim() };

  if (r.horizons !== undefined) {
    if (!Array.isArray(r.horizons)) {
      throw new ParamError("horizons must be an array");
    }
    const valid: PredictionHorizonDays[] = [];
    for (const h of r.horizons) {
      if (!isPredictionHorizon(h)) {
        throw new ParamError(
          `horizons entries must be one of: ${PREDICTION_HORIZONS.join(", ")}`,
        );
      }
      if (!valid.includes(h)) valid.push(h);
    }
    if (valid.length > 0) {
      out.horizons = valid.sort((a, b) => a - b);
    }
  }

  return out;
}

export async function predictRepoTool(
  raw: unknown,
): Promise<PredictRepoResult> {
  const params = parsePredictRepoParams(raw);
  const normalized = normalizeRepoReference(params.repo);
  if (!normalized) {
    throw new ParamError(
      "repo must be a GitHub repo URL or 'owner/name' (e.g. vercel/next.js)",
    );
  }
  const repo = getDerivedRepoByFullName(normalized.fullName);
  if (!repo) {
    throw new NotFoundError(
      `repo '${normalized.fullName}' is not in the trending feed yet`,
    );
  }

  const horizons = params.horizons ?? [...PREDICTION_HORIZONS];
  const results: PredictRepoItem[] = horizons.map((horizonDays) => {
    const result = predictRepoTrajectory(repo, horizonDays);
    if (result.kind === "ok") {
      return {
        horizon_days: horizonDays,
        prediction: result.prediction,
        drivers: explainPrediction(result.prediction),
        reason: null,
      };
    }
    return {
      horizon_days: horizonDays,
      prediction: null,
      drivers: null,
      reason: result.reason,
    };
  });

  return {
    full_name: repo.fullName,
    model_version: PREDICTION_MODEL_VERSION,
    results,
  };
}

export const PREDICT_REPO_PORTAL_PARAMS = {
  repo: {
    type: "string",
    required: true,
    description: "GitHub 'owner/name' reference or URL.",
  },
  horizons: {
    type: "array",
    required: false,
    description:
      "Forecast horizons in days. Subset of [7, 30, 90]. Defaults to all three.",
  },
} as const;

export const PREDICT_REPO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["repo"],
  properties: {
    repo: {
      type: "string",
      minLength: 1,
      description: "GitHub 'owner/name' reference or URL.",
    },
    horizons: {
      type: "array",
      items: { type: "integer", enum: [...PREDICTION_HORIZONS] },
      description: "Forecast horizons in days. Defaults to [7, 30, 90].",
    },
  },
} as const;

export const PREDICT_REPO_DESCRIPTION =
  "Return the v1 trajectory forecast for a repo across chosen horizons. Each result has a point estimate, 80% confidence band, and human-readable drivers. Transparent — the model is public (see src/lib/predictions.ts).";
