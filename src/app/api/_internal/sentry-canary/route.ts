import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { timingSafeEqualStr } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authFailure(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET not configured",
        code: "AUTH_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const candidate = header.slice("Bearer ".length).trim();
  if (!timingSafeEqualStr(candidate, secret)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deny = authFailure(request);
  if (deny) return deny;

  if (process.env.SENTRY_CANARY_ENABLED !== "1") {
    return NextResponse.json(
      { ok: false, error: "not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const error = new Error("Sentry canary test error");
  let eventId: string | undefined;

  Sentry.withScope((scope) => {
    scope.setTag("canary", "true");
    scope.setTag("route", "api/_internal/sentry-canary");
    scope.setContext("sentry_canary", {
      firedAt: new Date().toISOString(),
      enabled: true,
    });
    eventId = Sentry.captureException(error);
  });

  await Sentry.flush(2000);
  console.error("[sentry-canary] fired", eventId ?? "event-id-unavailable");
  throw error;
}
