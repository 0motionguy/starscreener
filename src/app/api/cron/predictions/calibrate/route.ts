// POST /api/cron/predictions/calibrate
//
// Calibration loop for the prediction writer. Walks every row in
// `.data/predictions.jsonl`, and for every row whose horizon has elapsed
// (and hasn't been scored yet), stamps:
//
//   - actualStarsAtHorizon  — current star count from getDerivedRepos()
//   - scoredAt              — marks the row done (no re-scoring)
//
// The row is then rewritten in place under the per-file lock so a
// concurrent writer can't stomp the calibration pass (and vice versa).
// Downstream, /api/predict/calibration aggregates the scored rows into
// (modelVersion, horizonDays) buckets with MAPE / MAE / inBandRate.
//
// Auth: CRON_SECRET bearer via verifyCronAuth (same tri-state as every
// other cron route — 503 in prod if unset, 401 on bad bearer, 200 in dev
// with no env).
//
// Body (all fields optional):
//   limit?: number — maximum rows to score in one pass. Default 500.
//                    Bounds the worst-case pass cost if the jsonl grows
//                    into the millions; excess rows get picked up next tick.

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { getDerivedRepos } from "@/lib/derived-repos";
import type { PredictionRecord } from "@/lib/predictions";
import {
  scorePredictions,
  type ScoredPrediction,
} from "@/lib/predictions-calibrator";
import type { PredictionRow } from "@/lib/predictions-writer";
import { PREDICTIONS_FILE } from "@/lib/repo-predictions";
import { mutateJsonlFile } from "@/lib/pipeline/storage/file-persistence";

interface SuccessResponse {
  ok: true;
  /** Total rows read from the jsonl. */
  scanned: number;
  /** Rows that were eligible + had a repo match + got scored this pass. */
  scored: number;
  /** Rows that were ineligible (already scored, not yet due, or repo missing). */
  skipped: number;
  file: string;
  durationMs: number;
}

interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

interface RequestBody {
  limit?: number;
}

const DEFAULT_LIMIT = 500;

async function parseBody(request: NextRequest): Promise<RequestBody> {
  try {
    const raw = await request.text();
    if (!raw.trim()) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const body = parsed as Record<string, unknown>;
    const out: RequestBody = {};
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      out.limit = Math.max(1, Math.floor(body.limit));
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Build the repo-stars lookup the calibrator needs. Keys are lowercased
 * so the case-insensitive lookup in `scorePredictions` is one hash away
 * from every row's fullName.
 */
function buildStarsByFullName(): Map<string, number> {
  const map = new Map<string, number>();
  for (const repo of getDerivedRepos()) {
    map.set(repo.fullName.toLowerCase(), repo.stars);
  }
  return map;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const startedAt = Date.now();
  const body = await parseBody(request);
  const limit = body.limit ?? DEFAULT_LIMIT;

  try {
    const starsByFullName = buildStarsByFullName();
    const now = new Date();

    let scanned = 0;
    let scored = 0;

    // Read + transform + write under the per-file lock. `mutateJsonlFile`
    // reads the current snapshot, applies our mutator, and writes the
    // result via tmp+rename so readers never observe a torn file and a
    // concurrent writer (/api/cron/predictions) doesn't race us.
    await mutateJsonlFile<PredictionRow>(PREDICTIONS_FILE, (current) => {
      scanned = current.length;

      // First pass — collect candidates (respecting `limit`) and score them.
      const candidates: PredictionRecord[] = [];
      for (const row of current) {
        if (candidates.length >= limit) break;
        // Already-scored rows short-circuit here so the limit budget is
        // spent on rows that actually need work.
        if (row.scoredAt) continue;
        candidates.push(row);
      }

      const scoredRows = scorePredictions(candidates, starsByFullName, now);
      scored = scoredRows.length;

      // Index scored rows by id (the writer guarantees id uniqueness within
      // a run; calibration only touches rows we drew from the current file,
      // so a collision would mean a writer bug — we'd still write the same
      // scored payload under the same key).
      const byId = new Map<string, ScoredPrediction>();
      for (const row of scoredRows) {
        // ScoredPrediction is PredictionRecord + extras; the on-disk row
        // shape includes `id`, which is preserved by the spread in the
        // calibrator. We cast to the row shape once to pull `id` out.
        const asRow = row as ScoredPrediction & { id?: string };
        if (typeof asRow.id === "string" && asRow.id.length > 0) {
          byId.set(asRow.id, row);
        }
      }

      // Second pass — rebuild the file, replacing matched rows with their
      // scored counterpart. Rows outside the candidate window, already-scored
      // rows, and rows the calibrator skipped (not yet due, repo missing)
      // all pass through unchanged.
      const next: PredictionRow[] = current.map((row) => {
        const match = byId.get(row.id);
        if (!match) return row;
        // Persist ONLY the contract fields (actualStarsAtHorizon + scoredAt).
        // signedError / absoluteError / percentError / inBand are derived
        // metrics — we rehydrate them on read in the summary endpoint so
        // the on-disk shape stays stable if the formulas change.
        return {
          ...row,
          actualStarsAtHorizon: match.actualStarsAtHorizon,
          scoredAt: match.scoredAt,
        };
      });

      return next;
    });

    const skipped = scanned - scored;

    return NextResponse.json({
      ok: true,
      scanned,
      scored,
      skipped,
      file: `.data/${PREDICTIONS_FILE}`,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message, code: "CALIBRATE_FAILED" },
      { status: 500 },
    );
  }
}
