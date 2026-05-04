import { NextRequest, NextResponse } from "next/server";
import {
  internalAgentAuthFailureResponse,
  verifyInternalAgentAuth,
} from "@/lib/api/auth";
import { getTwitterScanCandidates, refreshTwitterSignalsFromStore } from "@/lib/twitter";
import { refreshRepoMetadataFromStore } from "@/lib/repo-metadata";

export const runtime = "nodejs";

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        retryable,
      },
    },
    { status },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = verifyInternalAgentAuth(request);
  const deny = internalAgentAuthFailureResponse(auth);
  if (deny) return deny;

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return errorResponse(
      400,
      "INVALID_LIMIT",
      "limit must be an integer between 1 and 100",
      false,
    );
  }

  await Promise.all([
    refreshTwitterSignalsFromStore(),
    refreshRepoMetadataFromStore(),
  ]);
  const candidates = await getTwitterScanCandidates(limit);

  return NextResponse.json(
    {
      ok: true,
      version: "v1",
      source: "twitter",
      generatedAt: new Date().toISOString(),
      count: candidates.length,
      candidates,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
