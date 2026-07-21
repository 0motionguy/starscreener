"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { CheckoutOverlay } from "./CheckoutLauncher";

type Plan = "pro" | "team";
type Cadence = "monthly" | "yearly";

interface CheckoutLauncherLoadedProps {
  plan: Plan;
  cadence: Cadence;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function CheckoutLauncherLoaded({
  plan,
  cadence,
}: CheckoutLauncherLoadedProps) {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const started = useRef(false);
  // One Idempotency-Key per deliberate checkout attempt (this mount). A
  // transport retry reuses it → one Stripe session; a fresh attempt (a new
  // visit to /pricing?plan=…) remounts and gets a new key → a new session.
  const idempotencyKey = useRef<string>("");
  if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey();

  const [error, setError] = useState<string | null>(null);
  const [teamContact, setTeamContact] = useState(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;

    // Team is not self-serve until the workspace/seat lifecycle exists. Surface
    // contact/waitlist instead of a live purchase (the server also rejects it).
    if (plan === "team") {
      started.current = true;
      setTeamContact(true);
      return;
    }

    if (!isSignedIn) {
      const ret = `/pricing?plan=${plan}&cadence=${cadence}`;
      router.replace(`/sign-up?redirect_url=${encodeURIComponent(ret)}`);
      return;
    }

    started.current = true;
    void (async () => {
      try {
        // Establish/refresh the Clerk-tied ss_user session. Identity is decided
        // SERVER-side from the Clerk probe — the request body is ignored, so we
        // send none. We DO check the mint succeeded before starting checkout.
        const mint = await fetch("/api/auth/session", {
          method: "POST",
          credentials: "include",
        });
        if (!mint.ok) {
          started.current = false;
          setError("Couldn't start your session. Please retry.");
          return;
        }

        const res = await fetch("/api/checkout/stripe", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idempotencyKey.current,
          },
          body: JSON.stringify({ tier: "pro", cadence }),
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
  }, [plan, cadence, isLoaded, isSignedIn, router]);

  if (teamContact) {
    return (
      <CheckoutOverlay error="Team plans aren't self-serve yet — email sales@trendingrepo.com and we'll set your workspace up." />
    );
  }
  return <CheckoutOverlay error={error} />;
}
