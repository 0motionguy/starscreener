import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildRedirect(req: NextRequest): NextResponse {
  const target = new URL("/huggingface/models", req.nextUrl.origin);
  const res = NextResponse.redirect(target, { status: 308 });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export function GET(req: NextRequest): NextResponse {
  return buildRedirect(req);
}

export function HEAD(req: NextRequest): NextResponse {
  return buildRedirect(req);
}
