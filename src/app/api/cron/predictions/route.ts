// POST /api/cron/predictions
//
// Nightly / on-demand writer that generates prediction rows for the
// top-ranked repos and appends them to `.data/predictions.jsonl`. The
// reader (`src/lib/repo-predictions.ts`) reads that file every render to
// hydrate the repo-profile `PredictionSnapshot`. Without this cron that
// file never exists, so every profile renders the "no prediction" state
// even though the forecasting math is ready to go.
//
// Auth: CRON_SECRET bearer via verifyCronAuth (same tri-state as every
// other cron route — 503 in prod if unset, 401 on bad bearer, 200 in dev
// with no env).
//
// Idempotency model:
//   - NOT dedup-on-write. Every invocation appends fresh rows stamped
//     with the current ISO `generatedAt`. Two runs in a day → two rows
//     per (repo, horizon). That is fine because the reader keeps only
//     the newest row per (fullName, horizonDays, modelVersion) triple.
//   - Within a single run, each (repo, horizon) pair is emitted exactly
//     once because `generatePredictionsBatch` loops over a deduped slate.
//
// Body (all fields optional):
//   fullNames?: string[]  — if given, limit to those repos.
//   topN?: number         — default 300; picks top-N by momentumScore
//                           when `fullNames` is absent.
//   horizons?: number[]   — default [7, 30] (from the writer's defaults).
//                           Only 7/30/90 are accepted — anything else 400s.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { errorEnvelope } from "@/lib/api/error-response";
import { getDerivedRepos } from "@/lib/derived-repos";
import {
  generatePredictionsBatch,
  type PredictionRow,
} from "@/lib/predictions-writer";
import {
  isPredictionHorizon,
  PREDICTION_HORIZONS,
  type PredictionHorizonDays,
} from "@/lib/predictions";
import { PREDICTIONS_FILE } from "@/lib/repo-predictions";
import { mutateJsonlFile } from "@/lib/pipeline/storage/file-persistence";
import type { Repo } from "@/lib/types";

export const runtime = "nodejs";

interface SuccessResponse {
  ok: true;
  repos: number;
  rows: number;
  file: string;
  durationMs: number;
}

interface ErrorResponse {
  ok: false;
  error: string;
}

// Cron-friendly schema: every field is optional + permissive on bad
// values (filtered, not rejected) so a malformed override doesn't 400
// the whole job. The endpoint is designed to be called by a cron
// trigger that may send Content-Length: 0 (allowEmpty handles that).
const RequestBodySchema = z
  .object({
    fullNames: z
      .array(z.string().min(1))
      .optional(),
    topN: z
      .number()
      .finite()
      .transform((n) => Math.max(1, Math.floor(n)))
      .optional(),
    horizons: z
      .array(z.number().finite())
      .optional(),
  })
  .passthrough();

type RequestBody = z.infer<typeof RequestBodySchema>;

const DEFAULT_TOP_N = 300;

function pickRepos(body: RequestBody): Repo[] {
  const all = getDerivedRepos();
  if (body.fullNames && body.fullNames.length > 0) {
    const wanted = new Set(body.fullNames.map((n) => n.toLowerCase()));
    return all.filter((r) => wanted.has(r.fullName.toLowerCase()));
  }
  const topN = body.topN ?? DEFAULT_TOP_N;
  // `momentumScore` is already the canonical ranking field used by the
  // homepage; fall back to `starsDelta7d` as a tiebreaker so two repos
  // with identical momentum have a stable order.
  return [...all]
    .sort((a, b) => {
      const ma = a.momentumScore ?? 0;
      const mb = b.momentumScore ?? 0;
      if (mb !== ma) return mb - ma;
      return (b.starsDelta7d ?? 0) - (a.starsDelta7d ?? 0);
    })
    .slice(0, topN);
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  const startedAt = Date.now();
  const parsedBody = await parseBody(request, RequestBodySchema, {
    allowEmpty: true,
  });
  if (!parsedBody.ok) return parsedBody.response as NextResponse<ErrorResponse>;
  const body = parsedBody.data;

  // Validate horizons before we start work. `undefined` → writer uses
  // default [7, 30]; a caller-provided list must be all-valid.
  let horizons: PredictionHorizonDays[] | undefined;
  if (body.horizons && body.horizons.length > 0) {
    const valid = body.horizons.filter(isPredictionHorizon);
    if (valid.length !== body.horizons.length) {
      return NextResponse.json(
        errorEnvelope(
          `horizons must all be one of: ${PREDICTION_HORIZONS.join(", ")}`,
        ),
        { status: 400 },
      );
    }
    horizons = Array.from(new Set(valid)).sort((a, b) => a - b);
  }

  try {
    const repos = pickRepos(body);
    const rows = generatePredictionsBatch(
      repos,
      horizons ? { horizons } : {},
    );

    // Write under the per-file lock so two concurrent cron runs can't
    // interleave their appends (and can't race a read-modify-write from
    // another writer that ever reuses the same file). `mutateJsonlFile`
    // reads current → applies our `next = current.concat(rows)` → writes
    // atomically via tmp+rename, all inside `withFileLock`.
    await mutateJsonlFile<PredictionRow>(
      PREDICTIONS_FILE,
      (current) => current.concat(rows),
    );

    return NextResponse.json({
      ok: true,
      repos: repos.length,
      rows: rows.length,
      file: `.data/${PREDICTIONS_FILE}`,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

// GET alias for Vercel Cron, which fires GET (not POST) to each cron path.
// Vercel auto-injects `Authorization: Bearer <CRON_SECRET>`, and `parseBody`
// already tolerates empty bodies — the writer defaults to topN=300,
// horizons=[7,30], which matches the GitHub Actions workflow body.
export async function GET(
  request: NextRequest,
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  return POST(request);
}
