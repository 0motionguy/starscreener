import { NextRequest, NextResponse } from "next/server";

import { authenticateDataApi, DATA_API_HEADERS } from "@/lib/api/data-route";
import {
  buildDataReposResponse,
  DataApiQueryError,
} from "@/lib/api/data-api";
import { getDerivedRepos } from "@/lib/derived-repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateDataApi(request);
  if (!auth.ok) return auth.response;

  try {
    const response = buildDataReposResponse(new URL(request.url).searchParams, {
      repos: getDerivedRepos(),
    });
    return NextResponse.json(response, {
      headers: {
        ...DATA_API_HEADERS,
        ...auth.context.rateLimitHeaders,
        "X-Starscreener-User": auth.context.userId,
        "X-Starscreener-Tier": auth.context.tier,
      },
    });
  } catch (err) {
    if (err instanceof DataApiQueryError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          code: err.code,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
        {
          status: err.status,
          headers: {
            ...DATA_API_HEADERS,
            ...auth.context.rateLimitHeaders,
          },
        },
      );
    }
    console.error("[api:data:repos] failed", err);
    return NextResponse.json(
      { ok: false, error: "internal error", code: "INTERNAL" },
      { status: 500, headers: DATA_API_HEADERS },
    );
  }
}
