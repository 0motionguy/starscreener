// Consent cookie helpers (S3.5.C). Browser-only — server callers should
// read the `Cookie` header explicitly.
//
// The `tr_consent` cookie is a small JSON envelope so we can extend
// later without renaming or shipping a schema migration. Categories
// follow the standard IAB / EDPB shape (necessary / analytics /
// marketing). `necessary` is implicit true everywhere — listed for
// completeness but the UI doesn't expose a toggle for it because
// declining "necessary" cookies means the site simply can't function.
//
// The cookie value itself is a URL-encoded JSON object; we keep it
// short enough to fit in any reasonable cookie quota even after
// repeated re-encodes.

export const CONSENT_COOKIE_NAME = "tr_consent";
const CONSENT_MAX_AGE_DAYS = 180;
export const CONSENT_CHANGED_EVENT = "trendingrepo:consent-changed";

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  /** Unix epoch ms when the user made the decision. */
  ts: number;
}

export const DEFAULT_PRE_DECISION_CONSENT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  ts: 0,
};

export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!raw) return null;
  const value = raw.slice(CONSENT_COOKIE_NAME.length + 1);
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ConsentState>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: typeof parsed.ts === "number" && Number.isFinite(parsed.ts) ? parsed.ts : 0,
    };
  } catch {
    // Malformed cookie — treat as "no decision yet" so the banner
    // re-prompts. The user can re-grant consent on the next visit.
    return null;
  }
}

export function writeConsent(
  state: Omit<ConsentState, "necessary" | "ts">,
): ConsentState {
  if (typeof document === "undefined") {
    throw new Error("writeConsent must run in the browser");
  }
  const payload: ConsentState = {
    necessary: true,
    analytics: state.analytics,
    marketing: state.marketing,
    ts: Date.now(),
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE_NAME}=${encoded}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  // Broadcast so any listener (PostHogProvider, layout, etc.) can react
  // without a page reload.
  try {
    window.dispatchEvent(
      new CustomEvent<ConsentState>(CONSENT_CHANGED_EVENT, { detail: payload }),
    );
  } catch {
    // CustomEvent isn't supported on ancient browsers; the page will
    // still reflect the change on next reload.
  }
  return payload;
}

/**
 * Convenience — true when the user has actively granted analytics
 * (i.e. the cookie exists AND `analytics: true`). Returns `false` both
 * when there is no decision yet AND when the user opted out.
 */
export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true;
}
