// GET /api/funding/events
//
// V4 W4 — paginated funding events. Backend half of the funding vertical.
//
// Query parameters (all optional):
//   roundType   — one of: pre-seed | seed | series-a | series-b | series-c |
//                 series-d+ | bridge | acquisition | ipo
//   since       — ISO 8601 lower bound on closedAt (inclusive)
//   limit       — 1..200, default 50
//   offset      — page offset, default 0
//
// Returns FundingEventsPage. Empty data store → 200 with `events: []`,
// `total: 0`. The producer (PitchBook/Tracxn ingestion in W4 phase 2.1)
// is what populates the `funding-events` data-store key — until then
// the route is a stable, empty endpoint.
//
// Read-only; no body parsing, so no Zod schema is required by lint:zod-routes.

import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope } from "@/lib/api/error-response";
import {
  queryFundingEvents,
  refreshFundingFromStore,
  type FundingEventsPage,
} from "@/lib/funding/aggregate";
import type { FundingEventRound } from "@/lib/funding/types";

export const runtime = "nodejs";

const KNOWN_ROUND_TYPES: ReadonlyArray<FundingEventRound> = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "series-d+",
  "bridge",
  "acquisition",
  "ipo",
];

const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

interface FundingEventsResponse extends FundingEventsPage {
  generatedAt: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<FundingEventsResponse | { ok: false; error: string }>> {
  const { searchParams } = request.nextUrl;

  // ---- roundType ----------------------------------------------------------
  let roundType: FundingEventRound | undefined;
  const roundTypeParam = searchParams.get("roundType");
  if (roundTypeParam !== null && roundTypeParam !== "") {
    if (!KNOWN_ROUND_TYPES.includes(roundTypeParam as FundingEventRound)) {
      return NextResponse.json(
        errorEnvelope(
          `roundType must be one of: ${KNOWN_ROUND_TYPES.join(", ")}`,
        ),
        { status: 400 },
      );
    }
    roundType = roundTypeParam as FundingEventRound;
  }

  // ---- since --------------------------------------------------------------
  let since: string | undefined;
  const sinceParam = searchParams.get("since");
  if (sinceParam !== null && sinceParam !== "") {
    const parsed = Date.parse(sinceParam);
    if (!Number.isFinite(parsed)) {
      return NextResponse.json(
        errorEnvelope("since must be a valid ISO 8601 timestamp"),
        { status: 400 },
      );
    }
    since = new Date(parsed).toISOString();
  }

  // ---- limit --------------------------------------------------------------
  let limit = DEFAULT_LIMIT;
  const limitParam = searchParams.get("limit");
  if (limitParam !== null && limitParam !== "") {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return NextResponse.json(
        errorEnvelope("limit must be an integer"),
        { status: 400 },
      );
    }
    if (parsed < MIN_LIMIT || parsed > MAX_LIMIT) {
      return NextResponse.json(
        errorEnvelope(
          `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`,
        ),
        { status: 400 },
      );
    }
    limit = parsed;
  }

  // ---- offset -------------------------------------------------------------
  let offset = 0;
  const offsetParam = searchParams.get("offset");
  if (offsetParam !== null && offsetParam !== "") {
    const parsed = Number(offsetParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return NextResponse.json(
        errorEnvelope("offset must be a non-negative integer"),
        { status: 400 },
      );
    }
    offset = parsed;
  }

  try {
    await refreshFundingFromStore();
    const page = queryFundingEvents({ roundType, since, limit, offset });
    return NextResponse.json(
      { ...page, generatedAt: new Date().toISOString() },
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }
}
