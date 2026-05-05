import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { SubdomainTakeoverFatalError, engineErrorSentryContext } from "@/lib/errors";
import { runSubdomainTakeoverScan } from "@/lib/security/subdomain-takeover";
// lint-allow: no-parsebody — no-body cron trigger; route reads no request payload.

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  try {
    const result = await runSubdomainTakeoverScan();
    return NextResponse.json(
      {
        ok: true,
        checkedAt: result.checkedAt,
        checkedTargets: result.checkedTargets,
        findingsCount: result.findings.length,
        findings: result.findings,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const wrapped =
      error instanceof SubdomainTakeoverFatalError
        ? error
        : new SubdomainTakeoverFatalError("subdomain takeover scan failed", {
            message: error instanceof Error ? error.message : String(error),
          });
    const sentryContext = engineErrorSentryContext(wrapped, {
      route: "api/cron/subdomain-takeover",
    });
    console.error("[api:cron:subdomain-takeover] failed", wrapped, sentryContext);
    return NextResponse.json(
      {
        ok: false,
        error: wrapped.message,
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
