// Batch generator for the predictions JSONL feed.
//
// The /api/predict route computes a forecast on demand but never persists
// it. `src/lib/repo-predictions.ts` reads `.data/predictions.jsonl` to
// hydrate the `PredictionSnapshot` on the repo profile — without a writer
// that file never exists, so every profile renders the "no prediction"
// empty state.
//
// This module is the pure half of that writer. Given a slate of repos it
// returns an array of rows ready to append to `predictions.jsonl`. The cron
// route (`src/app/api/cron/predictions/route.ts`) is the I/O half: it picks
// which repos to forecast, calls this function, and appends the rows under
// the existing per-file lock.
//
// Contract:
//   - Pure + deterministic when `now` is pinned. No I/O, no global state.
//   - One row per (repo, horizon) pair. Repos with <MIN_SPARKLINE_POINTS
//     of history contribute zero rows — we refuse to fabricate signal for
//     cold repos.
//   - The `id` field embeds `generatedAt` so two runs of the same repo/
//     horizon/model within the same day produce distinct rows. Dedupe is
//     the reader's job (`repo-predictions.ts` keeps the newest per triple).

import type { Repo } from "@/lib/types";

import {
  MIN_SPARKLINE_POINTS,
  PREDICTION_HORIZONS,
  predictTrajectory,
  type PredictionHorizonDays,
  type PredictionRecord,
} from "@/lib/predictions";

/**
 * A written row — the on-disk shape is exactly this. `id` is a stable
 * compound key; the reader ignores it but it's useful for downstream
 * idempotency checks and ad-hoc grep.
 */
export type PredictionRow = PredictionRecord & { id: string };

export interface GenerateOptions {
  /** Horizons to forecast. Defaults to `[7, 30]`. */
  horizons?: PredictionHorizonDays[];
  /**
   * Timestamp to stamp the batch with. Injectable so tests can pin output
   * and so a single cron tick emits rows with a consistent `generatedAt`
   * (rather than drifting by milliseconds across the loop).
   */
  now?: Date;
}

const DEFAULT_HORIZONS: PredictionHorizonDays[] = [7, 30];

/**
 * Generate prediction rows for a batch of repos.
 *
 * For each (repo, horizon) pair we call {@link predictTrajectory}. Repos
 * with fewer than MIN_SPARKLINE_POINTS of sparkline data contribute zero
 * rows — `predictTrajectory` surfaces that as `null` and we skip silently.
 * Callers that need to tell "skipped" from "would have been a row" can
 * compare `repos.length * horizons.length` against the returned row count.
 */
export function generatePredictionsBatch(
  repos: Repo[],
  opts: GenerateOptions = {},
): PredictionRow[] {
  const horizons = opts.horizons ?? DEFAULT_HORIZONS;
  const now = opts.now ?? new Date();
  const timestampIso = now.toISOString();

  // Validate horizons — silently dropping an unsupported value would hide
  // a caller bug. Throwing gives the operator a stack trace with the bad
  // input in it.
  for (const h of horizons) {
    if (!(PREDICTION_HORIZONS as readonly number[]).includes(h)) {
      throw new Error(
        `generatePredictionsBatch: horizon ${h} is not in PREDICTION_HORIZONS (${PREDICTION_HORIZONS.join(", ")})`,
      );
    }
  }

  const rows: PredictionRow[] = [];
  for (const repo of repos) {
    // Fast bail for cold repos so we don't spend cycles inside
    // predictTrajectory just to receive null back. Mirrors the check
    // predictRepoTrajectory enforces, but surfaces the reason here.
    const sparkline = repo.sparklineData ?? [];
    if (sparkline.length < MIN_SPARKLINE_POINTS) continue;

    for (const horizon of horizons) {
      const prediction = predictTrajectory(repo, horizon, now);
      if (!prediction) continue; // insufficient_data — skip.

      const id = [
        repo.fullName,
        String(horizon),
        prediction.modelVersion,
        timestampIso,
      ].join(":");

      rows.push({
        ...prediction,
        id,
      });
    }
  }

  return rows;
}
