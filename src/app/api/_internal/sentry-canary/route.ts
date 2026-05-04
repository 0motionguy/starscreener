import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { EngineError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class SentryCanaryError extends EngineError {
  readonly category = "fatal" as const;
  readonly source = "sentry-canary" as const;
}

interface SentryCanaryResponse {
  ok: false;
  error: string;
  code: "NOT_FOUND" | "SENTRY_CANARY_FIRED";
  eventId?: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SentryCanaryResponse | { ok: false; reason: string }>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) {
    return deny as NextResponse<{ ok: false; reason: string }>;
  }

  if (process.env.SENTRY_CANARY_ENABLED !== "1") {
    return NextResponse.json(
      { ok: false, error: "not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  let error: SentryCanaryError;
  try {
    throw new SentryCanaryError("Sentry canary test error", {
      canary: true,
      route: "api/_internal/sentry-canary",
    });
  } catch (caught) {
    error = caught as SentryCanaryError;
  }

  let eventId: string | undefined;

  Sentry.withScope((scope) => {
    scope.setTag("canary", "true");
    scope.setTag("route", "api/_internal/sentry-canary");
    scope.setTag("source", error.source);
    scope.setTag("category", error.category);
    scope.setContext("sentry_canary", {
      firedAt: new Date().toISOString(),
      enabled: true,
      metadata: error.metadata,
    });
    eventId = Sentry.captureException(error);
  });

  await Sentry.flush(2000);
  console.error("[sentry-canary] fired", eventId ?? "event-id-unavailable");
  return NextResponse.json(
    {
      ok: false,
      error: "sentry canary fired",
      code: "SENTRY_CANARY_FIRED",
      ...(eventId ? { eventId } : {}),
    },
    { status: 500 },
  );
}
