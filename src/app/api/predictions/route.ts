// TrendingRepo — /api/predictions
//
// GET ?subjectType=repo&subjectId=vercel/next.js&horizon=30
//   Returns the existing active prediction for the subject, plus the raw
//   forecast points used to render the band chart. When no prediction
//   exists, computes one on the fly (read-through cache). Writes the
//   Prediction row so it can be resolved later by a cron job.

import { NextRequest, NextResponse } from "next/server";
import { getBuilderStore } from "@/lib/builder/store";
import { buildStarTrajectoryPrediction, forecastLinear } from "@/lib/builder/predictions";
import { getDerivedRepos } from "@/lib/derived-repos";
import { READ_CACHE_HEADERS } from "@/lib/api/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_HORIZONS = [14, 30, 90] as const;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const subjectType = sp.get("subjectType") ?? "repo";
  const subjectId = sp.get("subjectId")?.trim();
  const horizonRaw = parseInt(sp.get("horizon") ?? "30", 10);
  const horizon = (VALID_HORIZONS as readonly number[]).includes(horizonRaw)
    ? horizonRaw
    : 30;

  if (!subjectId) {
    return NextResponse.json(
      { error: "subjectId required (repo fullName or idea slug)" },
      { status: 400 },
    );
  }
  if (subjectType !== "repo") {
    return NextResponse.json(
      { error: "Only subjectType='repo' supported in P0" },
      { status: 400 },
    );
  }

  const repos = await getDerivedRepos();
  const repo = repos.find((r) => r.fullName === subjectId);
  if (!repo) {
    return NextResponse.json(
      { error: `Repo ${subjectId} not tracked` },
      { status: 404 },
    );
  }

  const now = new Date();
  const store = getBuilderStore();

  // Either reuse the latest active prediction or mint a new one. We mint a
  // fresh one daily so the band stays current with the latest sparkline.
  const existing = await store.predictionsForSubject("repo", subjectId);
  const today = now.toISOString().slice(0, 10);
  const fresh = existing.find(
    (p) =>
      p.archetype === "star_trajectory" &&
      p.horizonDays === horizon &&
      !p.outcome &&
      p.openedAt.slice(0, 10) === today,
  );

  let prediction = fresh;
  if (!prediction) {
    prediction = buildStarTrajectoryPrediction({
      repoFullName: repo.fullName,
      sparklineData: repo.sparklineData,
      currentStars: repo.stars,
      horizonDays: horizon,
      now,
    });
    await store.upsertPrediction(prediction);
  }

  // Re-derive the forecast points for the client (stateless — we don't
  // persist the full curve, only the tail).
  const forecast = forecastLinear(repo.sparklineData, {
    horizon,
    lookback: 30,
  });

  return NextResponse.json(
    {
      prediction: {
        id: prediction.id,
        subjectType: prediction.subjectType,
        subjectId: prediction.subjectId,
        archetype: prediction.archetype,
        question: prediction.question,
        method: prediction.method,
        horizonDays: prediction.horizonDays,
        p20: prediction.p20,
        p50: prediction.p50,
        p80: prediction.p80,
        metric: prediction.metric,
        unit: prediction.unit,
        openedAt: prediction.openedAt,
        resolvesAt: prediction.resolvesAt,
      },
      forecast: {
        method: forecast.method,
        points: forecast.points,
        sigma: forecast.sigma,
        slope: forecast.slope,
        fitSamples: forecast.fitSamples,
      },
    },
    { headers: READ_CACHE_HEADERS },
  );
}
