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

export function CheckoutLauncherLoaded({
  plan,
  cadence,
}: CheckoutLauncherLoadedProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || started.current) return;

    if (!isSignedIn) {
      const ret = `/pricing?plan=${plan}&cadence=${cadence}`;
      router.replace(`/sign-up?redirect_url=${encodeURIComponent(ret)}`);
      return;
    }

    started.current = true;
    void (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        await fetch("/api/auth/session", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(email ? { email } : {}),
        });

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

  return <CheckoutOverlay error={error} />;
}
