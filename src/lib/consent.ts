// Cookie consent helpers (AGN-840). Klaro-style API: a single boolean
// for the "analytics" service, persisted in localStorage. Necessary
// cookies (theme, watchlist, etc.) are always allowed and never gated.
//
// We deliberately ship a hand-rolled banner instead of pulling in
// Klaro (~30 KB + its own CSS layer) because the only non-essential
// integration we need to gate today is PostHog. If we ever need
// per-vendor toggles or a Cookie Information service catalogue,
// swapping in Klaro is a one-file move (this module is the only
// place reading the key).

export const CONSENT_STORAGE_KEY = "trendingrepo-consent-v1";

export type ConsentChoice = "accepted" | "declined";

export type ConsentState = {
  analytics: boolean;
  // ISO timestamp the user made the choice. Useful for re-prompting
  // after a policy change (not wired today; reserved for future use).
  decidedAt: string;
  choice: ConsentChoice;
};

// Custom event fired on the window when consent changes. PostHogProvider
// listens for this so it can init/opt-in immediately after Accept
// without waiting for a page navigation.
export const CONSENT_CHANGED_EVENT = "trendingrepo:consent-changed";

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (
      parsed &&
      typeof parsed.analytics === "boolean" &&
      typeof parsed.decidedAt === "string" &&
      (parsed.choice === "accepted" || parsed.choice === "declined")
    ) {
      return parsed as ConsentState;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): ConsentState {
  const state: ConsentState = {
    analytics: choice === "accepted",
    decidedAt: new Date().toISOString(),
    choice,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(
        new CustomEvent<ConsentState>(CONSENT_CHANGED_EVENT, { detail: state }),
      );
    } catch {
      // localStorage can throw in private mode / disabled storage. The
      // banner will simply re-show next visit, which is the correct
      // behaviour — we never silently treat the user as opted-in.
    }
  }
  return state;
}
