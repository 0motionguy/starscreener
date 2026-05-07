// /api/referrals/me — caller's referral state (Chunk G).
//
// GET   → returns the caller's referral code, click/signup/qualified
//         counts, and the most-recent 10 anonymized referrals.
// PATCH → toggles `publicLeaderboardOptin` and/or sets/clears
//         `dismissedInviteBannerAt`.
//
// Auth: every handler funnels through `requireUser()`. Never mix with
// `verifyAdminSession()` or `verifyCronAuth()` (per HANDOFF §4).
//
// Error envelope: matches `/api/me/alert-rules` — `{ ok: true, ... }` or
// `{ ok: false, error, message }` so the UI can branch on `.ok`.
//
// Caching: every response is `private, no-store`. Counts move every
// minute under live referral activity; serving stale data confuses the
// "show me the live counter" promise on /you/refer.

import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { profiles, type Profile } from "@/lib/db/schema/profiles";
import {
  referralCodes,
  referrals,
} from "@/lib/db/schema/referrals";
import { deriveCode } from "@/lib/referrals/code";

// lint-allow: no-parsebody - PATCH body is Zod safeParsed here to preserve the route-specific error envelope.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ErrorBody {
  ok: false;
  error: string;
  message: string;
  details?: unknown;
}

function jsonError(
  status: number,
  error: string,
  message: string,
  details?: unknown,
): NextResponse<ErrorBody> {
  return NextResponse.json(
    { ok: false, error, message, ...(details ? { details } : {}) },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function jsonOk<T extends Record<string, unknown>>(data: T): NextResponse {
  return NextResponse.json(
    { ok: true, ...data },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * Anonymize a handle for the "recent referrals" rail. We only show the
 * first 3 chars + `***` so the referrer can recognise pacing without
 * exposing private signups (e.g. `michael` → `mic***`).
 */
function anonymizeHandle(handle: string): string {
  const trimmed = handle.trim();
  if (trimmed.length <= 3) return `${trimmed}***`;
  return `${trimmed.slice(0, 3)}***`;
}

/**
 * Look up the caller's referral code, or derive + insert one if the
 * webhook hasn't yet (idempotent — the unique-on-lower(code) index
 * collapses races to a single row).
 */
async function getOrCreateReferralCode(
  profile: Profile,
): Promise<string> {
  const existing = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.profileId, profile.id))
    .limit(1);
  if (existing.length > 0) return existing[0].code;

  const code = deriveCode(profile.handle, profile.id);
  await db
    .insert(referralCodes)
    .values({ profileId: profile.id, code })
    .onConflictDoNothing();

  // Re-read to handle the race where another path (Clerk webhook,
  // /api/referrals/intake) wrote a different code first.
  const after = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.profileId, profile.id))
    .limit(1);
  return after[0]?.code ?? code;
}

// ---------------------------------------------------------------------------
// GET — caller's referral counts + code + recent referrals
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const profile = user.profile;

  const code = await getOrCreateReferralCode(profile);

  // Three count queries in parallel — clicks (any row), signups
  // (signed_up_at not null), qualified (qualified_at not null).
  const [clicksRow, signupsRow, qualifiedRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(referrals)
      .where(eq(referrals.referrerProfileId, profile.id)),
    db
      .select({ n: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerProfileId, profile.id),
          isNotNull(referrals.signedUpAt),
        ),
      ),
    db
      .select({ n: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerProfileId, profile.id),
          isNotNull(referrals.qualifiedAt),
        ),
      ),
  ]);

  // Recent 10 — JOIN to `profiles` for the anonymized handle. Click-only
  // rows (referredProfileId IS NULL) have no joined profile and surface
  // as anonymous "visitor" entries.
  const recent = await db
    .select({
      id: referrals.id,
      signedUpAt: referrals.signedUpAt,
      qualifiedAt: referrals.qualifiedAt,
      clickedAt: referrals.clickedAt,
      handle: profiles.handle,
    })
    .from(referrals)
    .leftJoin(profiles, eq(profiles.id, referrals.referredProfileId))
    .where(eq(referrals.referrerProfileId, profile.id))
    .orderBy(
      desc(referrals.qualifiedAt),
      desc(referrals.signedUpAt),
      desc(referrals.clickedAt),
    )
    .limit(10);

  const recentReferrals = recent.map((r) => ({
    id: r.id,
    handle: r.handle ? anonymizeHandle(r.handle) : null,
    status: r.qualifiedAt
      ? ("qualified" as const)
      : r.signedUpAt
        ? ("signed_up" as const)
        : ("clicked" as const),
    timestamp: (
      r.qualifiedAt ?? r.signedUpAt ?? r.clickedAt
    ).toISOString(),
  }));

  return jsonOk({
    code,
    counts: {
      clicks: Number(clicksRow[0]?.n ?? 0),
      signups: Number(signupsRow[0]?.n ?? 0),
      qualified: Number(qualifiedRow[0]?.n ?? 0),
    },
    recentReferrals,
    profile: {
      handle: profile.handle,
      publicLeaderboardOptin: profile.publicLeaderboardOptin,
      dismissedInviteBannerAt: profile.dismissedInviteBannerAt
        ? profile.dismissedInviteBannerAt.toISOString()
        : null,
      referralCredits: profile.referralCredits,
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH — preference toggles
// ---------------------------------------------------------------------------

const patchBodySchema = z
  .object({
    publicLeaderboardOptin: z.boolean().optional(),
    // String → null = clear, ISO timestamp = set, undefined = leave alone.
    dismissedInviteBannerAt: z
      .union([z.string().datetime(), z.null()])
      .optional(),
  })
  .strict();

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "request body is not valid JSON");
  }

  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      "validation",
      "request body failed validation",
      parsed.error.issues,
    );
  }
  const data = parsed.data;

  // No-op early — saves a DB roundtrip when the UI accidentally PATCHes
  // with an empty body (e.g. a "save preferences" button rendered before
  // the user toggled anything).
  if (
    data.publicLeaderboardOptin === undefined &&
    data.dismissedInviteBannerAt === undefined
  ) {
    return jsonOk({
      profile: {
        handle: user.profile.handle,
        publicLeaderboardOptin: user.profile.publicLeaderboardOptin,
        dismissedInviteBannerAt: user.profile.dismissedInviteBannerAt
          ? user.profile.dismissedInviteBannerAt.toISOString()
          : null,
      },
    });
  }

  const updates: Partial<typeof profiles.$inferInsert> = {};
  if (data.publicLeaderboardOptin !== undefined) {
    updates.publicLeaderboardOptin = data.publicLeaderboardOptin;
  }
  if (data.dismissedInviteBannerAt !== undefined) {
    updates.dismissedInviteBannerAt =
      data.dismissedInviteBannerAt === null
        ? null
        : new Date(data.dismissedInviteBannerAt);
  }

  const updated = await db
    .update(profiles)
    .set(updates)
    .where(eq(profiles.id, user.profile.id))
    .returning();

  if (updated.length === 0) {
    return jsonError(500, "update_failed", "profile update returned no rows");
  }

  const row = updated[0];
  return jsonOk({
    profile: {
      handle: row.handle,
      publicLeaderboardOptin: row.publicLeaderboardOptin,
      dismissedInviteBannerAt: row.dismissedInviteBannerAt
        ? row.dismissedInviteBannerAt.toISOString()
        : null,
    },
  });
}
