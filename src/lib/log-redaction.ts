import { redactToken } from "@/lib/github-token-pool";

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const IPV6_RE = /\b(?:(?:[A-F0-9]{1,4}:){1,7}:|(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4})\b/gi;
const BEARER_RE = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{8,})\b/gi;
const BASIC_RE = /\b(Basic\s+)([A-Za-z0-9+/=]{8,})\b/gi;
const TOKEN_VALUE_RE = /\b(token|secret|password|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi;
const COOKIE_RE = /\b(ss_user|ss_admin)\s*=\s*([^\s;]+)/gi;
const LONG_SECRET_RE = /\b([A-Za-z0-9._-]{16,})\b/g;
const EMAIL_KEY_RE = /email/i;

function maskValue(raw: string): string {
  return redactToken(raw);
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(IPV4_RE, "[redacted-ip]")
    .replace(IPV6_RE, "[redacted-ip]")
    .replace(BEARER_RE, (_, prefix: string, value: string) => `${prefix}${maskValue(value)}`)
    .replace(BASIC_RE, (_, prefix: string, value: string) => `${prefix}${maskValue(value)}`)
    .replace(
      TOKEN_VALUE_RE,
      (_match: string, key: string, value: string) => `${key}=${maskValue(value)}`,
    )
    .replace(COOKIE_RE, (_match: string, name: string, value: string) => `${name}=${maskValue(value)}`)
    .replace(LONG_SECRET_RE, (value: string) => {
      // Preserve high-signal IDs like ISO timestamps while masking token-like blobs.
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
      return maskValue(value);
    });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively sanitize telemetry payloads before they are sent to providers
 * like Sentry. Strings are redacted via redactSensitiveText, and fields whose
 * key name indicates email are overwritten explicitly.
 */
export function sanitizeTelemetryValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTelemetryValue(item));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (EMAIL_KEY_RE.test(key) && typeof raw === "string") {
        out[key] = "[redacted-email]";
        continue;
      }
      out[key] = sanitizeTelemetryValue(raw);
    }
    return out;
  }
  return value;
}
