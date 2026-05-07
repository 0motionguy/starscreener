// /api/me/alert-rules/[id] — single-rule mutations (Chunk D).
//
// PATCH  → toggle `active`, change `cadence`, edit `ruleConfig`, swap
//          quiet hours, update name. Re-validates `ruleConfig` via the
//          same Zod discriminated union the create route uses.
// DELETE → hard delete. The `alert_rules` table has no `deleted_at`
//          column, so we delete the row outright; the FKs on
//          `alert_events.rule_id` and `alert_delivery_log.rule_id`
//          cascade-drop their dependent rows.
//
// Ownership: every query is scoped to the caller's `profileId`. A user
// trying to mutate someone else's rule sees a 404 (not 403) so the
// existence of the rule isn't leaked.

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { alertRules, type AlertRule } from "@/lib/db/schema/alerts";
import { patchAlertRuleSchema } from "@/lib/api/alert-rules/schemas";

// lint-allow: no-parsebody - PATCH body is Zod safeParsed here to preserve the route-specific error envelope.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Strip the bcrypt/scrypt hash before returning to the client.
function stripHashedSecret(
  rule: AlertRule,
): Omit<AlertRule, "webhookSecretHash"> & { hasWebhookSecret: boolean } {
  const { webhookSecretHash, ...rest } = rule;
  return { ...rest, hasWebhookSecret: Boolean(webhookSecretHash) };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// PATCH — update fields (with re-validation of ruleConfig)
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!id) {
    return jsonError(400, "missing_id", "rule id is required");
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "request body is not valid JSON");
  }

  const parsed = patchAlertRuleSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      "validation",
      "request body failed validation",
      parsed.error.issues,
    );
  }
  const data = parsed.data;

  // Confirm ownership BEFORE mutating — return 404 if rule belongs to
  // another user (prevents existence leak).
  const owned = await db
    .select({ id: alertRules.id, ruleType: alertRules.ruleType })
    .from(alertRules)
    .where(
      and(eq(alertRules.id, id), eq(alertRules.profileId, user.profile.id)),
    )
    .limit(1);
  if (owned.length === 0) {
    return jsonError(404, "not_found", "rule not found");
  }

  // If `ruleConfig` is included, ensure its discriminator matches the
  // existing rule type — we don't allow changing rule_type via PATCH
  // (that would invalidate dispatcher / event-router invariants).
  if (data.ruleConfig && data.ruleConfig.ruleType !== owned[0].ruleType) {
    return jsonError(
      400,
      "validation",
      "ruleConfig.ruleType cannot change from the original rule_type",
    );
  }

  // Build update set — Drizzle ignores `undefined` keys but null is a
  // meaningful "clear" signal, so we forward it explicitly.
  const updateSet: Partial<AlertRule> = { updatedAt: new Date() };
  if (data.name !== undefined) updateSet.name = data.name;
  if (data.active !== undefined) updateSet.active = data.active;
  if (data.cadence !== undefined) updateSet.cadence = data.cadence;
  if (data.ruleConfig !== undefined) updateSet.ruleConfig = data.ruleConfig;
  if (data.quietHours !== undefined) updateSet.quietHours = data.quietHours;
  if (data.webhookUrl !== undefined) updateSet.webhookUrl = data.webhookUrl;

  const updated = await db
    .update(alertRules)
    .set(updateSet)
    .where(
      and(eq(alertRules.id, id), eq(alertRules.profileId, user.profile.id)),
    )
    .returning();

  if (updated.length === 0) {
    return jsonError(404, "not_found", "rule not found");
  }
  return jsonOk({ rule: stripHashedSecret(updated[0]) });
}

// ---------------------------------------------------------------------------
// DELETE — hard delete (FK cascades drop dependent events)
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const user = await requireUser();
  const { id } = await ctx.params;
  if (!id) {
    return jsonError(400, "missing_id", "rule id is required");
  }

  const removed = await db
    .delete(alertRules)
    .where(
      and(eq(alertRules.id, id), eq(alertRules.profileId, user.profile.id)),
    )
    .returning({ id: alertRules.id });

  if (removed.length === 0) {
    return jsonError(404, "not_found", "rule not found");
  }
  return jsonOk({ deleted: removed[0].id });
}
