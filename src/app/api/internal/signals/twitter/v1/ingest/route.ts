// lint-allow: no-parsebody — body IS Zod-validated via TwitterIngestRequestSchema
// below, but the agent-platform contract uses a bespoke {ok:false, error:{code,
// message,retryable,details}} envelope and 422 status for validation failures
// (vs canonical {ok:false, error:string} 400). Reshaping through parseBody
// would either flatten the envelope (breaking the agent contract) or require
// a full re-shape on every error path. Document and skip.
import { NextRequest, NextResponse } from "next/server";
import {
  internalAgentAuthFailureResponse,
  verifyInternalAgentAuth,
} from "@/lib/api/auth";
import { TwitterIngestRequestSchema } from "@/lib/twitter/ingest-contract";
import {
  ingestTwitterAgentFindings,
  isTwitterIngestError,
} from "@/lib/twitter";

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

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = verifyInternalAgentAuth(request);
  const deny = internalAgentAuthFailureResponse(auth);
  if (deny) return deny;
  if (auth.kind !== "ok") {
    return apiErrorResponse(
      500,
      "AUTH_STATE_INVALID",
      "internal auth state could not be resolved",
      true,
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return apiErrorResponse(
      413,
      "PAYLOAD_TOO_LARGE",
      `request body exceeds ${MAX_BODY_BYTES} bytes`,
      false,
    );
  }

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

  const parsed = TwitterIngestRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiErrorResponse(
      422,
      "INVALID_PAYLOAD",
      "invalid twitter ingest payload",
      false,
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  try {
    const result = await ingestTwitterAgentFindings(parsed.data, auth.principal);
    return NextResponse.json(result);
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
    endpoint: "/api/internal/signals/twitter/v1/ingest",
    method: "POST",
    auth: {
      header: "Authorization: Bearer <internal-agent-token>",
      env: "INTERNAL_AGENT_TOKENS_JSON (fallback: CRON_SECRET in dev/internal contexts)",
    },
    idempotency: {
      key: "scan.scanId",
      behavior: [
        "same scanId + same payload => idempotent replay",
        "same scanId + different payload => 409 IDEMPOTENCY_CONFLICT",
      ],
    },
    request: {
      version: "v1",
      source: "twitter",
      requiredSections: [
        "agent",
        "repo",
        "scan",
        "queries",
        "posts",
        "rawSummary",
      ],
      optionalSections: [
        "observed",
      ],
    },
    response: {
      ok: true,
      version: "v1",
      ingestionId: "stable ingestion id derived from scanId",
      counts: [
        "queriesStored",
        "postsReceived",
        "postsAccepted",
        "postsRejected",
        "postsInserted",
        "postsUpdated",
      ],
      computed: [
        "mentionCount24h",
        "uniqueAuthors24h",
        "totalLikes24h",
        "totalReposts24h",
        "totalReplies24h",
        "totalQuotes24h",
        "engagementTotal",
        "finalTwitterScore",
        "badgeState",
        "lastScannedAt",
        "topPostUrl",
      ],
    },
  });
}
