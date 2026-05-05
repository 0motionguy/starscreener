import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistPipeline, pipeline } from "@/lib/pipeline/pipeline";
import {
  DEFAULT_ALERT_SUGGESTIONS,
  validateRule,
  type CreateRuleInput,
} from "@/lib/pipeline/alerts/rule-management";
import type { AlertRule, AlertTriggerType } from "@/lib/pipeline/types";
import { userAuthFailureResponse, verifyUserAuth } from "@/lib/api/auth";
import { parseBody } from "@/lib/api/parse-body";
import { serverError } from "@/lib/api/error-response";

export const runtime = "nodejs";

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

const CreateRuleSchema = z.object({
  trigger: z.enum(VALID_TRIGGERS),
  threshold: z.number().finite(),
  repoId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  cooldownMinutes: z.number().finite().optional(),
  enabled: z.boolean().optional(),
});

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
  ok: true;
}
export interface RulesErrorResponse {
  ok: false;
  error: string;
  details?: string[];
  code?: string;
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<RulesListResponse | RulesErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<RulesErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  try {
    await pipeline.ensureReady();
    return NextResponse.json({
      ok: true,
      rules: pipeline.listAlertRules(auth.userId),
      suggestions: DEFAULT_ALERT_SUGGESTIONS,
    });
  } catch (err) {
    return serverError<RulesErrorResponse>(err, {
      scope: "[pipeline/alerts/rules]",
      publicMessage: "server error",
    });
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<RulesCreateResponse | RulesErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<RulesErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const parsed = await parseBody(request, CreateRuleSchema, {
    publicMessage: `trigger must be one of: ${VALID_TRIGGERS.join(", ")}`,
  });
  if (!parsed.ok) return parsed.response as NextResponse<RulesErrorResponse>;

  try {
    await pipeline.ensureReady();
    // parsed.data is the Zod-validated shape; categoryId comes back as string|null
    // but CreateRuleInput.categoryId is the branded PipelineCategoryId. The Zod
    // schema is the source of truth for runtime validation; cast to satisfy the
    // structural type without re-running validation.
    const input: Omit<CreateRuleInput, "userId"> =
      parsed.data as unknown as Omit<CreateRuleInput, "userId">;
    const rule = pipeline.createAlertRule({ ...input, userId: auth.userId });
    await persistPipeline();
    const validation = validateRule(rule);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: "rule failed validation", details: validation.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("invalid rule")) {
      return NextResponse.json(
        { ok: false, error: "invalid rule" },
        { status: 400 },
      );
    }
    return serverError<RulesErrorResponse>(err, {
      scope: "[pipeline/alerts/rules]",
      publicMessage: "server error",
    });
  }
}

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<RulesDeleteResponse | RulesErrorResponse>> {
  const auth = verifyUserAuth(request);
  const deny = userAuthFailureResponse(auth);
  if (deny) return deny as NextResponse<RulesErrorResponse>;
  if (auth.kind !== "ok") {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id || id.length === 0) {
    return NextResponse.json(
      { ok: false, error: "id query parameter is required" },
      { status: 400 },
    );
  }
  try {
    await pipeline.ensureReady();
    const owned = pipeline.listAlertRules(auth.userId).some((r) => r.id === id);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "rule not found" }, { status: 404 });
    }
    const ok = pipeline.deleteAlertRule(id);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "rule not found" }, { status: 404 });
    }
    await persistPipeline();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError<RulesErrorResponse>(err, {
      scope: "[pipeline/alerts/rules]",
      publicMessage: "server error",
    });
  }
}
