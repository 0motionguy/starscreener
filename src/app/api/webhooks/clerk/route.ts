// Clerk webhook handler — keeps the local `profiles` table in sync with
// Clerk's identity service. Subscribed events (configure in Clerk → Webhooks):
//
//   user.created  →  insert profile row + reserve handle
//   user.updated  →  refresh email, displayName, avatarUrl
//   user.deleted  →  soft-delete (set deleted_at)
//
// Svix HMAC verification is mandatory — without it any caller can spoof
// `user.created` events and create fake profiles. See
// https://clerk.com/docs/integrations/webhooks/sync-data
//
// Idempotency: `user.created` upserts on `clerk_user_id` (unique), so a
// retried delivery is a no-op rather than a duplicate row. Same for
// `user.updated` — it always SELECT-then-UPDATE, never INSERT.

import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";

import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { referralCodes, referrals } from "@/lib/db/schema/referrals";
import { reserveHandleFromClerk } from "@/lib/auth/handle";
import { errorEnvelope } from "@/lib/api/error-response";
import { deriveCode } from "@/lib/referrals/code";
import { verifyRefCookie } from "@/lib/referrals/cookie";
import {
  BLOCKING_FRAUD_FLAGS,
  computeFraudFlags,
  hashReferralIp,
} from "@/lib/referrals/fraud";

// lint-allow: no-parsebody - Clerk/Svix webhook needs raw text() for HMAC signature verification.
// Force Node runtime — svix uses Node crypto, not the Edge subset.
export const runtime = "nodejs";
// Webhooks are pure I/O, never cached.
export const dynamic = "force-dynamic";

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserPayload {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  primary_email_address_id: string | null;
  email_addresses: ClerkEmailAddress[];
  /**
   * Set by the client at sign-up time via
   * `useSignUp().setUnsafeMetadata({ trRef: { code, urlHash } })`.
   * Forwarded verbatim by Clerk in the `user.created` webhook.
   */
  unsafe_metadata?: {
    trRef?: {
      code: string;
      urlHash?: string;
    } | null;
  } | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

function pickPrimaryEmail(payload: ClerkUserPayload): string | null {
  const primary = payload.email_addresses.find(
    (e) => e.id === payload.primary_email_address_id,
  );
  return primary?.email_address ?? payload.email_addresses[0]?.email_address ?? null;
}

function pickDisplayName(payload: ClerkUserPayload): string | null {
  const both = [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim();
  return both || payload.first_name || payload.username || null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET not set");
    return NextResponse.json(
      errorEnvelope("webhook_not_configured"),
      { status: 503 },
    );
  }

  // Svix headers — Clerk forwards these from its event delivery system.
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      errorEnvelope("missing_svix_headers"),
      { status: 400 },
    );
  }

  // Body must be the raw string for HMAC verification — request.text()
  // is the only safe path. Don't pre-parse JSON.
  const body = await req.text();
  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.warn("[clerk-webhook] signature verification failed", err);
    return NextResponse.json(errorEnvelope("invalid_signature"), { status: 401 });
  }

  try {
    switch (event.type) {
      case "user.created":
        await handleUserCreated(event.data, req);
        break;
      case "user.updated":
        await handleUserUpdated(event.data);
        break;
      case "user.deleted":
        await handleUserDeleted(event.data);
        break;
      default:
        // Ignore other event types — we'd rather Clerk continue
        // delivering them than 500 and trigger Svix retries.
        return NextResponse.json({ ok: true, ignored: event.type });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[clerk-webhook] handler error", event.type, err);
    return NextResponse.json(errorEnvelope("handler_failed"), { status: 500 });
  }
}

async function handleUserCreated(
  data: ClerkUserPayload,
  req: NextRequest,
): Promise<void> {
  const email = pickPrimaryEmail(data);
  if (!email) {
    // Refuse to insert a profile without an email — every downstream
    // feature (alerts, referrals, milestones) needs one.
    throw new Error(`user.created has no email: ${data.id}`);
  }

  // Build a Clerk-shaped object that `reserveHandleFromClerk` accepts.
  // The helper only reads username/firstName/lastName/email — not the
  // full Clerk SDK type — so a duck-typed payload works.
  const handle = await reserveHandleFromClerk({
    id: data.id,
    username: data.username,
    firstName: data.first_name,
    lastName: data.last_name,
    primaryEmailAddressId: data.primary_email_address_id,
    emailAddresses: data.email_addresses.map((e) => ({
      id: e.id,
      emailAddress: e.email_address,
    })),
  } as Parameters<typeof reserveHandleFromClerk>[0]);

  const upserted = await db
    .insert(profiles)
    .values({
      clerkUserId: data.id,
      handle,
      email,
      displayName: pickDisplayName(data),
      avatarUrl: data.image_url ?? null,
    })
    .onConflictDoUpdate({
      target: profiles.clerkUserId,
      set: {
        email,
        displayName: pickDisplayName(data),
        avatarUrl: data.image_url ?? null,
      },
    })
    .returning({ id: profiles.id, handle: profiles.handle });

  const insertedProfile = upserted[0];
  if (!insertedProfile) {
    // Should be unreachable — the upsert above always returns the row.
    console.error("[clerk-webhook] user.created upsert returned no row", data.id);
    return;
  }

  // ---------------------------------------------------------------------
  // Referral attribution. Best-effort: never throw out of this block,
  // because attribution failure must not block account creation.
  // ---------------------------------------------------------------------
  try {
    await attributeReferral({
      data,
      req,
      newProfileId: insertedProfile.id,
      newProfileHandle: insertedProfile.handle,
      newProfileEmail: email,
    });
  } catch (err) {
    console.warn("[clerk-webhook] referral attribution failed", data.id, err);
  }
}

interface AttributeReferralInput {
  data: ClerkUserPayload;
  req: NextRequest;
  newProfileId: string;
  newProfileHandle: string;
  newProfileEmail: string;
}

async function attributeReferral(input: AttributeReferralInput): Promise<void> {
  const { data, req, newProfileId, newProfileHandle, newProfileEmail } = input;

  // 1. Resolve the referrer profile id from (in order):
  //      a. unsafeMetadata.trRef.code (set by ClerkRefHandoff at sign-up)
  //      b. tr_ref cookie (signed, set by middleware on first-touch ?ref=)
  const trRef = data.unsafe_metadata?.trRef ?? null;
  let referralCodeUsed: string | null = null;
  let firstLandingUrl: string | null = null;
  let referrerProfileId: string | null = null;

  if (trRef?.code) {
    const found = await db
      .select({ profileId: referralCodes.profileId })
      .from(referralCodes)
      .where(sql`lower(${referralCodes.code}) = lower(${trRef.code})`)
      .limit(1);
    if (found[0]) {
      referrerProfileId = found[0].profileId;
      referralCodeUsed = trRef.code;
      firstLandingUrl = trRef.urlHash ?? null;
    }
  }

  if (!referrerProfileId) {
    const cookieValue = req.cookies.get("tr_ref")?.value;
    const verified = await verifyRefCookie(cookieValue);
    if (verified?.code) {
      const found = await db
        .select({ profileId: referralCodes.profileId })
        .from(referralCodes)
        .where(sql`lower(${referralCodes.code}) = lower(${verified.code})`)
        .limit(1);
      if (found[0]) {
        referrerProfileId = found[0].profileId;
        referralCodeUsed = verified.code;
        firstLandingUrl = verified.url ?? null;
      }
    }
  }

  // 2. If we have a valid referrer (and it's not the new user themselves),
  //    compute fraud flags and insert the referrals row unless blocked.
  if (referrerProfileId && referrerProfileId !== newProfileId) {
    const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipHash = hashReferralIp(ipRaw);

    const fraudFlags = await computeFraudFlags(db, {
      referrerProfileId,
      referredClerkUserId: data.id,
      referredEmail: newProfileEmail,
      referredIp: ipRaw,
    });

    const blocked = BLOCKING_FRAUD_FLAGS.some((flag) =>
      fraudFlags.includes(flag),
    );

    if (!blocked && referralCodeUsed) {
      await db.insert(referrals).values({
        referrerProfileId,
        referredProfileId: newProfileId,
        referralCode: referralCodeUsed,
        signedUpAt: new Date(),
        firstLandingUrl,
        userAgent: req.headers.get("user-agent") ?? null,
        ipHash,
        fraudFlags,
      });
    }
  }

  // 3. Always create a `referral_codes` row for the new user so they can
  //    refer immediately. Idempotent via the (profile_id) unique index.
  const code = deriveCode(newProfileHandle, newProfileId);
  await db
    .insert(referralCodes)
    .values({ profileId: newProfileId, code })
    .onConflictDoNothing();
}

async function handleUserUpdated(data: ClerkUserPayload): Promise<void> {
  const email = pickPrimaryEmail(data);
  if (!email) {
    console.warn("[clerk-webhook] user.updated missing email — skipping email sync", data.id);
  }

  await db
    .update(profiles)
    .set({
      ...(email ? { email } : {}),
      displayName: pickDisplayName(data),
      avatarUrl: data.image_url ?? null,
    })
    .where(eq(profiles.clerkUserId, data.id));
}

async function handleUserDeleted(data: ClerkUserPayload): Promise<void> {
  // Soft delete — keeps referral attribution intact even after the
  // referred user removes their account, but they no longer receive
  // emails (lazy-create won't pull a deleted row back into circulation
  // because the unique key still exists).
  await db
    .update(profiles)
    .set({ deletedAt: new Date() })
    .where(eq(profiles.clerkUserId, data.id));
}
