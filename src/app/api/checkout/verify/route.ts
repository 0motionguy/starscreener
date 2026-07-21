// GET /api/checkout/verify?session_id=cs_... — authenticated, OWNER-VERIFIED
// checkout confirmation for the CheckoutSuccess surface.
//
// The success redirect lands the buyer on /pricing?checkout=success&session_id=
// with a session id in the URL. That id is UNTRUSTED — anyone can paste one.
// This route requires a live Clerk principal and proves the Checkout Session
// actually belongs to them (client_reference_id / metadata.userId ===
// c_<clerkUserId>) before reporting any paid state. It never trusts the URL
// session id alone.
//
// States (body.state):
//   confirming    — session exists + owned, not yet complete (keep polling)
//   active        — tier is projected (the webhook landed) → celebrate
//   delayed       — session complete but tier not projected yet (webhook lag)
//   failed        — session missing / unpaid / expired
//   wrong_account — session belongs to a different principal
//
// Returns:
//   200 { ok: true, state, tier? }
//   400 { ok: false, code: "BAD_REQUEST" }   — missing/!cs_ session id
//   401 { ok: false, code: "UNAUTHORIZED" }   — no live Clerk principal
//   503 { ok: false, code: ... }              — account/Stripe not configured

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getOptionalUser, type LoadedUser } from "@/lib/auth/server";
import { clerkDerivedUserId } from "@/lib/auth/user-id";
import { getStripeClient } from "@/lib/stripe/client";
import { getTierForClerkUser } from "@/lib/pricing/tier-resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CheckoutVerifyState =
  | "confirming"
  | "active"
  | "delayed"
  | "failed"
  | "wrong_account";

interface VerifyOk {
  ok: true;
  state: CheckoutVerifyState;
  tier?: string;
}
interface VerifyError {
  ok: false;
  error: string;
  code: string;
}

function json(body: VerifyOk | VerifyError, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json(
      { ok: false, error: "missing or invalid session_id", code: "BAD_REQUEST" },
      400,
    );
  }

  // Live Clerk principal required — a paid confirmation must never render for
  // an anonymous viewer holding a pasted session id.
  let loaded: LoadedUser | null;
  try {
    loaded = await getOptionalUser();
  } catch {
    return json(
      { ok: false, error: "account service unavailable — please retry", code: "ACCOUNT_STORE_UNAVAILABLE" },
      503,
    );
  }
  if (!loaded) {
    return json({ ok: false, error: "sign in required", code: "UNAUTHORIZED" }, 401);
  }
  const entitlementKey = clerkDerivedUserId(loaded.clerkUserId);

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return json(
      { ok: false, error: "checkout not configured (missing STRIPE_SECRET_KEY)", code: "NOT_CONFIGURED" },
      503,
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    // Unknown / malformed session id → treat as failed (never leak details).
    return json({ ok: true, state: "failed" });
  }

  // OWNERSHIP — the session must belong to the current principal. Checkout
  // pins both client_reference_id and metadata.userId to c_<clerkUserId>.
  const owner =
    (typeof session.client_reference_id === "string" && session.client_reference_id) ||
    (typeof session.metadata?.userId === "string" && session.metadata.userId) ||
    null;
  if (owner !== entitlementKey) {
    return json({ ok: true, state: "wrong_account" });
  }

  // Payment / session status.
  if (session.status === "expired" || session.payment_status === "unpaid") {
    return json({ ok: true, state: "failed" });
  }

  // Has the webhook projected the entitlement yet?
  const tier = await getTierForClerkUser(loaded.clerkUserId, loaded.profile.email);
  if (tier !== "free") {
    return json({ ok: true, state: "active", tier });
  }

  // Session complete but tier not projected yet → the webhook is catching up.
  if (session.status === "complete") {
    return json({ ok: true, state: "delayed" });
  }
  return json({ ok: true, state: "confirming" });
}
