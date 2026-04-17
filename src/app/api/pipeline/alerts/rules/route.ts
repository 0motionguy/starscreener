// GET    /api/pipeline/alerts/rules?userId=local   — list AlertRules
// POST   /api/pipeline/alerts/rules                 — create an AlertRule
// DELETE /api/pipeline/alerts/rules?id=<ruleId>     — delete an AlertRule
//
// Rules drive the recompute-time alert engine. Each user owns their own
// set of rules; the MVP defaults to the single-user "local" account when
// no userId is supplied.

import { NextRequest, NextResponse } from "next/server";
import { pipeline } from "@/lib/pipeline/pipeline";
import {
  DEFAULT_ALERT_SUGGESTIONS,
  validateRule,
  type CreateRuleInput,
} from "@/lib/pipeline/alerts/rule-management";
import type { AlertRule, AlertTriggerType } from "@/lib/pipeline/types";

const DEFAULT_USER_ID = "local";

const VALID_TRIGGERS: readonly AlertTriggerType[] = [
  "star_spike",
  "new_release",
  "rank_jump",
  "discussion_spike",
  "momentum_threshold",
  "breakout_detected",
  "daily_digest",
  "weekly_digest",
] as const;
const TRIGGER_SET = new Set<AlertTriggerType>(VALID_TRIGGERS);

export interface RulesListResponse {
  ok: true;
  rules: AlertRule[];
  suggestions: typeof DEFAULT_ALERT_SUGGESTIONS;
}

export interface RulesCreateResponse {
  ok: true;
  rule: AlertRule;
}

export interface RulesDeleteResponse {
  ok: boolean;
}

export interface RulesErrorResponse {
  ok: false;
  error: string;
  details?: string[];
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<RulesListResponse | RulesErrorResponse>> {
  try {
    await pipeline.ensureReady();
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId") ?? DEFAULT_USER_ID;
    const rules = pipeline.listAlertRules(userId);
    return NextResponse.json({
      ok: true,
      rules,
      suggestions: DEFAULT_ALERT_SUGGESTIONS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

interface ParsedCreateBody {
  input: CreateRuleInput;
}

function parseCreateBody(
  raw: unknown,
):
  | { ok: true; value: ParsedCreateBody }
  | { ok: false; error: string; details?: string[] } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const trigger = body.trigger;
  if (typeof trigger !== "string" || !TRIGGER_SET.has(trigger as AlertTriggerType)) {
    return {
      ok: false,
      error: `trigger must be one of: ${VALID_TRIGGERS.join(", ")}`,
    };
  }

  const threshold = body.threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return { ok: false, error: "threshold must be a finite number" };
  }

  const userId =
    typeof body.userId === "string" && body.userId.length > 0
      ? body.userId
      : DEFAULT_USER_ID;

  const repoId =
    body.repoId === undefined || body.repoId === null
      ? null
      : typeof body.repoId === "string"
        ? body.repoId
        : undefined;
  if (repoId === undefined) {
    return { ok: false, error: "repoId must be a string or null" };
  }

  const categoryId =
    body.categoryId === undefined || body.categoryId === null
      ? null
      : typeof body.categoryId === "string"
        ? (body.categoryId as CreateRuleInput["categoryId"])
        : undefined;
  if (categoryId === undefined) {
    return { ok: false, error: "categoryId must be a string or null" };
  }

  const cooldownMinutes =
    body.cooldownMinutes === undefined
      ? undefined
      : typeof body.cooldownMinutes === "number" &&
          Number.isFinite(body.cooldownMinutes)
        ? body.cooldownMinutes
        : null;
  if (cooldownMinutes === null) {
    return { ok: false, error: "cooldownMinutes must be a finite number" };
  }

  const enabled =
    body.enabled === undefined ? undefined : Boolean(body.enabled);

  const input: CreateRuleInput = {
    userId,
    trigger: trigger as AlertTriggerType,
    threshold,
    repoId,
    categoryId,
    cooldownMinutes,
    enabled,
  };

  return { ok: true, value: { input } };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<RulesCreateResponse | RulesErrorResponse>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = parseCreateBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, details: parsed.details },
      { status: 400 },
    );
  }

  try {
    await pipeline.ensureReady();
    const rule = pipeline.createAlertRule(parsed.value.input);
    // Defense-in-depth: re-validate the constructed rule before returning.
    const validation = validateRule(rule);
    if (!validation.valid) {
      return NextResponse.json(
        {
          ok: false,
          error: "rule failed validation",
          details: validation.errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // validateRule failures inside the facade surface as Error messages.
    // Treat them as 400s so API consumers can correct their input.
    if (message.includes("invalid rule")) {
      return NextResponse.json(
        { ok: false, error: message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<RulesDeleteResponse | RulesErrorResponse>> {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id || id.length === 0) {
    return NextResponse.json(
      { ok: false, error: "id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    await pipeline.ensureReady();
    const ok = pipeline.deleteAlertRule(id);
    return NextResponse.json({ ok });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
