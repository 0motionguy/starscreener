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

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";

type Plan = "pro" | "team";
type Cadence = "monthly" | "yearly";

function asPlan(v: string | null): Plan | null {
  return v === "pro" || v === "team" ? v : null;
}

export function CheckoutLauncher() {
  const { isLoaded, isSignedIn, user } = useUser();
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const plan = asPlan(params.get("plan"));
  const cadence: Cadence = params.get("cadence") === "yearly" ? "yearly" : "monthly";

  useEffect(() => {
    if (!plan || !isLoaded || started.current) return;

    if (!isSignedIn) {
      const ret = `/pricing?plan=${plan}&cadence=${cadence}`;
      router.replace(`/sign-up?redirect_url=${encodeURIComponent(ret)}`);
      return;
    }

    started.current = true;
    void (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        // 1. Bind a stable, Clerk-tied ss_user session (userId = HMAC(email)).
        await fetch("/api/auth/session", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(email ? { email } : {}),
        });
        // 2. Create the Stripe Checkout Session and redirect.
        const res = await fetch("/api/checkout/stripe", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            plan === "team"
              ? { tier: "team", cadence, seats: 3 }
              : { tier: "pro", cadence },
          ),
        });
        const data: { ok?: boolean; url?: string; error?: string } = await res
          .json()
          .catch(() => ({ ok: false }));
        if (data.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        started.current = false;
        setError(data.error ?? "Checkout is temporarily unavailable. Please retry.");
      } catch {
        started.current = false;
        setError("Checkout failed to start. Please retry.");
      }
    })();
  }, [plan, cadence, isLoaded, isSignedIn, user, router]);

  if (!plan) return null;

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
