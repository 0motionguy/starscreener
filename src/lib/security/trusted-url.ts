// Shared URL trust guards for externally configured endpoints.
//
// Goal: prevent malformed or local-only callback targets from being used by
// server-side alerting code.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeHttpOrigin(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getTrustedOpsAlertWebhookUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname || LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
