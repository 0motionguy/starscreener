"use client";

// <InviteBanner /> — dismissible "earn early access" CTA (Chunk G).
//
// Mounted by other lanes on `/you` and as a one-shot post-watchlist-save
// nudge. Self-hosted dismissal: PATCH `/api/referrals/me` with
// `dismissedInviteBannerAt = now()` so the same user doesn't see it on
// the next page load.
//
// Lightweight by design — no Radix, no Framer Motion. v3 design tokens.

import Link from "next/link";
import { useState } from "react";

import { toast } from "@/lib/toast";

interface InviteBannerProps {
  /**
   * Pre-existing dismissal stamp from the server. When provided, the
   * banner is hidden on initial render so the parent doesn't have to
   * conditionally mount us — we just early-return null.
   */
  dismissedAt?: string | null;
  /**
   * Optional caller hook to mutate any local state (e.g. /you's
   * `useProfile` query) after the dismiss PATCH lands. Optional so most
   * mount sites can stay simple.
   */
  onDismissed?: () => void;
}

export function InviteBanner({
  dismissedAt,
  onDismissed,
}: InviteBannerProps = {}) {
  const [hidden, setHidden] = useState(Boolean(dismissedAt));
  const [busy, setBusy] = useState(false);

  if (hidden) return null;

  async function dismiss() {
    setBusy(true);
    try {
      const res = await fetch("/api/referrals/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dismissedInviteBannerAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        // Soft-fail — we still hide locally so the user gets the
        // expected behaviour. Server retry on next visit is fine.
        console.warn("[InviteBanner] dismiss PATCH failed", res.status);
      }
      setHidden(true);
      onDismissed?.();
    } catch (err) {
      console.warn("[InviteBanner] dismiss network error", err);
      // Hide locally anyway — the user clicked dismiss.
      setHidden(true);
      onDismissed?.();
    } finally {
      setBusy(false);
    }
  }

  function copyAndCelebrate() {
    // Optional inline confirmation when the user clicks the CTA — the
    // /you/refer landing covers the actual flow, this is just a nudge.
    toast.info("Heading to your referral page");
  }

  return (
    <div
      className="rounded-[2px] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      style={{
        background: "var(--v3-bg-050)",
        border: "1px solid var(--v3-acc-dim)",
      }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--v3-acc)" }}
        >
          {"// EARN EARLY ACCESS"}
        </div>
        <div
          className="text-sm leading-snug"
          style={{ color: "var(--v3-ink-100)" }}
        >
          Invite a friend to TrendingRepo. Badges + early access — no cash, no spam.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/you/refer"
          onClick={copyAndCelebrate}
          className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors"
          style={{
            background: "var(--v3-acc-soft)",
            border: "1px solid var(--v3-acc-dim)",
            color: "var(--v3-acc)",
            fontWeight: 500,
          }}
        >
          INVITE FRIENDS →
        </Link>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={busy}
          className="inline-flex items-center rounded-[2px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
          style={{
            background: "transparent",
            border: "1px solid var(--v3-line-200)",
            color: "var(--v3-ink-300)",
          }}
          aria-label="Dismiss invite banner"
        >
          {busy ? "…" : "DISMISS"}
        </button>
      </div>
    </div>
  );
}

export default InviteBanner;
