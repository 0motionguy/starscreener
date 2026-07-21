"use client";

// CheckoutSuccess — owner-verified post-checkout confirmation.
//
// Mounted on /pricing. When Stripe redirects the buyer back with
// `?checkout=success&session_id=cs_…`, this polls the authenticated
// /api/checkout/verify endpoint (which proves the session belongs to the
// current Clerk principal — the URL session id is never trusted alone) and
// renders a trustworthy state instead of a bare pricing page.
//
// States: confirming → active | delayed | failed | wrong_account.
//
// Design: mirrors the sibling CheckoutOverlay (fixed, centered, role=status)
// using shell.css tokens (var(--…)) and the `btn` primitives — no inline hex.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type VerifyState =
  | "confirming"
  | "active"
  | "delayed"
  | "failed"
  | "wrong_account";

const MAX_POLLS = 10;
const POLL_MS = 2000;

export function CheckoutSuccess() {
  const params = useSearchParams();
  const isSuccess = params.get("checkout") === "success";
  const sessionId = params.get("session_id");

  const [state, setState] = useState<VerifyState>("confirming");
  const [tier, setTier] = useState<string | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (!isSuccess || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      attempts.current += 1;
      try {
        const res = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`,
          { credentials: "include", cache: "no-store" },
        );
        if (cancelled) return;
        if (res.status === 401) {
          setState("failed");
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | { state?: VerifyState; tier?: string }
          | null;
        const next = data?.state;
        if (next === "active") {
          setState("active");
          setTier(data?.tier ?? null);
          return;
        }
        if (next === "failed" || next === "wrong_account") {
          setState(next);
          return;
        }
        // confirming / delayed → keep polling until the webhook lands.
        setState(next === "delayed" ? "delayed" : "confirming");
        if (attempts.current < MAX_POLLS) {
          timer = setTimeout(() => void poll(), POLL_MS);
        } else {
          // Give up polling but leave a "still processing" state, not a failure.
          setState((prev) => (prev === "active" ? prev : "delayed"));
        }
      } catch {
        if (!cancelled && attempts.current < MAX_POLLS) {
          timer = setTimeout(() => void poll(), POLL_MS);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isSuccess, sessionId]);

  if (!isSuccess || !sessionId) return null;

  const content = renderState(state, tier);

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
        background: "var(--scrim, rgba(8,9,10,0.82))",
        backdropFilter: "blur(4px)",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div
        className="panel"
        style={{ maxWidth: 460, padding: "28px 26px", display: "grid", gap: 14 }}
      >
        {content}
      </div>
    </div>
  );
}

function renderState(state: VerifyState, tier: string | null) {
  switch (state) {
    case "active":
      return (
        <>
          <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>
            You&rsquo;re on {tier ? tierLabel(tier) : "your new plan"} 🎉
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted, var(--text))" }}>
            Your upgrade is live. Every Pro surface is unlocked.
          </p>
          <Link href="/account" className="btn primary" aria-label="Go to your account">
            Go to your account
          </Link>
        </>
      );
    case "delayed":
      return (
        <>
          <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>
            Payment received
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted, var(--text))" }}>
            We&rsquo;re activating your account — this can take a few seconds.
            You can head to your account; it will update automatically.
          </p>
          <Link href="/account" className="btn" aria-label="Go to your account">
            Go to your account
          </Link>
        </>
      );
    case "wrong_account":
      return (
        <>
          <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>
            This checkout belongs to a different account
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted, var(--text))" }}>
            Sign in with the account you used to pay to see your upgrade.
          </p>
          <Link href="/pricing" className="btn" aria-label="Back to pricing">
            Back to pricing
          </Link>
        </>
      );
    case "failed":
      return (
        <>
          <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>
            We couldn&rsquo;t confirm this checkout
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted, var(--text))" }}>
            If you were charged, your account will still update once Stripe
            confirms. Otherwise you can try again.
          </p>
          <Link href="/pricing" className="btn" aria-label="Back to pricing">
            Back to pricing
          </Link>
        </>
      );
    case "confirming":
    default:
      return (
        <p style={{ margin: 0, fontSize: 15, color: "var(--text)" }}>
          Confirming your upgrade&hellip;
        </p>
      );
  }
}

function tierLabel(tier: string): string {
  if (tier === "pro") return "Pro";
  if (tier === "team") return "Team";
  if (tier === "enterprise") return "Enterprise";
  return tier;
}
