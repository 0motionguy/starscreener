// Cron route — day-7 retention email.
//
// Runs daily. Finds profiles whose createdAt is in the [now-7.5d, now-6.5d]
// window AND who are still active (not soft-deleted, emailSystem=true).
// Sends a generic "what surged this week" digest with up to 3 top-breakout
// names (sourced from getDerivedRepos snapshot).
//
// Unlike the day-3 nudge, this is unconditional — every profile in the
// week-1 window gets the retention touch regardless of their activation
// state. The intent is to remind every fresh user that breakouts are
// happening with or without them, and offer a low-friction CTA back.
//
// First-deploy safety: same DAY7_RETENTION_NOT_BEFORE env-var gate as
// the day-3 nudge.

import { and, gte, isNull, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/auth";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { errorEnvelope } from "@/lib/api/error-response";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema/profiles";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getEmailProvider, resolveEmailFrom } from "@/lib/email/send";
import { renderDay7RetentionEmail } from "@/lib/email/templates/day7-retention";

// lint-allow: no-parsebody - no-body cron endpoint; verifyCronAuth is the trust boundary.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENTION_WINDOW_BACK_DAYS_HIGH = 7.5;
const RETENTION_WINDOW_BACK_DAYS_LOW = 6.5;
const TOP_N = 3;

interface RetentionOk {
  ok: true;
  durationMs: number;
  eligible: number;
  sent: number;
  errors: Array<{ profileId: string; error: string }>;
  topRepos: string[];
  dryRun: boolean;
}

interface RetentionErr {
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
  const raw = process.env.DAY7_RETENTION_NOT_BEFORE;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

function pickTopBreakouts(): string[] {
  try {
    const repos = getDerivedRepos();
    return repos
      .filter((r) => r.movementStatus === "breakout")
      .sort((a, b) => (b.momentumScore ?? 0) - (a.momentumScore ?? 0))
      .slice(0, TOP_N)
      .map((r) => r.fullName);
  } catch {
    return [];
  }
}

async function handle(
  req: NextRequest,
): Promise<NextResponse<RetentionOk | RetentionErr>> {
  const verdict = verifyCronAuth(req);
  if (verdict.kind !== "ok") {
    const status = verdict.kind === "not_configured" ? 503 : 401;
    return NextResponse.json(errorEnvelope(verdict.kind), {
      status,
    }) as NextResponse<RetentionErr>;
  }
  const oversize = withBodySizeLimit(req);
  if (oversize) return oversize as NextResponse<RetentionErr>;

  const url = new URL(req.url);
  const dryRun = parseDryRun(url);
  const start = Date.now();

  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const lowerMs = nowMs - RETENTION_WINDOW_BACK_DAYS_HIGH * dayMs;
  const upperMs = nowMs - RETENTION_WINDOW_BACK_DAYS_LOW * dayMs;
  const lower = new Date(lowerMs);
  const upper = new Date(upperMs);
  const notBefore = notBeforeFromEnv();
  const topBreakouts = pickTopBreakouts();

  try {
    const candidates = await db
      .select({
        id: profiles.id,
        handle: profiles.handle,
        email: profiles.email,
        displayName: profiles.displayName,
        emailSystem: profiles.emailSystem,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(
        and(
          gte(profiles.createdAt, lower),
          lt(profiles.createdAt, upper),
          isNull(profiles.deletedAt),
        ),
      );

    const eligibleCandidates = candidates
      .filter((c) => c.emailSystem)
      .filter((c) =>
        notBefore ? c.createdAt.getTime() >= notBefore.getTime() : true,
      );

    const provider = getEmailProvider();
    const from = resolveEmailFrom();
    const errors: Array<{ profileId: string; error: string }> = [];
    let sent = 0;

    for (const profile of eligibleCandidates) {
      try {
        if (dryRun) {
          sent += 1;
          continue;
        }
        const rendered = renderDay7RetentionEmail({
          handle: profile.handle,
          profileId: profile.id,
          firstName: profile.displayName,
          topBreakoutNames: topBreakouts,
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
      topRepos: topBreakouts,
      dryRun,
    });
  } catch (err) {
    console.error("[cron.onboarding.day7-retention] error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
