// Admin moderation endpoint for referrals — list flagged rows + approve/reject.
//
// GET  — return rows with non-empty fraud_flags that haven't been admin-rejected
//        yet. Most recent first. Joined to the referrer + referred profile so
//        the UI can show handles + email domains without a second query.
// POST — { action: "approve" | "reject", id: uuid }
//
//   Approve  · clear fraud_flags
//            · if qualified_at IS NULL, set it to now() AND increment
//              profiles.referral_credits for the referrer
//            · run evaluateMilestones(prevCredits, newCredits) and INSERT new
//              rows into referral_milestones with ON CONFLICT DO NOTHING
//            · do NOT send emails — the qualify cron owns that gate
//   Reject   · append 'admin_rejected' to fraud_flags
//            · if rewarded_at IS NOT NULL (rare — qualify cron raced ahead),
//              decrement profiles.referral_credits, NULL qualified_at + rewarded_at
//
// Auth: verifyAdminAuth — accepts the ss_admin cookie OR a server-side
// ADMIN_TOKEN bearer (same canonical wrapper used by every other /api/admin/*
// route on the project).
//
// Atomicity: Approve runs inside db.transaction so credits + qualified_at +
// milestone rows land together or not at all.

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";
import { errorEnvelope, serverError } from "@/lib/api/error-response";
import { parseBody } from "@/lib/api/parse-body";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import {
  referralMilestones,
  referrals,
  type Referral,
} from "@/lib/db/schema/referrals";
import { evaluateMilestones } from "@/lib/referrals/milestones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

const ActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  id: z.string().uuid("id must be a UUID"),
});

export interface AdminReferralRow {
  id: string;
  referrerProfileId: string;
  referrerHandle: string | null;
  referredProfileId: string | null;
  referredHandle: string | null;
  referredEmail: string | null;
  referralCode: string;
  clickedAt: string;
  signedUpAt: string | null;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  ipHash: string | null;
  fraudFlags: string[];
  createdAt: string;
}

interface AdminListResponse {
  ok: true;
  referrals: AdminReferralRow[];
}

interface AdminMutateResponse {
  ok: true;
  referral: AdminReferralRow;
}

type AdminErrorResponse = ReturnType<typeof errorEnvelope>;

// ---------------------------------------------------------------------------
// Row mapper — one Referral + joined profiles → wire shape with ISO strings.
// ---------------------------------------------------------------------------

interface JoinedRow {
  referral: Referral;
  referrerHandle: string | null;
  referredHandle: string | null;
  referredEmail: string | null;
}

function toAdminRow(row: JoinedRow): AdminReferralRow {
  const r = row.referral;
  return {
    id: r.id,
    referrerProfileId: r.referrerProfileId,
    referrerHandle: row.referrerHandle,
    referredProfileId: r.referredProfileId,
    referredHandle: row.referredHandle,
    referredEmail: row.referredEmail,
    referralCode: r.referralCode,
    clickedAt: r.clickedAt.toISOString(),
    signedUpAt: r.signedUpAt ? r.signedUpAt.toISOString() : null,
    qualifiedAt: r.qualifiedAt ? r.qualifiedAt.toISOString() : null,
    rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
    ipHash: r.ipHash,
    fraudFlags: r.fraudFlags,
    createdAt: r.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Queue selector — fraud_flags non-empty AND not yet admin-rejected.
// ---------------------------------------------------------------------------

const referrer = profiles;
// Drizzle aliasing — re-using `profiles` twice in a single SELECT JOIN
// requires `alias()` to disambiguate. We do the second JOIN with raw SQL
// in the select projection to keep the query shape readable instead.

async function selectQueue(limit: number): Promise<AdminReferralRow[]> {
  // We avoid drizzle's alias() helper here in favour of two left-joins via
  // SQL fragments in the projection — keeps the imports minimal and the
  // query readable. The `referrals.referred_profile_id` can be null at
  // click-time, so we LEFT JOIN both sides.
  const rows = await db
    .select({
      referral: referrals,
      referrerHandle: referrer.handle,
      referredHandle: sql<
        string | null
      >`(SELECT handle FROM profiles WHERE id = ${referrals.referredProfileId})`,
      referredEmail: sql<
        string | null
      >`(SELECT email FROM profiles WHERE id = ${referrals.referredProfileId})`,
    })
    .from(referrals)
    .leftJoin(referrer, eq(referrer.id, referrals.referrerProfileId))
    .where(
      and(
        // fraud_flags IS NOT NULL AND array_length(fraud_flags, 1) > 0
        sql`array_length(${referrals.fraudFlags}, 1) > 0`,
        // NOT (fraud_flags && ARRAY['admin_rejected']::text[])
        sql`NOT (${referrals.fraudFlags} && ARRAY['admin_rejected']::text[])`,
      ),
    )
    .orderBy(desc(referrals.createdAt))
    .limit(limit);

  return rows.map((row) => toAdminRow(row as JoinedRow));
}

async function selectOne(id: string): Promise<AdminReferralRow | null> {
  const rows = await db
    .select({
      referral: referrals,
      referrerHandle: referrer.handle,
      referredHandle: sql<
        string | null
      >`(SELECT handle FROM profiles WHERE id = ${referrals.referredProfileId})`,
      referredEmail: sql<
        string | null
      >`(SELECT email FROM profiles WHERE id = ${referrals.referredProfileId})`,
    })
    .from(referrals)
    .leftJoin(referrer, eq(referrer.id, referrals.referrerProfileId))
    .where(eq(referrals.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return toAdminRow(rows[0] as JoinedRow);
}

// ---------------------------------------------------------------------------
// GET — paginated queue.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<AdminListResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;

  try {
    const url = new URL(request.url);
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500
        ? limitRaw
        : 100;
    const list = await selectQueue(limit);
    return NextResponse.json({ ok: true, referrals: list });
  } catch (err) {
    return serverError<AdminErrorResponse>(err, {
      scope: "[admin/referrals:GET]",
    });
  }
}

// ---------------------------------------------------------------------------
// POST — approve or reject a single row.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AdminMutateResponse | AdminErrorResponse>> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny as NextResponse<AdminErrorResponse>;

  const parsed = await parseBody(request, ActionSchema);
  if (!parsed.ok) return parsed.response as NextResponse<AdminErrorResponse>;

  const { action, id } = parsed.data;

  try {
    // Snapshot the row outside the transaction so we can 404 cleanly
    // before consuming a connection slot for write work.
    const before = await db
      .select()
      .from(referrals)
      .where(eq(referrals.id, id))
      .limit(1);
    if (before.length === 0) {
      return NextResponse.json(errorEnvelope("referral not found"), {
        status: 404,
      });
    }
    const current = before[0];

    if (action === "approve") {
      await db.transaction(async (tx) => {
        // 1. Clear fraud_flags + (idempotently) set qualified_at if null.
        const updated = await tx
          .update(referrals)
          .set({
            fraudFlags: sql`ARRAY[]::text[]`,
            qualifiedAt:
              current.qualifiedAt === null ? new Date() : current.qualifiedAt,
          })
          .where(eq(referrals.id, id))
          .returning();
        if (updated.length === 0) return;

        // 2. If this approval newly qualifies the row, increment the
        //    referrer's credit counter and evaluate milestones.
        const newlyQualified = current.qualifiedAt === null;
        if (!newlyQualified) return;

        const incremented = await tx
          .update(profiles)
          .set({
            referralCredits: sql`${profiles.referralCredits} + 1`,
          })
          .where(eq(profiles.id, current.referrerProfileId))
          .returning({
            id: profiles.id,
            credits: profiles.referralCredits,
          });
        if (incremented.length === 0) return;
        const newCredits = incremented[0].credits;
        const prevCredits = newCredits - 1;

        // 3. INSERT any newly-reached milestones — ON CONFLICT DO NOTHING
        //    keeps this idempotent if the qualify cron raced ahead.
        const evaluation = evaluateMilestones(prevCredits, newCredits);
        if (evaluation.newlyReached.length > 0) {
          await tx
            .insert(referralMilestones)
            .values(
              evaluation.newlyReached.map((key) => ({
                profileId: current.referrerProfileId,
                milestoneKey: key,
              })),
            )
            .onConflictDoNothing();
        }
      });
    } else {
      // Reject — append 'admin_rejected'. If the qualify cron already
      // rewarded the referral (rare), reverse the credit + null out the
      // qualified/rewarded timestamps.
      await db.transaction(async (tx) => {
        await tx
          .update(referrals)
          .set({
            // array_append is idempotent in our case because the queue
            // selector excludes rows that already carry 'admin_rejected'.
            fraudFlags: sql`array_append(${referrals.fraudFlags}, 'admin_rejected')`,
            ...(current.rewardedAt !== null
              ? { qualifiedAt: null, rewardedAt: null }
              : {}),
          })
          .where(eq(referrals.id, id));

        if (current.rewardedAt !== null) {
          // Floor at zero — defensive against double-reject of an already
          // adjusted row.
          await tx
            .update(profiles)
            .set({
              referralCredits: sql`GREATEST(${profiles.referralCredits} - 1, 0)`,
            })
            .where(
              and(
                eq(profiles.id, current.referrerProfileId),
                isNotNull(profiles.id),
              ),
            );
        }
      });
    }

    const after = await selectOne(id);
    if (!after) {
      // Should never happen post-write, but stay honest with the client.
      return NextResponse.json(errorEnvelope("referral not found"), {
        status: 404,
      });
    }
    return NextResponse.json({ ok: true, referral: after });
  } catch (err) {
    return serverError<AdminErrorResponse>(err, {
      scope: "[admin/referrals:POST]",
    });
  }
}
