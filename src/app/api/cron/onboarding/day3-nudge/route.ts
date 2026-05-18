// Cron route — day-3 onboarding nudge.
//
// Runs daily. Finds profiles whose createdAt is in the [now-3.5d, now-2.5d]
// window AND who haven't created any alert rule yet (count = 0 on
// alertRules.profileId). Sends the day-3 nudge email via Resend.
//
// Why a window not a single day: cron schedule is daily so a single
// "exactly 3 days ago" cutoff would miss any user whose 3-day mark
// happened to fall between two runs. The 24h-wide window catches every
// user within the typical drift.
//
// First-deploy safety: a DAY3_NUDGE_NOT_BEFORE env var (ISO timestamp,
// optional) lets the operator gate the first activation — without it the
// cron would fire to every profile in the [now-3.5d, now-2.5d] window
// the moment it goes live, including users from before the welcome
// email existed.
//
// Auth: CRON_SECRET via verifyCronAuth. Same trust boundary as every
// other cron route.
//
// Response shape:
//   200 { ok: true, durationMs, eligible, sent, errors: [...] }

import { and, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { errorEnvelope } from "@/lib/api/error-response";
import { db } from "@/lib/db/client";
import { alertRules } from "@/lib/db/schema/alerts";
import { profiles } from "@/lib/db/schema/profiles";
import { getEmailProvider, resolveEmailFrom } from "@/lib/email/send";
import { renderDay3NudgeEmail } from "@/lib/email/templates/day3-nudge";

// lint-allow: no-parsebody - no-body cron endpoint; verifyCronAuth is the trust boundary.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUDGE_WINDOW_BACK_DAYS_HIGH = 3.5;
const NUDGE_WINDOW_BACK_DAYS_LOW = 2.5;

interface NudgeOk {
  ok: true;
  durationMs: number;
  eligible: number;
  sent: number;
  errors: Array<{ profileId: string; error: string }>;
  dryRun: boolean;
}

interface NudgeErr {
  ok: false;
  error: string;
}

function parseDryRun(url: URL): boolean {
  const raw = url.searchParams.get("dry");
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function notBeforeFromEnv(): Date | null {
  const raw = process.env.DAY3_NUDGE_NOT_BEFORE;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

async function handle(
  req: NextRequest,
): Promise<NextResponse<NudgeOk | NudgeErr>> {
  const verdict = verifyCronAuth(req);
  if (verdict.kind !== "ok") {
    const status = verdict.kind === "not_configured" ? 503 : 401;
    return NextResponse.json(errorEnvelope(verdict.kind), {
      status,
    }) as NextResponse<NudgeErr>;
  }
  const oversize = withBodySizeLimit(req);
  if (oversize) return oversize as NextResponse<NudgeErr>;

  const url = new URL(req.url);
  const dryRun = parseDryRun(url);
  const start = Date.now();

  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const lowerMs = nowMs - NUDGE_WINDOW_BACK_DAYS_HIGH * dayMs;
  const upperMs = nowMs - NUDGE_WINDOW_BACK_DAYS_LOW * dayMs;
  const lower = new Date(lowerMs);
  const upper = new Date(upperMs);
  const notBefore = notBeforeFromEnv();

  try {
    // 1. Find candidate profiles in the day-3 window who are still active.
    const candidates = await db
      .select({
        id: profiles.id,
        handle: profiles.handle,
        email: profiles.email,
        displayName: profiles.displayName,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(
        and(
          gte(profiles.createdAt, lower),
          lt(profiles.createdAt, upper),
          isNull(profiles.deletedAt),
          eq(profiles.emailSystem, true),
        ),
      );

    // First-deploy short-circuit: skip users created before NOT_BEFORE so
    // the cron doesn't spam old users on first activation.
    const eligibleCandidates = notBefore
      ? candidates.filter((c) => c.createdAt.getTime() >= notBefore.getTime())
      : candidates;

    // 2. For each candidate, check if they have any alert rules. We do
    //    this in a small loop rather than a NOT EXISTS subquery to keep
    //    the SQL portable across the codebase's Drizzle usage; the
    //    expected candidate count is small (low double-digits/day).
    const provider = getEmailProvider();
    const from = resolveEmailFrom();
    const errors: Array<{ profileId: string; error: string }> = [];
    let sent = 0;

    for (const profile of eligibleCandidates) {
      try {
        const ruleCountRows = await db
          .select({ n: count() })
          .from(alertRules)
          .where(eq(alertRules.profileId, profile.id));
        const ruleCount = Number(ruleCountRows[0]?.n ?? 0);
        if (ruleCount > 0) continue;

        if (dryRun) {
          // Count as "would-send" but don't burn provider quota.
          sent += 1;
          continue;
        }

        const rendered = renderDay3NudgeEmail({
          handle: profile.handle,
          profileId: profile.id,
          firstName: profile.displayName,
        });
        const result = await provider.send({
          to: profile.email,
          from,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
        if (result.ok) {
          sent += 1;
        } else {
          errors.push({ profileId: profile.id, error: result.error });
        }
      } catch (err) {
        errors.push({
          profileId: profile.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - start,
      eligible: eligibleCandidates.length,
      sent,
      errors,
      dryRun,
    });
  } catch (err) {
    console.error("[cron.onboarding.day3-nudge] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}

// Silence unused import lint (kept for future SQL-side filtering refactor).
void sql;

export const GET = handle;
export const POST = handle;
