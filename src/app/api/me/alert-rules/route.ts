// /api/me/alert-rules — Watchlist alert rule CRUD (Chunk D).
//
// GET  → caller's rules, paginated by createdAt desc.
// POST → create a new rule. Enforces the 25-active-rule cap; generates +
//        bcrypt-hashes a `whsec_...` plaintext secret when `webhookUrl` is
//        provided, returning the plaintext ONCE in the response body so
//        the caller can copy it for HMAC signing on receive.
//
// Auth: every handler funnels through `requireUser()` from
// `src/lib/auth/server.ts`. Never mix with `verifyAdminSession` or
// `verifyCronAuth`.
//
// Error envelope: matches `src/app/api/admin/scan-log/route.ts`:
//   success → { ok: true, ...data }
//   failure → { ok: false, error: '<code>', message: '<human>' }
//
// Webhook secret hashing note: `bcrypt`/`bcryptjs` is not in deps, so we
// use Node's built-in `crypto.scrypt` (16-byte random salt prepended to
// the 64-byte hash, hex-encoded). Verification cost is comparable to
// bcrypt cost-10 (~100ms) and avoids a new package.

import { and, count, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, scryptSync } from "node:crypto";

import { requireUser } from "@/lib/auth/server";
import { parseBody } from "@/lib/api/parse-body";
import { db } from "@/lib/db/client";
import {
  alertRules,
  type AlertRule,
} from "@/lib/db/schema/alerts";
import {
  createAlertRuleSchema,
} from "@/lib/api/alert-rules/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ACTIVE_RULES_PER_USER = 25;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

// scrypt parameters — N=2^14 (16384) keeps cost ~100ms on modern hardware,
// matches bcrypt cost-10. r=8, p=1 are the defaults in node's crypto API.
const SCRYPT_N = 1 << 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const SCRYPT_SALT_LEN = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function jsonOk<T extends Record<string, unknown>>(
  data: T,
  init: { status?: number } = {},
): NextResponse {
  return NextResponse.json(
    { ok: true, ...data },
    {
      status: init.status ?? 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

/**
 * Generate a webhook secret in the format `whsec_<64 hex chars>` (32
 * random bytes hex-encoded). The plaintext is returned ONCE to the
 * caller; only the scrypt hash is persisted.
 */
function generateWebhookSecret(): { plaintext: string; storedHash: string } {
  const plaintext = `whsec_${randomBytes(32).toString("hex")}`;
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = scryptSync(plaintext, salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  // Storage layout: <salt-hex>:<hash-hex> — same column the dispatcher
  // reads to (eventually) verify on rotate.
  const storedHash = `${salt.toString("hex")}:${derived.toString("hex")}`;
  return { plaintext, storedHash };
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, n);
}

function parseOffset(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

// ---------------------------------------------------------------------------
// GET — list caller's rules
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(alertRules)
      .where(eq(alertRules.profileId, user.profile.id))
      .orderBy(desc(alertRules.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(alertRules)
      .where(eq(alertRules.profileId, user.profile.id)),
  ]);

  return jsonOk({
    rules: rows.map(stripHashedSecret),
    total: Number(totalRow[0]?.n ?? 0),
    limit,
    offset,
  });
}

// ---------------------------------------------------------------------------
// POST — create rule (with cap + webhook secret)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();

  const parsed = await parseBody(req, createAlertRuleSchema, {
    publicMessage: "request body failed validation",
  });
  if (!parsed.ok) {
    const body = (await parsed.response.json()) as {
      error?: string;
      details?: unknown;
    };
    const invalidJson = body.error === "request body is not valid JSON";
    return invalidJson
      ? jsonError(400, "invalid_json", "request body is not valid JSON")
      : jsonError(
          400,
          "validation",
          "request body failed validation",
          body.details,
        );
  }
  const data = parsed.data;

  // Cross-field check — ruleType on the row must match ruleType in config.
  if (data.ruleType !== data.ruleConfig.ruleType) {
    return jsonError(
      400,
      "validation",
      "ruleType mismatch between top-level and ruleConfig",
    );
  }

  // 25-active-rule cap.
  const activeRows = await db
    .select({ n: count() })
    .from(alertRules)
    .where(
      and(
        eq(alertRules.profileId, user.profile.id),
        eq(alertRules.active, true),
      ),
    );
  const activeCount = Number(activeRows[0]?.n ?? 0);
  if (activeCount >= MAX_ACTIVE_RULES_PER_USER) {
    return jsonError(
      429,
      "rule_cap_exceeded",
      `Max ${MAX_ACTIVE_RULES_PER_USER} active rules per user`,
    );
  }

  // Webhook secret generation — only if user supplied a webhook URL.
  let webhookSecretPlaintext: string | null = null;
  let webhookSecretHash: string | null = null;
  if (data.webhookUrl) {
    const generated = generateWebhookSecret();
    webhookSecretPlaintext = generated.plaintext;
    webhookSecretHash = generated.storedHash;
  }

  const inserted = await db
    .insert(alertRules)
    .values({
      profileId: user.profile.id,
      watchlistId: data.watchlistId ?? null,
      name: data.name,
      ruleType: data.ruleType,
      ruleConfig: data.ruleConfig,
      cadence: data.cadence,
      webhookUrl: data.webhookUrl ?? null,
      webhookSecretHash,
      quietHours: data.quietHours ?? null,
      active: true,
    })
    .returning();

  if (inserted.length === 0) {
    return jsonError(500, "insert_failed", "rule insert returned no rows");
  }

  // Plaintext secret is shown ONCE. After this response is delivered the
  // caller cannot retrieve it again — they must rotate to get a new one.
  return jsonOk(
    {
      rule: stripHashedSecret(inserted[0]),
      ...(webhookSecretPlaintext
        ? { webhookSecret: webhookSecretPlaintext }
        : {}),
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// Response shaping — never expose the stored secret hash to the client
// ---------------------------------------------------------------------------

function stripHashedSecret(rule: AlertRule): Omit<AlertRule, "webhookSecretHash"> & {
  hasWebhookSecret: boolean;
} {
  const { webhookSecretHash, ...rest } = rule;
  return { ...rest, hasWebhookSecret: Boolean(webhookSecretHash) };
}
