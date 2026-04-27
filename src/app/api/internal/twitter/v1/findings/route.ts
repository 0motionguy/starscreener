import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { LegacyTwitterFindingsPayloadSchema } from "@/lib/twitter/ingest-contract";
import {
  ingestTwitterFindings,
  isTwitterIngestError,
} from "@/lib/twitter/service";

export const runtime = "nodejs";

function apiErrorResponse(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: Array<{ path: string; message: string }>,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        retryable,
        ...(details && details.length > 0 ? { details } : {}),
      },
    },
    { status },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiErrorResponse(
      400,
      "INVALID_JSON",
      "request body is not valid JSON",
      false,
    );
  }

  const parsed = LegacyTwitterFindingsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiErrorResponse(
      422,
      "INVALID_PAYLOAD",
      "invalid legacy twitter findings payload",
      false,
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  try {
    const result = await ingestTwitterFindings(parsed.data);
    return NextResponse.json({
      ok: true,
      created: result.created,
      updated: result.updated,
      ingestionId: result.ingestionId,
      signal: result.signal,
      deprecated: true,
      canonicalEndpoint: "/api/internal/signals/twitter/v1/ingest",
    });
  } catch (error) {
    if (isTwitterIngestError(error)) {
      return apiErrorResponse(
        error.status,
        error.code,
        error.message,
        error.retryable,
        error.details,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return apiErrorResponse(
      500,
      "INGEST_FAILED",
      message,
      true,
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: "/api/internal/twitter/v1/findings",
    status: "deprecated",
    canonicalEndpoint: "/api/internal/signals/twitter/v1/ingest",
    auth: "Authorization: Bearer $CRON_SECRET",
    accepts: "legacy v1 findings payload",
  });
}
