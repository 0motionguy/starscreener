"use client";

// ManageBillingButton — opens the Stripe Customer Portal.
//
// POSTs /api/billing/portal (which resolves the caller's Stripe customer id
// SERVER-side from the tier store — never from a client value) and redirects to
// the returned Stripe-hosted URL. Rendered only when the account actually has a
// Stripe customer (see AccountBillingPanel), so the button never dead-ends.

import { useState } from "react";
import { Icon } from "@/lib/icons";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; url?: string; error?: string }
        | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(data?.error ?? "Couldn't open billing. Please retry.");
    } catch {
      setError("Couldn't open billing. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn sm"
        onClick={() => void open()}
        disabled={loading}
        aria-label="Manage billing"
      >
        <Icon name="external" size={12} />
        {loading ? "Opening…" : "Manage billing"}
      </button>
      {error ? (
        <span className="billing-cta-copy" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
