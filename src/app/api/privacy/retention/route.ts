import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/error-response";
import { getDataRetentionPolicy } from "@/lib/data-retention-policy";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
} as const;

export async function GET() {
  try {
    return NextResponse.json(getDataRetentionPolicy(), {
      headers: RESPONSE_HEADERS,
    });
  } catch (err) {
    return serverError(err, {
      scope: "[api/privacy/retention]",
      publicMessage: "failed to load data retention policy",
      code: "RETENTION_POLICY_UNAVAILABLE",
    });
  }
}
