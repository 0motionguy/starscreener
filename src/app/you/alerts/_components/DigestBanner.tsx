"use client";

// <DigestBanner /> — S3.A NUX nudge for users with `emailAlertsCadence: "off"`.
//
// Renders only when:
//   1. Resend is configured server-side (`isEmailConfigured()` true)
//   2. The viewer's current cadence is "off" (i.e. they've never opted in)
//   3. The local dismissal cookie `sb_digest_dismissed` is absent
//
// Picking Daily / Weekly fires a single `PATCH /api/me/profile` call
// (same endpoint used by `GlobalPreferences`) so the digest behaviour is
// canonical and there's no second code path to keep in sync. PostHog
// captures `digest_subscribe` for the dashboard funnel.
//
// We deliberately do not echo the freshness-chrome rule: this banner is
// not a status indicator, it's a prompt. Visual chrome is v3 to match
// the rest of `/you/alerts`.

import { useState } from "react";

import { toast } from "@/lib/toast";
import { captureFunnelStep } from "@/lib/analytics/funnel";
import { getLoadedBrowserPostHog } from "@/lib/analytics/posthog-client";
import type { EmailAlertsCadence } from "@/lib/db/schema/profiles";

const COOKIE_NAME = "sb_digest_dismissed";
const COOKIE_MAX_AGE_DAYS = 30;

function hasDismissalCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((entry) => entry.trim().startsWith(`${COOKIE_NAME}=`));
}

function setDismissalCookie(): void {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=1; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

interface DigestBannerProps {
  /**
   * Current cadence from the server. We only render when this is "off"
   * — anything else means the user already picked a digest setting via
   * `GlobalPreferences` and the prompt would be noise.
   */
  initialCadence: EmailAlertsCadence;
  /**
   * Server-side mirror of `isEmailConfigured()`. When false, the banner
   * is suppressed because the PATCH would succeed but no email would
   * ever be sent — we'd be lying to the user about delivery.
   */
  emailConfigured: boolean;
}

export function DigestBanner({
  initialCadence,
  emailConfigured,
}: DigestBannerProps) {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (!emailConfigured) return true;
    if (initialCadence !== "off") return true;
    return hasDismissalCookie();
  });
  const [busy, setBusy] = useState<null | EmailAlertsCadence>(null);

  if (hidden) return null;

  async function subscribe(cadence: Extract<EmailAlertsCadence, "daily" | "weekly">) {
    setBusy(cadence);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAlertsCadence: cadence }),
      });
      if (!res.ok) {
        throw new Error(`profile patch failed: ${res.status}`);
      }
      // Fire-and-forget product analytics + canonical funnel step.
      try {
        getLoadedBrowserPostHog()?.capture("digest_subscribe", {
          cadence,
          source: "digest_banner",
          surface: "/you/alerts",
        });
      } catch {
        // analytics must never throw upstream
      }
      // S5.B.5 — digest_subscribed step in the alert-activation funnel.
      captureFunnelStep({
        step: "digest_subscribed",
        flow: "alert-activation",
        cadence,
        source: "digest_banner",
      });
      toast.info(
        cadence === "daily"
          ? "Daily digest scheduled — first email at 9am your time."
          : "Weekly digest scheduled — Sunday 9am your time.",
      );
      setHidden(true);
    } catch (err) {
      console.warn("[DigestBanner] subscribe failed", err);
      toast.info(
        "Couldn't update digest preference. Please try the Global Preferences panel below.",
      );
    } finally {
      setBusy(null);
    }
  }

  function dismiss() {
    setDismissalCookie();
    setHidden(true);
  }

  return (
    <div
      className="mb-6 rounded-[2px] px-4 py-3"
      style={{
        background: "var(--v3-bg-050)",
        border: "1px solid var(--v3-line-200)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--v3-ink-300)" }}
          >
            {"// DIGEST · GET A RECAP"}
          </div>
          <div
            className="mt-1 text-sm leading-snug"
            style={{ color: "var(--v3-ink-100)" }}
          >
            Want a daily or weekly recap of your watchlist events? One email,
            no extra clicks — change anytime in Global Preferences below.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void subscribe("daily")}
            disabled={busy !== null}
            className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
            style={{
              background: "var(--v3-acc-soft, var(--v3-bg-075))",
              border: "1px solid var(--v3-line-200)",
              color: "var(--v3-acc, var(--v3-ink-100))",
              fontWeight: 500,
            }}
          >
            {busy === "daily" ? "…" : "DAILY"}
          </button>
          <button
            type="button"
            onClick={() => void subscribe("weekly")}
            disabled={busy !== null}
            className="inline-flex items-center rounded-[2px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
            style={{
              background: "var(--v3-acc-soft, var(--v3-bg-075))",
              border: "1px solid var(--v3-line-200)",
              color: "var(--v3-acc, var(--v3-ink-100))",
              fontWeight: 500,
            }}
          >
            {busy === "weekly" ? "…" : "WEEKLY"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy !== null}
            className="inline-flex items-center rounded-[2px] px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
            style={{
              background: "transparent",
              border: "1px solid var(--v3-line-200)",
              color: "var(--v3-ink-300)",
            }}
            aria-label="Dismiss digest prompt"
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}

export default DigestBanner;
