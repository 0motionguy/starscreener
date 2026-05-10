// GET /api/pipeline/sidebar-overlay
//
// Per-user sidebar overlay. Returns just the user-scoped fields that can't
// safely live in the shared shell payload (`unreadAlerts` today; future
// fields land here too). Requires a Clerk session — anonymous requests get
// 401. The `?userId=<id>` query param must match the Clerk session's user
// id; mismatches yield 403 (defence-in-depth against confused deputy).
//
// Cache-Control: `private, no-store` so neither shared CDNs nor Vercel's
// data cache ever see another user's overlay. Uncacheable by design.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { errorEnvelope } from "@/lib/api/error-response";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { getUserSidebarOverlay } from "@/lib/sidebar-data";

export type { SidebarOverlayResponse } from "@/lib/sidebar-data";

export const runtime = "nodejs";
// `auth()` reads the Clerk session token, which means the route must be
// dynamic — Next would otherwise try to prerender it.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!getClerkPublishableKey()) {
    return NextResponse.json(errorEnvelope("Sign in required."), {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), { status: 500 });
  }

  const sessionUserId = session?.userId ?? null;
  if (!sessionUserId) {
    return NextResponse.json(errorEnvelope("Sign in required."), {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId");
  if (requestedUserId !== null && requestedUserId !== sessionUserId) {
    return NextResponse.json(
      errorEnvelope("userId query param does not match the signed-in user."),
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const overlay = await getUserSidebarOverlay({ userId: sessionUserId });
    return NextResponse.json(overlay, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(errorEnvelope(message), {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
