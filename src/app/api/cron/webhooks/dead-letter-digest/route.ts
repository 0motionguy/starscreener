// GET /api/cron/webhooks/dead-letter-digest
//
// Daily digest for end-user webhook deliveries that exhausted the retry
// budget and moved to webhook-dead-letter.jsonl.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import { authFailureResponse, verifyCronAuth } from "@/lib/api/auth";
import { withBodySizeLimit } from "@/lib/api-helpers";
import { serverError } from "@/lib/api/error-response";
import { withHealthcheck } from "@/lib/healthcheck";
import { notify, type NotifyResult } from "@/lib/notify";
import { deadLetterLocation } from "@/lib/webhooks/publish";
import type {
  WebhookDelivery,
  WebhookEvent,
  WebhookProvider,
} from "@/lib/webhooks/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOOKBACK_HOURS = 24;
const MAX_SAMPLES = 5;
const CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type DeadLetterRow = WebhookDelivery & {
  finalizedAt?: string;
};

interface DigestResult {
  recent: number;
  total: number;
  byEvent: Partial<Record<WebhookEvent, number>>;
  byTarget: Record<string, number>;
  samples: Array<{
    event: WebhookEvent;
    target: string;
    attempts: number;
    lastError: string | null;
  }>;
}

interface DigestResponse extends DigestResult {
  ok: true;
  notify?: NotifyResult;
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

function isWebhookProvider(value: unknown): value is WebhookProvider {
  return value === "slack" || value === "discord";
}

function isWebhookEvent(value: unknown): value is WebhookEvent {
  return value === "breakout" || value === "funding" || value === "revenue";
}

function parseDeadLetterRow(value: unknown): DeadLetterRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<DeadLetterRow>;
  if (typeof row.id !== "string") return null;
  if (typeof row.dedupKey !== "string") return null;
  if (typeof row.targetId !== "string") return null;
  if (!isWebhookProvider(row.provider)) return null;
  if (!isWebhookEvent(row.event)) return null;
  if (typeof row.createdAt !== "string") return null;
  if (typeof row.attempts !== "number" || !Number.isFinite(row.attempts)) return null;
  return row as DeadLetterRow;
}

async function readDeadLetterRows(): Promise<DeadLetterRow[]> {
  let raw: string;
  try {
    raw = await fs.readFile(deadLetterLocation(), "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const rows: DeadLetterRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = parseDeadLetterRow(JSON.parse(line));
      if (row) rows.push(row);
    } catch {
      console.warn("[webhooks:dead-letter-digest] skipping malformed dead-letter line");
    }
  }
  return rows;
}

function timestampMs(row: DeadLetterRow): number | null {
  const raw = row.deadLetteredAt ?? row.finalizedAt ?? row.createdAt;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function targetKey(row: DeadLetterRow): string {
  return `${row.provider}:${row.targetId}`;
}

function buildDigest(rows: DeadLetterRow[], now = Date.now()): DigestResult {
  const cutoff = now - LOOKBACK_HOURS * 60 * 60 * 1000;
  const recentRows = rows.filter((row) => {
    const ts = timestampMs(row);
    return ts !== null && ts >= cutoff;
  });

  const byEvent: Partial<Record<WebhookEvent, number>> = {};
  const byTarget: Record<string, number> = {};
  for (const row of recentRows) {
    byEvent[row.event] = (byEvent[row.event] ?? 0) + 1;
    const key = targetKey(row);
    byTarget[key] = (byTarget[key] ?? 0) + 1;
  }

  const samples = recentRows.slice(0, MAX_SAMPLES).map((row) => ({
    event: row.event,
    target: targetKey(row),
    attempts: row.attempts,
    lastError: row.lastError ? row.lastError.slice(0, 120) : null,
  }));

  return {
    recent: recentRows.length,
    total: rows.length,
    byEvent,
    byTarget,
    samples,
  };
}

function formatCountLines(counts: Record<string, number>): string {
  const lines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `* \`${name}\`: ${count}`);
  return lines.length > 0 ? lines.join("\n") : "* none";
}

function formatSampleLines(samples: DigestResult["samples"]): string {
  if (samples.length === 0) return "* none";
  return samples
    .map((sample) => {
      const err = sample.lastError ? ` - ${sample.lastError}` : "";
      return `* \`${sample.event}\` -> \`${sample.target}\` (${sample.attempts} attempts)${err}`;
    })
    .join("\n");
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const deny = authFailureResponse(verifyCronAuth(request));
  if (deny) return deny;

  const oversize = withBodySizeLimit(request);
  if (oversize) return oversize;

  try {
    const rows = await readDeadLetterRows();
    const digest = buildDigest(rows);
    let notifyResult: NotifyResult | undefined;

    if (digest.recent > 0) {
      notifyResult = await notify({
        severity: "ops",
        audience: "customer",
        source: "webhook.dead-letter.digest",
        title: `${digest.recent} end-user webhook delivery failures (24h)`,
        message: [
          `*${digest.recent}* end-user webhook deliveries failed in the last 24h.`,
          `Total dead-letter rows: *${digest.total}*.`,
          "",
          "*By target:*",
          formatCountLines(digest.byTarget),
          "",
          "*By event:*",
          formatCountLines(digest.byEvent as Record<string, number>),
          "",
          `*Sample failures (${digest.samples.length}):*`,
          formatSampleLines(digest.samples),
          "",
          "_Source: webhook-dead-letter.jsonl. Target IDs are shown; webhook URLs are intentionally omitted._",
        ].join("\n"),
        context: {
          recentCount: digest.recent,
          totalRows: digest.total,
          byTarget: digest.byTarget,
          byEvent: digest.byEvent,
          sampleCount: digest.samples.length,
        },
        idempotencyKey: `dead-letter-digest:${new Date().toISOString().slice(0, 10)}`,
      });
    }

    const body: DigestResponse = {
      ok: true,
      ...digest,
      ...(notifyResult ? { notify: notifyResult } : {}),
    };
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (err) {
    return serverError(err, {
      scope: "[api:cron:webhooks:dead-letter-digest]",
      publicMessage: "dead letter digest failed",
      code: "DEAD_LETTER_DIGEST_FAILED",
    });
  }
}

const handler = withHealthcheck("webhooks-dead-letter-digest", handle);

export const GET = handler;
