"use client";

// <CheckoutWalkthrough /> — S3.C 2-step modal that intercepts the
// paid-tier checkout CTA.
//
// Step 1 — restates what the user is paying for (feature bullets from
// the tier definition) so the value prop is clear before they leave
// for Stripe.
// Step 2 — reassurance line ("cancel anytime") and a SKIP link for
// users who want to bypass the explainer next time.
//
// Continue → POSTs `/api/checkout/stripe` with `{ tier, cadence }`,
// reads back the Stripe Checkout URL, and redirects. The POST endpoint
// returns 401 when Clerk isn't configured (production blocker — see
// `src/lib/auth/clerk-config.ts`) and 503 when Stripe envs are missing.
// In both cases we surface a friendly inline error and keep the modal
// open so the user knows to wait / contact ops.
//
// Native `<dialog>` element to match `ConfirmDialog` — no Radix, no
// react-modal, no portal layer to bundle.

import { useEffect, useRef, useState } from "react";

import type { BillingCadence, TierDefinition } from "@/lib/pricing/tiers";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";

interface CheckoutWalkthroughProps {
  tier: TierDefinition;
  cadence: BillingCadence;
  open: boolean;
  onClose: () => void;
}

interface CheckoutResponse {
  ok: true;
  url: string;
}

interface CheckoutError {
  ok: false;
  error?: string;
}

async function startCheckout(
  tier: TierDefinition,
  cadence: BillingCadence,
): Promise<CheckoutResponse> {
  const res = await fetch("/api/checkout/stripe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier: tier.key,
      cadence: cadence === "yearly" ? "yearly" : "monthly",
      seats: tier.minSeats > 1 ? tier.minSeats : undefined,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | CheckoutResponse
    | CheckoutError
    | null;
  if (!res.ok || !body || body.ok !== true) {
    const reason =
      body && body.ok === false && body.error
        ? body.error
        : `checkout failed: ${res.status}`;
    throw new Error(reason);
  }
  return body;
}

export function CheckoutWalkthrough({
  tier,
  cadence,
  open,
  onClose,
}: CheckoutWalkthroughProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the native dialog `open` state with our prop.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      // Reset internal state when the modal is freshly opened so a user
      // who closes-then-reopens doesn't land on step 2.
      setStep(1);
      setError(null);
      // Fire-and-forget analytics on open.
      try {
        getLoadedBrowserPostHog()?.capture("pricing_walkthrough_open", {
          tier: tier.key,
          cadence,
        });
      } catch {
        // analytics must never throw upstream
      }
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, tier.key, cadence]);

  async function handleContinue() {
    setBusy(true);
    setError(null);
    try {
      try {
        getLoadedBrowserPostHog()?.capture("pricing_walkthrough_continue", {
          tier: tier.key,
          cadence,
        });
      } catch {
        // analytics must never throw upstream
      }
      const { url } = await startCheckout(tier, cadence);
      // Hand off to Stripe. We do NOT call onClose() because the page
      // will fully navigate; if the navigation is somehow blocked the
      // modal stays in its current state for the user to retry.
      window.location.href = url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't start checkout";
      setError(message);
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="rounded-[4px] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      style={{
        background: "var(--v2-bg-050)",
        border: "1px solid var(--v2-line-200)",
        color: "var(--v2-ink-000)",
        padding: 0,
        maxWidth: 520,
        width: "calc(100vw - 32px)",
      }}
      onClose={() => onClose()}
      onCancel={() => onClose()}
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "var(--v2-ink-400)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            {`// CHECKOUT · STEP ${step} / 2 · ${tier.displayName.toUpperCase()}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--v2-ink-300)",
              cursor: "pointer",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
            }}
            aria-label="Close checkout walkthrough"
          >
            ✕
          </button>
        </header>

        {step === 1 ? (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                fontFamily: "var(--font-geist), Inter, sans-serif",
                fontSize: 22,
                fontWeight: 510,
                letterSpacing: "-0.018em",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              What you’ll get with {tier.displayName}
            </h2>
            <p style={{ fontSize: 13, color: "var(--v2-ink-200)", margin: 0 }}>
              {tier.tagline}
            </p>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {[
                tier.features.maxAlertRules === -1
                  ? "Unlimited alert rules"
                  : `${tier.features.maxAlertRules} alert rules`,
                tier.features.maxWebhookTargets === -1
                  ? "Unlimited webhook targets"
                  : `${tier.features.maxWebhookTargets} webhook targets`,
                tier.features.maxWatchlistRepos === -1
                  ? "Unlimited watchlist"
                  : `${tier.features.maxWatchlistRepos} watchlist repos`,
                `${tier.features.rateLimitMultiplier}× rate-limit budget`,
                tier.features.csvExport ? "CSV export" : null,
                tier.features.privateWatchlist ? "Private watchlist" : null,
                tier.features.emailDigest ? "Weekly email digest" : null,
                tier.features.mcpUsageReports ? "MCP usage reports" : null,
                tier.features.teamWorkspace ? "Team workspace" : null,
                tier.features.prioritySupport ? "Priority support" : null,
              ]
                .filter((line): line is string => Boolean(line))
                .map((line) => (
                  <li
                    key={line}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--v2-ink-100)",
                    }}
                  >
                    <span style={{ color: "var(--v2-acc)", fontWeight: 700 }}>+</span>
                    {line}
                  </li>
                ))}
            </ul>
          </section>
        ) : (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                fontFamily: "var(--font-geist), Inter, sans-serif",
                fontSize: 22,
                fontWeight: 510,
                letterSpacing: "-0.018em",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              30-day money-back guarantee
            </h2>
            <p style={{ fontSize: 13, color: "var(--v2-ink-200)", margin: 0 }}>
              If TrendingRepo doesn&apos;t earn its keep in the first 30 days,
              reply to any billing email and we&apos;ll refund the full charge —
              no questions, no exit interview.
            </p>
            <p style={{ fontSize: 13, color: "var(--v2-ink-200)", margin: 0 }}>
              You can cancel anytime from{" "}
              <code
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "var(--v2-ink-100)",
                }}
              >
                /you/settings
              </code>{" "}
              (Stripe-hosted portal — your card never touches our servers). We
              keep your watchlist and alert rules even if you downgrade back to
              Free.
            </p>
            <p
              style={{
                fontSize: 12,
                color: "var(--v2-ink-300)",
                margin: 0,
                paddingTop: 4,
                borderTop: "1px solid var(--v2-line-100)",
              }}
            >
              Next step opens a hosted Stripe Checkout in this tab.
            </p>
          </section>
        )}

        {error ? (
          <p
            role="alert"
            style={{
              fontSize: 12,
              color: "var(--v2-down)",
              margin: 0,
              padding: "8px 10px",
              border: "1px solid var(--v2-down)",
              borderRadius: 3,
              background: "color-mix(in srgb, var(--v2-down) 8%, transparent)",
            }}
          >
            {error}
          </p>
        ) : null}

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingTop: 4,
            borderTop: "1px solid var(--v2-line-100)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="v2-btn v2-btn-ghost"
            style={{ minHeight: 38 }}
          >
            CANCEL
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={busy}
              className="v2-btn v2-btn-primary"
              style={{ minHeight: 38 }}
            >
              CONTINUE →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={busy}
              className="v2-btn v2-btn-primary"
              style={{ minHeight: 38 }}
            >
              {busy ? "REDIRECTING…" : "GO TO CHECKOUT →"}
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}

export default CheckoutWalkthrough;
