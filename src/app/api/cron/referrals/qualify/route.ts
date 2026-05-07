// Hourly cron — qualifies referrals + emits milestone unlocks.
//
// Schedule: hourly via vercel.json. Auth: CRON_SECRET via verifyCronAuth.
// Middleware bypasses /api/cron/* from Clerk so the bearer token sails
// through.
//
// Workflow per tick:
//
//   1. SELECT referrals JOIN profiles (on referred_profile_id) WHERE
//        signed_up_at < now() - 24h
//        AND qualified_at IS NULL
//        AND last_seen_at > signed_up_at + 24h          (came back)
//        AND NOT (fraud_flags && BLOCKING_FRAUD_FLAGS)  (not blocked)
//   2. For each candidate row:
//        a. UPDATE referrals SET qualified_at = now() WHERE id = ...
//           AND qualified_at IS NULL                 (idempotency guard)
//        b. UPDATE profiles SET referral_credits = referral_credits + 1
//           WHERE id = referrer  RETURNING referral_credits
//        c. evaluateMilestones(prev, new) → newlyReached[]
//        d. INSERT INTO referral_milestones (profileId, milestoneKey)
//           VALUES (...) ON CONFLICT DO NOTHING RETURNING ...
//        e. For each row INSERT actually returned: render + sendEmail
//        f. If new credit total >= 5 AND profiles.role = 'user' →
//           UPDATE profiles SET role = 'operator'.
//
// Idempotency guarantees:
//   - Step (a)'s "qualified_at IS NULL" guard means a duplicate cron run
//     skips already-qualified rows entirely (no double credit).
//   - Step (d)'s ON CONFLICT DO NOTHING means duplicate milestone inserts
//     don't trigger duplicate emails — only newly-inserted rows do.
//   - Email send failures DO NOT roll back the milestone insert. We log
//     the failure and rely on the user noticing the badge on their profile;
//     re-sending a milestone email is intentionally not retried (would
//     spam users on transient Resend hiccups).
//
// Returns:
//   { ok: true, qualified: <count>, milestones: { connector, operator, founder } }

import { NextRequest, NextResponse } from "next/server";
import { and, arrayOverlaps, eq, isNull, lt, sql } from "drizzle-orm";

import { verifyCronAuth } from "@/lib/api/auth";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import {
  referralMilestones,
  referrals,
  type ReferralMilestoneKey,
} from "@/lib/db/schema/referrals";
import { sendEmail } from "@/lib/email/send";
import { renderMilestoneEmail } from "@/lib/email/templates/referral-milestone";
import { BLOCKING_FRAUD_FLAGS } from "@/lib/referrals/fraud";
import { evaluateMilestones } from "@/lib/referrals/milestones";

// Force Node runtime — postgres-js + node:crypto interop relies on it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MilestoneCounts {
  connector: number;
  operator: number;
  founder: number;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const verdict = verifyCronAuth(req);
  if (verdict.kind !== "ok") {
    const status = verdict.kind === "not_configured" ? 503 : 401;
    return NextResponse.json({ ok: false, error: verdict.kind }, { status });
  }

  const start = Date.now();
  const milestoneCounts: MilestoneCounts = {
    connector: 0,
    operator: 0,
    founder: 0,
  };
  let qualifiedCount = 0;

  try {
    // 1. Find candidates. Single JOIN — referrals → profiles on
    //    referred_profile_id so we can check the referred user's
    //    last_seen_at against signed_up_at + 24h.
    const candidates = await db
      .select({
        referralId: referrals.id,
        referrerProfileId: referrals.referrerProfileId,
        signedUpAt: referrals.signedUpAt,
      })
      .from(referrals)
      .innerJoin(
        profiles,
        eq(referrals.referredProfileId, profiles.id),
      )
      .where(
        and(
          isNull(referrals.qualifiedAt),
          // signed_up_at must exist + be older than 24h
          lt(
            referrals.signedUpAt,
            sql`now() - interval '24 hours'`,
          ),
          // referred user came back at least 24h after signup
          sql`${profiles.lastSeenAt} > ${referrals.signedUpAt} + interval '24 hours'`,
          // no blocking fraud flag
          sql`NOT (${arrayOverlaps(
            referrals.fraudFlags,
            sql`ARRAY[${sql.join(
              BLOCKING_FRAUD_FLAGS.map((f) => sql`${f}`),
              sql`, `,
            )}]::text[]`,
          )})`,
        ),
      );

    // 2. Per-row processing. We do these sequentially: the row count is
    //    small (24h batch of organic signups) and a parallel loop adds
    //    contention on the same referrer's profile row when one user
    //    qualifies multiple invites in the same tick.
    for (const cand of candidates) {
      // 2a. Claim the referral row. The "qualified_at IS NULL" guard makes
      //     this idempotent under cron overlap — a second run sees the
      //     row already qualified and the UPDATE matches 0 rows.
      const claimed = await db
        .update(referrals)
        .set({ qualifiedAt: new Date() })
        .where(
          and(
            eq(referrals.id, cand.referralId),
            isNull(referrals.qualifiedAt),
          ),
        )
        .returning({ id: referrals.id });
      if (claimed.length === 0) continue; // raced — another worker won.

      // 2b. Increment the referrer's credit counter atomically. Read the
      //     PRIOR value via the simple "RETURNING new − 1" trick so the
      //     evaluator sees the right transition window.
      const updated = await db
        .update(profiles)
        .set({
          referralCredits: sql`${profiles.referralCredits} + 1`,
        })
        .where(eq(profiles.id, cand.referrerProfileId))
        .returning({
          credits: profiles.referralCredits,
          handle: profiles.handle,
          email: profiles.email,
          role: profiles.role,
        });

      if (updated.length === 0) {
        // Referrer profile vanished (deleted between cookie set + qualify).
        // Leave the qualified_at set — the credit can be reconciled by an
        // admin if needed.
        continue;
      }

      const newCredits = updated[0].credits;
      const prevCredits = newCredits - 1;
      qualifiedCount += 1;

      // 2c. Evaluate milestones for this transition.
      const evaluation = evaluateMilestones(prevCredits, newCredits);
      if (evaluation.newlyReached.length === 0) {
        continue; // no new badges — done with this row.
      }

      // 2d. Insert milestone rows. ON CONFLICT DO NOTHING is the dedup
      //     primitive — a previously-rewarded milestone won't re-email.
      const inserted = await db
        .insert(referralMilestones)
        .values(
          evaluation.newlyReached.map((key) => ({
            profileId: cand.referrerProfileId,
            milestoneKey: key,
          })),
        )
        .onConflictDoNothing({
          target: [
            referralMilestones.profileId,
            referralMilestones.milestoneKey,
          ],
        })
        .returning({
          milestoneKey: referralMilestones.milestoneKey,
        });

      // 2e. Email each newly-inserted milestone (best-effort).
      for (const row of inserted) {
        const key = row.milestoneKey as ReferralMilestoneKey;
        milestoneCounts[key] = (milestoneCounts[key] ?? 0) + 1;

        try {
          const rendered = renderMilestoneEmail({
            handle: updated[0].handle,
            profileId: cand.referrerProfileId,
            milestone: key,
            founderDiscordInvite:
              key === "founder"
                ? process.env.FOUNDER_DISCORD_INVITE
                : undefined,
          });
          await sendEmail({
            to: updated[0].email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
        } catch (err) {
          console.error(
            `[cron.referrals.qualify] milestone email failed for profile ${cand.referrerProfileId} (${key})`,
            err,
          );
        }
      }

      // 2f. One-shot role upgrade at the operator threshold. Skips users
      //     who are already 'admin' or 'founder' so we don't downgrade.
      if (newCredits >= 5 && updated[0].role === "user") {
        await db
          .update(profiles)
          .set({ role: "operator" })
          .where(
            and(
              eq(profiles.id, cand.referrerProfileId),
              eq(profiles.role, "user"),
            ),
          );
      }
    }

    return NextResponse.json({
      ok: true,
      qualified: qualifiedCount,
      milestones: milestoneCounts,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    console.error("[cron.referrals.qualify] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
        durationMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}

// Vercel fires GET; accept POST too for manual operator invocation (curl).
export const GET = handle;
export const POST = handle;
