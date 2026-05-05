// POST /api/feedback — in-app bug-report / feedback widget intake.
//
// AGN-845: ships the floating "Send feedback" widget. Submissions are
// validated with Zod, rate-limited per IP, forwarded to Sentry's user
// feedback channel when SENTRY_DSN is wired, and always logged to the
// server console as a structured `[feedback]` line so submissions are
// captured regardless of Sentry availability.
//
// This is intentionally an unauthenticated endpoint — anonymous bug
// reports are explicitly in scope per the spec (free text + optional
// email + auto-captured page URL).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { parseBody } from "@/lib/api/parse-body";
import { checkRateLimitAsync } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

// 5 submissions per minute per IP. Enough for a user fixing a typo on a
// resubmit; tight enough that scripted abuse hits the wall fast.
const FEEDBACK_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 5,
};

const FeedbackPostSchema = z.object({
  // bug | feature | other — radio group on the widget. Optional so older
  // / scripted callers (e.g. Sentry's own feedback button) keep working
  // without sending a category.
  type: z.enum(["bug", "feature", "other"]).optional(),
  message: z
    .string()
    .trim()
    .min(3, "message must be at least 3 characters")
    .max(4000, "message must be at most 4000 characters"),
  email: z
    .union([z.string().trim().email("email is not a valid address"), z.literal("")])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  pageUrl: z
    .string()
    .trim()
    .max(2000, "pageUrl must be at most 2000 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  userAgent: z
    .string()
    .trim()
    .max(500, "userAgent must be at most 500 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export interface FeedbackPostResponse {
  ok: true;
  forwarded: "sentry" | "log-only";
}

export interface FeedbackErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<FeedbackPostResponse | FeedbackErrorResponse>> {
  const rl = await checkRateLimitAsync(request, FEEDBACK_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate limit exceeded", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  const parsed = await parseBody(request, FeedbackPostSchema);
  if (!parsed.ok) return parsed.response as NextResponse<FeedbackErrorResponse>;
  const { type, message, email, pageUrl, userAgent } = parsed.data;

  // Always log to stdout in a structured form so the submission is captured
  // even when Sentry is unconfigured (local dev, preview deploys without DSN).
  // Avoid logging the email at info level — emit it under a separate field so
  // log scrubbers can drop it if needed.
  console.log(
    "[feedback]",
    JSON.stringify({
      type: type ?? null,
      message,
      email: email ?? null,
      pageUrl: pageUrl ?? null,
      userAgent: userAgent ?? request.headers.get("user-agent") ?? null,
      receivedAt: new Date().toISOString(),
    }),
  );

  let forwarded: FeedbackPostResponse["forwarded"] = "log-only";
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/nextjs");
      // Prepend the category to the message body so triagers can filter
      // bug vs feature vs other in the Sentry feedback queue without a
      // schema change on Sentry's side.
      const messageWithType = type ? `[${type}] ${message}` : message;
      Sentry.captureFeedback({
        message: messageWithType,
        email,
        url: pageUrl,
        // Sentry's `name` is the reporter's display name. We don't collect
        // one — leaving it undefined keeps the SDK from sending a literal
        // "anonymous" string.
      });
      forwarded = "sentry";
    } catch (err) {
      // Never let Sentry transport failures fail the user submission — the
      // console log above is the durable record.
      console.error("[feedback] sentry forward failed", err);
    }
  }

  return NextResponse.json({ ok: true, forwarded });
}
