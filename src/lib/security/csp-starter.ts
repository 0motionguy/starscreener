type CspInput = {
  posthogHost?: string | null;
  sentryOrigin?: string | null;
  sentryReportUri?: string | null;
};

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/**
 * Starter CSP builder for Next.js headers().
 *
 * Intentionally conservative:
 * - keeps inline script/style allowed for current app compatibility
 * - narrows connect-src to self + explicit analytics endpoints
 * - optionally emits report-uri when Sentry DSN is configured
 */
export function buildStarterCsp(input: CspInput = {}): string {
  const posthogOrigin =
    normalizeOrigin(input.posthogHost) ?? "https://us.i.posthog.com";
  const sentryOrigin = normalizeOrigin(input.sentryOrigin);
  const sentryReportUri = input.sentryReportUri?.trim() || null;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.redoc.ly",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com https://opengraph.githubassets.com https://pbs.twimg.com https://abs.twimg.com https://unavatar.io https://www.google.com https://t0.gstatic.com https://t1.gstatic.com https://t2.gstatic.com https://t3.gstatic.com https://ph-files.imgix.net",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://us.i.posthog.com",
      "https://eu.i.posthog.com",
      posthogOrigin,
      sentryOrigin ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
    ...(sentryReportUri ? [`report-uri ${sentryReportUri}`] : []),
  ].join("; ");
}

/**
 * Stricter candidate policy for report-only rollout.
 * Keeps current runtime-compatible enforced CSP unchanged while collecting
 * violations for inline script/style removal work.
 */
export function buildReportOnlyCsp(input: CspInput = {}): string {
  const posthogOrigin =
    normalizeOrigin(input.posthogHost) ?? "https://us.i.posthog.com";
  const sentryOrigin = normalizeOrigin(input.sentryOrigin);
  const sentryReportUri = input.sentryReportUri?.trim() || null;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' https://cdn.redoc.ly",
    "style-src 'self'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://github.com https://opengraph.githubassets.com https://pbs.twimg.com https://abs.twimg.com https://unavatar.io https://www.google.com https://t0.gstatic.com https://t1.gstatic.com https://t2.gstatic.com https://t3.gstatic.com https://ph-files.imgix.net",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://us.i.posthog.com",
      "https://eu.i.posthog.com",
      posthogOrigin,
      sentryOrigin ?? "",
    ]
      .filter(Boolean)
      .join(" "),
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
    ...(sentryReportUri ? [`report-uri ${sentryReportUri}`] : []),
  ].join("; ");
}
