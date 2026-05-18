// GET /api/email/unsubscribe?scope=<scope>&p=<profileId>&t=<hmac>
//
// One-click account-email unsubscribe for profile-backed emails. Public,
// no auth: the HMAC binds the preference change to one profile id and one
// email scope, so users can unsubscribe directly from old inbox links.

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import {
  parseEmailUnsubscribeScope,
  verifyEmailUnsubscribeToken,
  type EmailUnsubscribeScope,
} from "@/lib/email/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env && env.length > 0) return env.replace(/\/+$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function redirect(
  request: NextRequest,
  status: "invalid" | "server" | "ok",
  scope?: EmailUnsubscribeScope,
): NextResponse {
  const baseUrl = getBaseUrl(request);
  const suffix =
    status === "ok"
      ? `email_unsubscribed=${encodeURIComponent(scope ?? "unknown")}`
      : `email_unsubscribe=${status}`;
  return NextResponse.redirect(`${baseUrl}/you/settings?${suffix}`, {
    status: 302,
  });
}

async function applyUnsubscribe(
  profileId: string,
  scope: EmailUnsubscribeScope,
): Promise<void> {
  if (scope === "referral_updates") {
    await db
      .update(profiles)
      .set({ emailReferralUpdates: false })
      .where(eq(profiles.id, profileId));
    return;
  }

  await db
    .update(profiles)
    .set({ emailSystem: false })
    .where(eq(profiles.id, profileId));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const scope = parseEmailUnsubscribeScope(url.searchParams.get("scope"));
  const profileId = url.searchParams.get("p") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (
    !scope ||
    !verifyEmailUnsubscribeToken(scope, profileId, token)
  ) {
    return redirect(request, "invalid");
  }

  try {
    await applyUnsubscribe(profileId, scope);
  } catch (err) {
    console.error("[api:email:unsubscribe] db update failed", err);
    return redirect(request, "server", scope);
  }

  return redirect(request, "ok", scope);
}
