import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { EngineError, engineErrorTags } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class SentryCanaryError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "sentry-canary" as const;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  if (process.env.SENTRY_CANARY_ENABLED !== "1") {
    return NextResponse.json(
      { ok: false, error: "not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const error = new SentryCanaryError("Sentry canary test error", {
    route: "api/_internal/sentry-canary",
    canary: true,
  });
  let eventId: string | undefined;

  Sentry.withScope((scope) => {
    scope.setTag("canary", "true");
    scope.setTag("route", "api/_internal/sentry-canary");
    for (const [key, value] of Object.entries(engineErrorTags(error))) {
      scope.setTag(key, value);
    }
    scope.setContext("sentry_canary", {
      firedAt: new Date().toISOString(),
      enabled: true,
      errorName: error.name,
    });
    eventId = Sentry.captureException(error);
  });

  await Sentry.flush(2000);
  console.error("[sentry-canary] fired", eventId ?? "event-id-unavailable");
  throw error;
}
