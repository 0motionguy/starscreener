"use client";

// CheckoutLauncher — completes the purchase funnel.
//
// Mounted on /pricing. When the page is opened with `?plan=pro|team`
// (the "Start Pro" CTAs link here), it:
//   1. Signed-out  → bounce to /sign-up, returning to /pricing?plan=… after auth.
//   2. Signed-in   → establish a Clerk-tied ss_user session (POST
//      /api/auth/session with the Clerk email so userId = HMAC(email) is
//      stable across devices), then POST /api/checkout/stripe and redirect to
//      the Stripe-hosted checkout URL.
//
// The checkout API authenticates via the ss_user cookie (verifyUserAuth), and
// the Stripe webhook grants the tier to that same userId — so a purchase made
// here unlocks features for the signed-in user on any device.

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

type Plan = "pro" | "team";
type Cadence = "monthly" | "yearly";

const CheckoutLauncherLoaded = dynamic(
  () =>
    import("./CheckoutLauncherLoaded").then(
      (mod) => mod.CheckoutLauncherLoaded,
    ),
  { ssr: false, loading: () => null },
);

interface CheckoutLauncherProps {
  authEnabled: boolean;
}

function asPlan(v: string | null): Plan | null {
  return v === "pro" || v === "team" ? v : null;
}

export function CheckoutLauncher({ authEnabled }: CheckoutLauncherProps) {
  const params = useSearchParams();
  const plan = asPlan(params.get("plan"));
  const cadence: Cadence = params.get("cadence") === "yearly" ? "yearly" : "monthly";

  if (!plan) return null;

  if (!authEnabled) {
    return (
      <CheckoutOverlay
        error="Checkout sign-in is temporarily unavailable. Please retry shortly."
      />
    );
  }

  return <CheckoutLauncherLoaded plan={plan} cadence={cadence} />;
}

export function CheckoutOverlay({ error }: { error: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        background: "rgba(8,9,10,0.82)",
        backdropFilter: "blur(4px)",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        {error ? (
          <>
            <p style={{ color: "var(--text, #e8e8e8)", fontSize: 15, marginBottom: 12 }}>{error}</p>
            <Link href="/pricing" style={{ color: "var(--accent, #ff6b35)", fontSize: 13 }}>
              ← Back to pricing
            </Link>
          </>
        ) : (
          <p style={{ color: "var(--text, #e8e8e8)", fontSize: 15 }}>
            Starting secure checkout&hellip;
          </p>
        )}
      </div>
    </div>
  );
}
