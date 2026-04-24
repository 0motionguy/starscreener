// Webhook publisher — target loader + enqueue API.
//
// This module is the operator-facing surface:
//
//   publishBreakoutToWebhooks(repo)  — enqueue a row per configured target
//   publishFundingEvent(event)        — same for funding signals
//   publishRevenueEvent(overlay)      — same for revenue overlays (phase-2)
//
// It NEVER makes HTTP calls. Writes a dedup-keyed row to
// `.data/webhook-queue.jsonl`. The drain cron at
// /api/cron/webhooks/flush picks rows up, formats per provider, and POSTs.
//
// Target config lives in `data/webhook-targets.json` (mtime-cached).
// Missing file or empty list → every publish* call becomes a no-op,
// which is the default-safe posture for an operator who hasn't wired a
// Slack/Discord URL yet.

import { promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  currentDataDir,
  withFileLock,
} from "../pipeline/storage/file-persistence";
import type {
  WebhookBreakoutRepo,
  WebhookDelivery,
  WebhookEvent,
  WebhookFilters,
  WebhookFundingEvent,
  WebhookProvider,
  WebhookTarget,
} from "./types";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const QUEUE_FILENAME = "webhook-queue.jsonl";
const DEAD_LETTER_FILENAME = "webhook-dead-letter.jsonl";

export function queueLocation(): string {
  return path.join(currentDataDir(), QUEUE_FILENAME);
}

export function deadLetterLocation(): string {
  return path.join(currentDataDir(), DEAD_LETTER_FILENAME);
}

/**
 * Target-config file path. Defaults to <repo>/data/webhook-targets.json,
 * overridable via WEBHOOK_TARGETS_PATH (absolute or relative to cwd).
 * Kept in `data/` (not `.data/`) because it's operator-authored and often
 * committed — mirroring the committed `data/revenue-manual-matches.json`
 * convention.
 */
export function targetsPath(): string {
  const raw = process.env.WEBHOOK_TARGETS_PATH?.trim();
  if (raw && raw.length > 0) {
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }
  return path.resolve(process.cwd(), "data", "webhook-targets.json");
}

// ---------------------------------------------------------------------------
// Target loader (mtime-cached)
// ---------------------------------------------------------------------------

interface TargetCache {
  signature: string;
  targets: WebhookTarget[];
}

let targetCache: TargetCache | null = null;

function fileSignature(p: string): string {
  try {
    const stat = statSync(p);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function isValidProvider(value: unknown): value is WebhookProvider {
  return value === "slack" || value === "discord";
}

function isValidEvent(value: unknown): value is WebhookEvent {
  return value === "breakout" || value === "funding" || value === "revenue";
}

function normalizeTarget(raw: unknown): WebhookTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const provider = r.provider;
  const url = typeof r.url === "string" ? r.url.trim() : "";
  const events = Array.isArray(r.events) ? r.events.filter(isValidEvent) : [];
  const enabled = r.enabled !== false;

  if (!id || !isValidProvider(provider) || !url || events.length === 0) {
    return null;
  }

  // URL shape sanity check. We accept only https URLs on the known
  // provider domains to blunt a misconfigured operator accidentally
  // pointing the queue at an internal host.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (provider === "slack" && !/\.slack\.com$/i.test(parsed.hostname)) {
      return null;
    }
    if (
      provider === "discord" &&
      !/^(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)$/i.test(
        parsed.hostname,
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const filters = normalizeFilters(r.filters);

  return {
    id,
    provider,
    url,
    events,
    filters,
    enabled,
  };
}

function normalizeFilters(raw: unknown): WebhookFilters | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: WebhookFilters = {};
  if (typeof r.minMomentum === "number" && Number.isFinite(r.minMomentum)) {
    out.minMomentum = r.minMomentum;
  }
  if (typeof r.minAmountUsd === "number" && Number.isFinite(r.minAmountUsd)) {
    out.minAmountUsd = r.minAmountUsd;
  }
  if (Array.isArray(r.languages)) {
    const langs = r.languages
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.toLowerCase());
    if (langs.length > 0) out.languages = langs;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Load targets with mtime cache. Operator edits the file → next call
 * re-reads. Callers MUST treat the returned list as immutable.
 */
export function loadTargets(): WebhookTarget[] {
  const p = targetsPath();
  const sig = fileSignature(p);
  if (targetCache && targetCache.signature === sig) return targetCache.targets;

  let targets: WebhookTarget[] = [];
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      targets = parsed
        .map(normalizeTarget)
        .filter((t): t is WebhookTarget => t !== null)
        .filter((t) => t.enabled !== false);
    }
  } catch {
    targets = [];
  }

  targetCache = { signature: sig, targets };
  return targets;
}

/** Test hook — reset the mtime cache so env changes take effect mid-test. */
export function __resetTargetCache(): void {
  targetCache = null;
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

function targetMatchesBreakout(
  target: WebhookTarget,
  repo: WebhookBreakoutRepo,
): boolean {
  if (!target.events.includes("breakout")) return false;
  const f = target.filters;
  if (!f) return true;
  if (
    typeof f.minMomentum === "number" &&
    (typeof repo.momentumScore !== "number" ||
      repo.momentumScore < f.minMomentum)
  ) {
    return false;
  }
  if (f.languages && f.languages.length > 0) {
    const lang = (repo.language ?? "").toLowerCase();
    if (!lang || !f.languages.includes(lang)) return false;
  }
  return true;
}

function targetMatchesFunding(
  target: WebhookTarget,
  event: WebhookFundingEvent,
): boolean {
  if (!target.events.includes("funding")) return false;
  const f = target.filters;
  if (!f) return true;
  if (typeof f.minAmountUsd === "number") {
    if (typeof event.amountUsd !== "number" || event.amountUsd < f.minAmountUsd) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Queue read / write (JSONL, under withFileLock)
// ---------------------------------------------------------------------------

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

export async function readQueue(): Promise<WebhookDelivery[]> {
  const p = queueLocation();
  let raw: string;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const out: WebhookDelivery[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const row = parsed as WebhookDelivery;
      if (typeof row.id !== "string" || typeof row.targetId !== "string") {
        continue;
      }
      out.push(row);
    } catch {
      console.warn(`[webhooks] skipping malformed queue line ${i + 1}`);
    }
  }
  return out;
}

export async function writeQueue(rows: WebhookDelivery[]): Promise<void> {
  const p = queueLocation();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const body = rows.length === 0 ? "" : rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, p);
}

export async function appendDeadLetter(
  row: WebhookDelivery,
): Promise<void> {
  const p = deadLetterLocation();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, JSON.stringify({ ...row, deadLetter: true }) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Enqueue one row per matching target, deduping on `${event}:${id}:${targetId}`.
 * Runs under withFileLock so concurrent publish* calls can't race-append.
 */
async function enqueueForTargets(
  event: WebhookEvent,
  subjectId: string,
  targetMatchFn: (t: WebhookTarget) => boolean,
  buildPayload: (t: WebhookTarget) => unknown,
): Promise<{ enqueued: number; skipped: number }> {
  const targets = loadTargets();
  const matching = targets.filter(targetMatchFn);
  if (matching.length === 0) return { enqueued: 0, skipped: 0 };

  return withFileLock(QUEUE_FILENAME, async () => {
    const existing = await readQueue();
    const seen = new Set(existing.map((r) => r.dedupKey));

    let enqueued = 0;
    let skipped = 0;
    const next = existing.slice();

    for (const target of matching) {
      const dedupKey = `${event}:${subjectId}:${target.id}`;
      if (seen.has(dedupKey)) {
        skipped += 1;
        continue;
      }
      const row: WebhookDelivery = {
        id: dedupKey,
        dedupKey,
        targetId: target.id,
        provider: target.provider,
        event,
        payload: buildPayload(target),
        createdAt: nowIso(),
        attempts: 0,
      };
      next.push(row);
      seen.add(dedupKey);
      enqueued += 1;
    }

    if (enqueued > 0) {
      await writeQueue(next);
    }
    return { enqueued, skipped };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function publishBreakoutToWebhooks(
  repo: WebhookBreakoutRepo,
): Promise<{ enqueued: number; skipped: number }> {
  if (!repo || !repo.fullName) return { enqueued: 0, skipped: 0 };
  return enqueueForTargets(
    "breakout",
    repo.fullName,
    (t) => targetMatchesBreakout(t, repo),
    () => repo,
  );
}

export async function publishFundingEvent(
  event: WebhookFundingEvent,
): Promise<{ enqueued: number; skipped: number }> {
  if (!event || !event.id) return { enqueued: 0, skipped: 0 };
  return enqueueForTargets(
    "funding",
    event.id,
    (t) => targetMatchesFunding(t, event),
    () => event,
  );
}

export async function publishRevenueEvent(payload: {
  id: string;
  fullName: string;
  [key: string]: unknown;
}): Promise<{ enqueued: number; skipped: number }> {
  if (!payload || !payload.id) return { enqueued: 0, skipped: 0 };
  return enqueueForTargets(
    "revenue",
    payload.id,
    (t) => t.events.includes("revenue"),
    () => payload,
  );
}
