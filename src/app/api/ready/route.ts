// GET /api/ready — operator readiness for the auth + revenue path.
//
// Admin-gated (verifyAdminAuth). Returns a REDACTED status — presence/family
// flags and ledger COUNTS only, never secret values, emails, or Stripe ids.
// Complements /api/healthz (cheap liveness) and /api/health (data freshness);
// this one answers "can we take money and auth users right now?".
//
//   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://trendingrepo.com/api/ready

import { NextRequest, NextResponse } from "next/server";

import { adminAuthFailureResponse, verifyAdminAuth } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function present(name: string): "ok" | "missing" {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? "ok" : "missing";
}

/** Clerk key family, without revealing the keys. */
function clerkKeyFamily(): "live" | "test" | "mixed" | "missing" {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  const pkFam = pk.startsWith("pk_live_") ? "live" : pk.startsWith("pk_test_") ? "test" : null;
  const skFam = sk.startsWith("sk_live_") ? "live" : sk.startsWith("sk_test_") ? "test" : null;
  if (!pkFam || !skFam) return "missing";
  return pkFam === skFam ? pkFam : "mixed";
}

interface DatabaseReadiness {
  configured: boolean;
  reachable?: boolean;
  failed_webhook_events?: number;
  stuck_webhook_events?: number;
  last_success_event_at?: string | null;
}

async function databaseReadiness(): Promise<DatabaseReadiness> {
  if (present("DATABASE_URL") !== "ok") return { configured: false };
  try {
    const [{ getDb }, { stripeWebhookEvents }, { and, count, eq, lt, sql }] =
      await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/db/schema/stripe-webhook-events"),
        import("drizzle-orm"),
      ]);
    const db = getDb();
    const now = new Date();

    const [failed] = await db
      .select({ n: count() })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.status, "failed"));
    const [stuck] = await db
      .select({ n: count() })
      .from(stripeWebhookEvents)
      .where(
        and(
          eq(stripeWebhookEvents.status, "processing"),
          lt(stripeWebhookEvents.leaseExpiresAt, now),
        ),
      );
    const [last] = await db
      .select({ at: sql<Date | null>`max(${stripeWebhookEvents.succeededAt})` })
      .from(stripeWebhookEvents);

    return {
      configured: true,
      reachable: true,
      failed_webhook_events: failed?.n ?? 0,
      stuck_webhook_events: stuck?.n ?? 0,
      last_success_event_at: last?.at ? new Date(last.at).toISOString() : null,
    };
  } catch {
    // Table missing (migrations not applied) or DB unreachable.
    return { configured: true, reachable: false };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deny = adminAuthFailureResponse(verifyAdminAuth(request));
  if (deny) return deny;

  const auth = {
    clerk_key_family: clerkKeyFamily(),
    clerk_webhook_secret: present("CLERK_WEBHOOK_SIGNING_SECRET"),
    session_secret: present("SESSION_SECRET"),
  };
  const billing = {
    stripe_secret: present("STRIPE_SECRET_KEY"),
    stripe_webhook_secret: present("STRIPE_WEBHOOK_SECRET"),
    pro_price_ids:
      present("STRIPE_PRO_MONTHLY_PRICE_ID") === "ok" &&
      present("STRIPE_PRO_YEARLY_PRICE_ID") === "ok"
        ? "ok"
        : "missing",
  };
  const database = await databaseReadiness();

  return NextResponse.json(
    { ok: true, auth, billing, database },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
