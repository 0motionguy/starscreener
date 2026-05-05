import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { serverError } from "@/lib/api/error-response";
import { Soft404RecoverableError } from "@/lib/errors";
import { detectSoft404 } from "@/lib/soft-404";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PATHS = [
  "/",
  "/repo/openai/does-not-exist-probably-404",
  "/definitely-not-a-real-route-for-soft-404-check",
];

type RouteCheck = {
  path: string;
  status: number;
  soft404: boolean;
  markers: string[];
};

interface Soft404ReportResponse {
  ok: true;
  checkedAt: string;
  targetOrigin: string;
  routes: RouteCheck[];
  soft404Count: number;
}

interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

function normalizePaths(raw: string | null): string[] {
  if (!raw) return DEFAULT_PATHS;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (part.startsWith("/") ? part : `/${part}`));
  return parts.length > 0 ? parts : DEFAULT_PATHS;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<Soft404ReportResponse | ErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<ErrorResponse>;

  try {
    const paths = normalizePaths(request.nextUrl.searchParams.get("paths"));
    const targetOrigin = request.nextUrl.origin;
    const routes: RouteCheck[] = [];

    for (const path of paths) {
      const url = `${targetOrigin}${path}`;
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers: {
          "x-soft-404-probe": "1",
        },
      });
      const bodyText = await response.text();
      const result = detectSoft404({
        status: response.status,
        bodyText,
      });

      routes.push({
        path,
        status: response.status,
        soft404: result.isSoft404,
        markers: result.markers,
      });
    }

    const soft404Count = routes.filter((row) => row.soft404).length;
    if (soft404Count > 0) {
      throw new Soft404RecoverableError("soft-404 markers detected on 2xx route response", {
        routeCount: routes.length,
        soft404Count,
        paths: routes.filter((row) => row.soft404).map((row) => row.path),
      });
    }

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      targetOrigin,
      routes,
      soft404Count,
    });
  } catch (err) {
    return serverError(err, {
      scope: "[api:admin:soft-404]",
      status: 503,
      code: "SOFT_404_DETECTED",
      publicMessage: "soft-404 markers detected",
    });
  }
}
