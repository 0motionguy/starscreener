"use client";

// Post-signup welcome modal. One-time, cookie-gated. Surfaces after a
// new user lands back on `/` (or anywhere) after the Clerk hosted sign-up
// flow completes. Two CTAs:
//   1. Primary  — links to /you/alerts (the activation step)
//   2. Secondary — dismiss + look around
//
// The modal is intentionally non-blocking: ESC and outside-click both
// dismiss. We don't gate any feature behind it; this is a nudge, not a
// gate. Engagement is measured via PostHog events:
//   - welcome_modal_shown        (fired when modal first paints)
//   - welcome_modal_dismissed    (any close path: ESC, backdrop, secondary CTA)
//   - welcome_modal_cta_clicked  (primary CTA — links to /you/alerts)
//
// Visual conventions: native <dialog> + showModal() to inherit the
// browser's a11y plumbing (focus trap, backdrop, ESC). Same primitive as
// ConfirmDialog.tsx so we stay consistent. V4 tokens via inline styles
// since dialog elements live outside Tailwind's normal cascading scope
// in some configs.

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

interface WelcomeModalProps {
  displayName: string | null;
  show: boolean;
  onDismiss: () => void;
}

function captureEvent(
  event:
    | "welcome_modal_shown"
    | "welcome_modal_dismissed"
    | "welcome_modal_cta_clicked",
  properties?: Record<string, unknown>,
): void {
  try {
    const posthog = getLoadedBrowserPostHog();
    if (posthog) {
      posthog.capture(event, properties ?? {});
    }
  } catch {
    // Analytics must never throw upstream.
  }
}

export function WelcomeModal({
  displayName,
  show,
  onDismiss,
}: WelcomeModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  // Fire `welcome_modal_shown` exactly once per mount-and-show cycle.
  // useRef instead of state so the event fires before the next paint.
  const shownFired = useRef(false);

  // Open / close the underlying <dialog> in lockstep with the `show` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (show && !dialog.open) {
      dialog.showModal();
      if (!shownFired.current) {
        captureEvent("welcome_modal_shown", {
          has_display_name: displayName !== null,
        });
        shownFired.current = true;
      }
      // Focus the primary CTA so keyboard users can hit Enter to act.
      // requestAnimationFrame ensures the dialog has actually opened.
      requestAnimationFrame(() => {
        ctaRef.current?.focus();
      });
    } else if (!show && dialog.open) {
      dialog.close();
    }
  }, [show, displayName]);

  // Native <dialog> emits "cancel" on ESC. Surface to caller as dismiss.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      captureEvent("welcome_modal_dismissed", { reason: "escape" });
      onDismiss();
    },
    [onDismiss],
  );

  // Backdrop click → dismiss.
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) {
        captureEvent("welcome_modal_dismissed", { reason: "backdrop" });
        onDismiss();
      }
    },
    [onDismiss],
  );

  const handleSecondaryClick = useCallback(() => {
    captureEvent("welcome_modal_dismissed", { reason: "secondary_cta" });
    onDismiss();
  }, [onDismiss]);

  const handlePrimaryClick = useCallback(() => {
    captureEvent("welcome_modal_cta_clicked", {
      destination: "/you/alerts",
    });
    onDismiss(); // Closes modal + sets cookie via WelcomeModalGate.
  }, [onDismiss]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="welcome-modal-title"
      aria-describedby="welcome-modal-description"
      style={{
        background: "var(--v4-bg-025)",
        color: "var(--v4-ink-100)",
        border: "1px solid var(--v4-line-200)",
        borderRadius: "4px",
        padding: 0,
        margin: "auto",
        maxWidth: "min(92vw, 30rem)",
        boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.6)",
      }}
      className="welcome-modal backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div style={{ padding: "1.25rem 1.5rem 1.5rem" }}>
        {/* WELCOME pill — mono accent at top of card */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.25rem 0.5rem",
            background: "var(--v4-acc-soft)",
            color: "var(--v4-acc)",
            border: "1px solid var(--v4-acc)",
            borderRadius: "2px",
            fontFamily: "var(--v4-mono)",
            fontSize: "var(--v4-text-10)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              background: "var(--v4-acc)",
              borderRadius: "50%",
              boxShadow: "0 0 6px var(--v4-acc-glow)",
            }}
          />
          Welcome
        </div>

        <h2
          id="welcome-modal-title"
          style={{
            marginTop: "0.875rem",
            fontFamily: "var(--v4-sans)",
            fontSize: "var(--v4-text-22)",
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            color: "var(--v4-ink-000)",
          }}
        >
          Welcome, {displayName ?? "there"}!
        </h2>

        <p
          id="welcome-modal-description"
          style={{
            marginTop: "0.625rem",
            fontFamily: "var(--v4-sans)",
            fontSize: "var(--v4-text-14)",
            lineHeight: 1.5,
            color: "var(--v4-ink-200)",
          }}
        >
          Set up your first alert in 2 minutes — that&apos;s how you&apos;ll
          catch breakouts before they&apos;re cold.
        </p>

        <div
          style={{
            marginTop: "1.5rem",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={handleSecondaryClick}
            style={{
              padding: "0.5rem 0.875rem",
              background: "transparent",
              border: "1px solid var(--v4-line-300)",
              color: "var(--v4-ink-200)",
              fontFamily: "var(--v4-mono)",
              fontSize: "var(--v4-text-11)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: "3px",
              cursor: "pointer",
            }}
          >
            Look around first
          </button>
          <Link
            ref={ctaRef}
            href="/you/alerts"
            onClick={handlePrimaryClick}
            style={{
              padding: "0.5rem 0.875rem",
              background: "var(--v4-acc)",
              border: "1px solid var(--v4-acc)",
              color: "var(--v4-bg-000)",
              fontFamily: "var(--v4-mono)",
              fontSize: "var(--v4-text-11)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: "3px",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            Create my first alert
          </Link>
        </div>
      </div>
    </dialog>
  );
}

export default WelcomeModal;
