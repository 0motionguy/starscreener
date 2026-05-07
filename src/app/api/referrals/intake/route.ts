// Referral cookie → client handoff endpoint.
//
// The Clerk sign-up modal opens in a JS context that doesn't see our
// HttpOnly `tr_ref` cookie payload (only its presence, not the signed
// fields). To carry attribution through Clerk, the client calls this
// route, gets the verified payload back as JSON, and stuffs it into
// `useSignUp().setUnsafeMetadata({ trRef: ... })`. The Clerk webhook
// then prefers `unsafeMetadata.trRef` over the cookie at row-insert time.
//
// Anonymous by design — no auth gate. The cookie itself is the proof of
// attribution; if it's missing or malformed, we return `trRef: null` and
// the sign-up proceeds with no referrer.

import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { verifyRefCookie } from "@/lib/referrals/cookie";

// Force Node runtime — the verify helper uses crypto.subtle which works in
// Edge too, but the Drizzle client downstream in the webhook is Node-only,
// so we pin Node here for consistency with the rest of /api/referrals.
export const runtime = "nodejs";
// No caching — every request resolves a fresh cookie.
export const dynamic = "force-dynamic";

interface IntakeResponse {
  ok: true;
  trRef: {
    code: string;
    /** First-touch landing URL (path + query). */
    urlHash: string;
  } | null;
}

export async function GET(req: NextRequest): Promise<NextResponse<IntakeResponse>> {
  const cookie = req.cookies.get("tr_ref")?.value;
  const verified = await verifyRefCookie(cookie);

  if (!verified) {
    return NextResponse.json({ ok: true, trRef: null });
  }

  return NextResponse.json({
    ok: true,
    trRef: {
      code: verified.code,
      // The cookie stores the full path+query as `url`. The client passes
      // it back through `unsafeMetadata.trRef.urlHash` so the webhook can
      // populate `referrals.first_landing_url` for funnel analysis.
      urlHash: verified.url,
    },
  });
}
