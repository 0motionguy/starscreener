import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { errorEnvelope } from "@/lib/api/error-response";
import {
  sentryDsnConfigured,
  syntheticEngineError,
  type VerificationKind,
  verificationTags,
} from "@/lib/sentry-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["recoverable", "quarantine", "fatal"]).default("recoverable"),
});

type OkResponse = {
  ok: true;
  sent: true;
  kind: VerificationKind;
  eventId: string | null;
  sentAt: string;
};

type ErrorResponse = ReturnType<typeof errorEnvelope>;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<OkResponse | ErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  if (!sentryDsnConfigured()) {
    return NextResponse.json(
      errorEnvelope("sentry verification disabled (SENTRY_DSN missing)", "SENTRY_NOT_CONFIGURED"),
      { status: 503 },
    );
  }

  // lint-allow: no-parsebody — body is optional (empty POST allowed); manual
  // safeParse with empty-object fallback is intentional here.
  let kind: VerificationKind = "recoverable";
  if (request.headers.get("content-length") !== "0") {
    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        errorEnvelope("invalid verification payload", "INVALID_BODY"),
        { status: 400 },
      );
    }
    kind = parsed.data.kind;
  }

  const error = syntheticEngineError(kind);
  const eventId = Sentry.captureException(error, {
    tags: verificationTags(kind),
    level: kind === "fatal" ? "error" : "warning",
    extra: {
      scope: "api/admin/sentry-verify",
      metadata: error.metadata,
    },
  });
  await Sentry.flush(2_000);

  return NextResponse.json({
    ok: true,
    sent: true,
    kind,
    eventId: eventId ?? null,
    sentAt: new Date().toISOString(),
  });
}
