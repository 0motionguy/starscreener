"use client";

// GDPR cookie consent banner (AGN-840). Klaro-style UX:
//   - First visit: banner appears, analytics blocked by default
//   - User picks Accept (analytics on) or Decline (analytics stays off)
//   - Choice persists in localStorage; banner does not re-show next visit
//   - PostHogProvider listens for the consent-changed event and only
//     initialises posthog-js after `accepted`
//
// We hand-roll this rather than embed Klaro because (a) the only
// non-essential vendor today is PostHog and (b) Klaro's runtime is
// ~30 KB plus a separate CSS layer that fights our v3 token system.
// If we ever need a multi-vendor catalogue UI, swap-in is a one-file
// move (consent.ts is the only persistence surface).

import { useEffect, useState } from "react";
import { CONSENT_CHANGED_EVENT, readConsent, writeConsent } from "@/lib/consent";

export function CookieConsentBanner() {
  // Keep the banner mounted server-side as null so it can't cause
  // hydration mismatches on the chosen state. We only flip `visible`
  // after the first effect once we've read localStorage.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) setVisible(true);

    // If a different surface (e.g. a future "Manage cookies" link in
    // the footer) wipes the stored choice, reopen the banner.
    function onChange() {
      const next = readConsent();
      setVisible(next == null);
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  if (!visible) return null;

  function handle(choice: "accepted" | "declined") {
    writeConsent(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      className="fixed bottom-3 left-3 right-3 z-[90] mx-auto max-w-xl rounded-[2px] border p-4 shadow-[var(--shadow-popover)] sm:left-4 sm:right-auto sm:bottom-4"
      style={{
        background: "var(--v3-bg-050)",
        borderColor: "var(--v3-line-200)",
        color: "var(--v3-ink-100)",
      }}
    >
      <p
        id="cookie-consent-title"
        className="text-[13px] font-medium tracking-[-0.005em]"
        style={{ color: "var(--v3-ink-000)" }}
      >
        Cookies & analytics
      </p>
      <p
        id="cookie-consent-body"
        className="mt-1 text-[12px] leading-snug"
        style={{ color: "var(--v3-ink-300)" }}
      >
        We use a few necessary cookies to remember your theme and watchlist.
        With your consent we also load PostHog to understand which trending
        signals matter. Decline and only the essentials run.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handle("accepted")}
          className="rounded-[2px] px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{
            background: "var(--v3-acc)",
            color: "var(--v3-bg-025)",
          }}
        >
          Accept analytics
        </button>
        <button
          type="button"
          onClick={() => handle("declined")}
          className="rounded-[2px] border px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{
            borderColor: "var(--v3-line-200)",
            color: "var(--v3-ink-100)",
            background: "transparent",
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
