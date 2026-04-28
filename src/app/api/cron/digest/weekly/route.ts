// POST /api/cron/digest/weekly
//
// Builds a per-user weekly digest from:
//   1. The caller's own fired AlertEvents in the last 7 days.
//   2. The top breakouts platform-wide in the last 7 days (shared).
//
// Sends each digest via the pluggable email provider from
// `src/lib/email/send.ts` — Resend when `RESEND_API_KEY` is set,
// ConsoleProvider otherwise (so local dev never hits the network).
//
// Gate:
//   - `DIGEST_ENABLED` env: if unset or "false", the endpoint returns
//     `{ ok: true, skipped: "disabled" }` without touching anything.
//     Ops must explicitly opt in.
//   - `CRON_SECRET` via `verifyCronAuth` (same pattern as every other
//     cron route — see src/lib/api/auth.ts).
//   - `?dryRun=true` query flag forces rendering only; no provider.send
//     call is made even when the provider is configured.
//
// User → email mapping:
//   StarScreener today does NOT persist email addresses. `userId` is
//   derived from an email HMAC, so the server cannot recover the email
//   from a rule. Until that changes, operators can provide a JSON map
//   in `DIGEST_USER_EMAILS_JSON` (format `{ "<userId>": "<email>" }`);
//   users without an entry are skipped and counted. Once a user→email
//   table lands, the lookup here should switch to that table and the
//   env map becomes a test-only override.
//
// Response shape:
//   { ok: true, skipped?, attempted, sent, skippedUsers, errors: [...],
//     durationMs, dryRun }

import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import {
  buildWeeklyDigests,
  loadUserEmailMapFromEnv,
  collectAlertsByUser,
  type DigestUserEmailMap,
} from "@/lib/pipeline/alerts/weekly-digest";
import { pipeline } from "@/lib/pipeline/pipeline";
import {
  alertEventStore,
  alertRuleStore,
} from "@/lib/pipeline/storage/singleton";
import { getDerivedRepos } from "@/lib/derived-repos";
import { getEmailProvider, resolveEmailFrom } from "@/lib/email/send";
import { renderDigestEmail } from "@/lib/email/render-digest";

export const runtime = "nodejs";

const POST_CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function isEnabled(): boolean {
  const raw = process.env.DIGEST_ENABLED;
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseDryRun(url: URL): boolean {
  const raw = url.searchParams.get("dryRun");
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

interface DigestCronResponse {
  ok: true;
  skipped?: "disabled";
  attempted: number;
  sent: number;
  skippedUsers: number;
  errors: Array<{ userId: string; error: string }>;
  dryRun: boolean;
  durationMs: number;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<DigestCronResponse | { ok: false; error: string }>> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny as NextResponse<{ ok: false; error: string }>;

  if (!isEnabled()) {
    return NextResponse.json(
      {
        ok: true,
        skipped: "disabled",
        attempted: 0,
        sent: 0,
        skippedUsers: 0,
        errors: [],
        dryRun: false,
        durationMs: 0,
      },
      { headers: POST_CACHE_HEADERS },
    );
  }

  const startedAt = Date.now();
  const url = new URL(request.url);
  const dryRun = parseDryRun(url);

  try {
    await pipeline.ensureReady();

    // 1. Collect per-user alerts (last 7d) and the set of userIds with rules.
    const allRules = alertRuleStore.listAll();
    const activeUserIds = new Set<string>();
    for (const rule of allRules) {
      if (rule.enabled) activeUserIds.add(rule.userId);
    }

    const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const alertsByUser = collectAlertsByUser(
      activeUserIds,
      alertEventStore,
      cutoffMs,
    );

    // 2. Build platform-wide top breakouts (shared across users). Use the
    //    derived-repos surface — same list the terminal UI renders from.
    //    Defensive: if the derived data isn't ready yet, we fall back to an
    //    empty list so the digest still builds (empty-breakout branch).
    let repos: ReturnType<typeof getDerivedRepos> = [];
    try {
      repos = getDerivedRepos();
    } catch (err) {
      console.warn("[api:cron:digest:weekly] getDerivedRepos failed", err);
      repos = [];
    }
    const { digests, skippedUsers } = buildWeeklyDigests({
      activeUserIds,
      alertsByUser,
      repos,
      userEmails: loadUserEmailMapFromEnv(),
      generatedAt: new Date().toISOString(),
    });

    // 3. Render + send.
    const provider = getEmailProvider();
    const from = resolveEmailFrom();
    const errors: Array<{ userId: string; error: string }> = [];
    let sent = 0;

    for (const digest of digests) {
      const rendered = renderDigestEmail(digest);
      if (dryRun) {
        // Dry run: never call provider.send. We still count this as
        // "attempted" so operators can see the template + lookup path
        // worked even without burning an email quota.
        continue;
      }
      const result = await provider.send({
        to: digest.userEmail,
        from,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      if (result.ok) {
        sent += 1;
      } else {
        errors.push({ userId: digest.userId, error: result.error });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        attempted: digests.length,
        sent: dryRun ? 0 : sent,
        skippedUsers,
        errors,
        dryRun,
        durationMs: Date.now() - startedAt,
      },
      { headers: POST_CACHE_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api:cron:digest:weekly] failed", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: POST_CACHE_HEADERS },
    );
  }
}

// GET alias for Vercel Cron (which fires GET). Vercel injects the same
// Authorization: Bearer header, so the auth pipeline is identical.
export async function GET(request: NextRequest) {
  return POST(request);
}

// The env-map loader + DigestUserEmailMap type used to be re-exported here
// for tests. Next 15 rejects non-HTTP-verb exports on route files, so tests
// now import them directly from `@/lib/pipeline/alerts/weekly-digest`.
