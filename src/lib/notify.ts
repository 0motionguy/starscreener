/**
 * trendingrepo Slack ops notify - direct webhook POST.
 * Standalone copy of @toolbox/notify@0.1.0 (AISO has the same copy).
 * Sync changes manually if upstream pattern evolves.
 *
 * This is NOT the end-user webhook system (src/lib/webhooks/) - that's
 * for breakout/funding events to user-configured webhooks. THIS module
 * is for OPS alerts (cron failures, EngineErrors, signups).
 *
 * Env (Vercel project settings - Sensitive):
 *   SLACK_WEBHOOK_CRITICAL / SLACK_WEBHOOK_OPS / SLACK_WEBHOOK_DEFAULT
 *   SLACK_WEBHOOK_CUSTOMER_OPS / SLACK_WEBHOOK_SIGNALS
 *   SLACK_QUIET_HOURS_RANGE / SLACK_QUIET_HOURS_TZ
 *   SLACK_RATE_LIMIT_PER_SOURCE / SLACK_RATE_LIMIT_WINDOW_SECONDS
 */

export type Severity = "critical" | "ops" | "signals";

export type Audience = "internal" | "customer";

export interface NotifyArgs {
  severity: Severity;
  source: string;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
  /**
   * Customer vs internal audience routing. Defaults to "internal".
   * Customer messages route to SLACK_WEBHOOK_CUSTOMER_OPS (with OPS/DEFAULT fallback).
   */
  audience?: Audience;
}

export interface NotifyResult {
  delivered: boolean;
  reason:
    | null
    | "no_webhook_configured"
    | "deduped"
    | "rate_limited"
    | "quiet_hours"
    | "post_failed"
    | "post_timeout"
    | "post_threw";
}

const TOKEN_PREFIX_PATTERNS = [
  /^sk[_-]/i,
  /^pk[_-]/i,
  /^rk[_-]/i,
  /^whsec[_-]/i,
  /^ghp_/,
  /^github_pat_/,
  /^ghs_/,
  /^gho_/,
  /^xox[abpsr]-/,
  /^xapp-/,
  /^AKIA/,
  /^ASIA/,
  /^SG\./,
  /^AIza/,
  /^eyJ/,
  /^Bearer\s/i,
  /^Basic\s/i,
  /^sntrys_/,
  /^sntryu_/,
  /^anthropic-api-key-/i,
  /^pcsk_/i,
  /^privy_/i,
  /^npm_/,
  /^supabase_/i,
  /^tbk_/,
];
const WEBHOOK_URL_PATTERNS = [
  /^https?:\/\/hooks\.slack\.com\/services\//i,
  /^https?:\/\/discord(?:app)?\.com\/api\/webhooks\//i,
];
const TOKEN_CHARSET = /^[A-Za-z0-9_\-./+=]+$/;

function looksLikeToken(s: string): boolean {
  if (s.length < 20) return false;
  for (const re of WEBHOOK_URL_PATTERNS) if (re.test(s)) return true;
  for (const re of TOKEN_PREFIX_PATTERNS) if (re.test(s)) return true;
  if (s.length >= 32 && TOKEN_CHARSET.test(s) && !s.includes(" ")) return true;
  return false;
}

function maskString(s: string): string {
  if (!looksLikeToken(s)) return s;
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function maskSecrets<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskString(value) as unknown as T;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => maskSecrets(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskSecrets(v);
    return out as unknown as T;
  }
  return value;
}

function isQuietHours(now: Date = new Date()): boolean {
  const rangeStr = process.env.SLACK_QUIET_HOURS_RANGE?.trim();
  if (!rangeStr) return false;
  const m = rangeStr.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const [, sh, sm, eh, em] = m;
  const tz = process.env.SLACK_QUIET_HOURS_TZ?.trim() || "Europe/Berlin";
  let hour = -1;
  let minute = -1;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    for (const p of parts) {
      if (p.type === "hour") hour = Number(p.value);
      if (p.type === "minute") minute = Number(p.value);
    }
  } catch {
    return false;
  }
  if (hour < 0 || minute < 0) return false;
  if (hour === 24) hour = 0;
  const nowMins = hour * 60 + minute;
  const startMins = Number(sh) * 60 + Number(sm);
  const endMins = Number(eh) * 60 + Number(em);
  if (startMins === endMins) return false;
  if (startMins < endMins) return nowMins >= startMins && nowMins < endMins;
  return nowMins >= startMins || nowMins < endMins;
}

const inProcessDedup = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000;
function checkDedup(key: string): boolean {
  const now = Date.now();
  for (const [k, expiry] of inProcessDedup.entries()) {
    if (expiry < now) inProcessDedup.delete(k);
  }
  if (inProcessDedup.has(key)) return true;
  inProcessDedup.set(key, now + DEDUP_TTL_MS);
  return false;
}

const rateCount = new Map<string, { count: number; resetAt: number }>();

function rateLimitPerSource(): number {
  return Number(process.env.SLACK_RATE_LIMIT_PER_SOURCE) || 20;
}

function rateLimitWindowMs(): number {
  return (Number(process.env.SLACK_RATE_LIMIT_WINDOW_SECONDS) || 600) * 1000;
}

function checkRateLimit(source: string): boolean {
  const now = Date.now();
  const limit = rateLimitPerSource();
  const entry = rateCount.get(source);
  if (!entry || entry.resetAt < now) {
    rateCount.set(source, { count: 1, resetAt: now + rateLimitWindowMs() });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

const SEVERITY_EMOJI: Record<Severity, string> = { critical: "🚨", ops: "ℹ️", signals: "📡" };
const SEVERITY_COLOR: Record<Severity, string> = { critical: "#dc3545", ops: "#0d6efd", signals: "#6c757d" };

const SOURCE_EMOJI: Array<[RegExp, string]> = [
  [/^github\./, "🐙"],
  [/^clerk\./, "👤"],
  [/sign-?up/i, "🎉"],
  [/sign-?in/i, "👤"],
  [/^reddit\./, "🤖"],
  [/^twitter\./, "🐦"],
  [/^bluesky\./, "🦋"],
  [/^hackernews\./, "📰"],
  [/^huggingface\./, "🤗"],
  [/^npm\./, "📦"],
  [/^arxiv\./, "📄"],
  [/^devto\./, "👩‍💻"],
  [/^lobsters\./, "🦞"],
  [/cron/i, "⏰"],
  [/digest/i, "📊"],
  [/scan/i, "🔭"],
  [/dispatch/i, "📤"],
  [/recover/i, "🔁"],
  [/flush/i, "🚰"],
  [/quarantine/i, "⚠️"],
  [/fatal/i, "💀"],
];

function pickEmoji(args: NotifyArgs): string {
  for (const [re, e] of SOURCE_EMOJI) if (re.test(args.source)) return e;
  return SEVERITY_EMOJI[args.severity];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "…";
}

function buildPayload(args: NotifyArgs): {
  text: string;
  attachments: Array<{ color: string; blocks: unknown[] }>;
} {
  const emoji = pickEmoji(args);
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
  const headerText = truncate(`${emoji} ${args.title}`, 150);
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: truncate(args.message, 2900) } },
  ];
  if (args.context && Object.keys(args.context).length > 0) {
    const masked = maskSecrets(args.context);
    const json = JSON.stringify(masked, null, 2);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "```" + truncate(json, 1800) + "```" },
    });
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_${new Date().toISOString()} · \`${args.source}\` · env:\`${env}\` · severity:\`${args.severity}\` · *trendingrepo*_`,
      },
    ],
  });
  return {
    text: headerText,
    attachments: [{ color: SEVERITY_COLOR[args.severity], blocks }],
  };
}

function resolveWebhookUrl(severity: Severity, audience: Audience): string | null {
  if (audience === "customer") {
    return (
      process.env.SLACK_WEBHOOK_CUSTOMER_OPS?.trim() ||
      process.env.SLACK_WEBHOOK_OPS?.trim() ||
      process.env.SLACK_WEBHOOK_DEFAULT?.trim() ||
      null
    );
  }
  if (severity === "critical") {
    return (
      process.env.SLACK_WEBHOOK_CRITICAL?.trim() ||
      process.env.SLACK_WEBHOOK_DEFAULT?.trim() ||
      null
    );
  }
  if (severity === "signals") {
    return (
      process.env.SLACK_WEBHOOK_SIGNALS?.trim() ||
      process.env.SLACK_WEBHOOK_OPS?.trim() ||
      process.env.SLACK_WEBHOOK_DEFAULT?.trim() ||
      null
    );
  }
  return (
    process.env.SLACK_WEBHOOK_OPS?.trim() ||
    process.env.SLACK_WEBHOOK_DEFAULT?.trim() ||
    null
  );
}

function onCallMention(): string {
  const raw = process.env.SLACK_ONCALL_USER_IDS?.trim();
  if (!raw) return "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^U[A-Z0-9]{6,}$/.test(s));
  if (ids.length === 0) return "";
  if (ids.length === 1) return `<@${ids[0]}>`;
  const d = new Date();
  const target = new Date(d.valueOf());
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `<@${ids[week % ids.length]}>`;
}

export async function notify(args: NotifyArgs): Promise<NotifyResult> {
  if (args.severity !== "critical" && isQuietHours()) {
    return { delivered: false, reason: "quiet_hours" };
  }
  const audience: Audience = args.audience ?? "internal";
  const url = resolveWebhookUrl(args.severity, audience);
  if (!url) return { delivered: false, reason: "no_webhook_configured" };
  if (args.idempotencyKey && checkDedup(args.idempotencyKey)) {
    return { delivered: false, reason: "deduped" };
  }
  if (args.severity !== "critical" && checkRateLimit(args.source)) {
    return { delivered: false, reason: "rate_limited" };
  }
  if (args.severity === "critical") {
    const mention = onCallMention();
    if (mention) args = { ...args, message: `${mention} ${args.message}` };
  }
  const payload = buildPayload(args);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (!res.ok) {
      console.warn("[notify] post_failed", { status: res.status, source: args.source });
      return { delivered: false, reason: "post_failed" };
    }
    return { delivered: true, reason: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn("[notify] " + (aborted ? "timeout" : "threw"), {
      source: args.source,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      delivered: false,
      reason: aborted ? "post_timeout" : "post_threw",
    };
  } finally {
    clearTimeout(t);
  }
}

export function __resetNotifyStateForTests(): void {
  inProcessDedup.clear();
  rateCount.clear();
}
