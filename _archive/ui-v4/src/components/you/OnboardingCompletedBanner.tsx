"use client";

// <OnboardingCompletedBanner /> — S5.B.6 celebration card.
//
// Renders on /you when `progress.allDone === true`. Sibling to the
// progress widget — the page picks one or the other depending on state.
//
// Cookie-gated dismissal (`sb_onboarded_celebrated`, 90 days) so the
// banner shows once after completing the three checkpoints, then quietly
// goes away. Avoids permanent "victory lap" clutter for established users.

import { useState } from "react";
import Link from "next/link";

const COOKIE_NAME = "sb_onboarded_celebrated";
const COOKIE_MAX_AGE_DAYS = 90;

function hasCelebratedCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((entry) => entry.trim().startsWith(`${COOKIE_NAME}=`));
}

function setCelebratedCookie(): void {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=1; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

export function OnboardingCompletedBanner() {
  const [hidden, setHidden] = useState<boolean>(hasCelebratedCookie);

  if (hidden) return null;

  function dismiss() {
    setCelebratedCookie();
    setHidden(true);
  }

  return (
    <div
      style={{
        border: "1px solid var(--v4-acc, var(--v4-line-200))",
        borderRadius: 4,
        background:
          "color-mix(in srgb, var(--v4-acc, var(--v4-line-200)) 6%, var(--v4-bg-050))",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            color: "var(--v4-acc, var(--v4-ink-200))",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {"// 00 You're all set"}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss completion banner"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--v4-ink-400)",
            cursor: "pointer",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <h2
        style={{
          fontFamily: "var(--font-geist), Inter, sans-serif",
          fontSize: 20,
          fontWeight: 510,
          letterSpacing: "-0.018em",
          lineHeight: 1.15,
          margin: 0,
          color: "var(--v4-ink-000)",
        }}
      >
        Onboarding complete.
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "var(--v4-ink-200)",
          margin: 0,
        }}
      >
        Alerts wired, digest scheduled, referral link copied. Now invite
        a friend — every qualified signup nudges you toward the operator
        badge.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link
          href="/you/refer"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "8px 12px",
            border: "1px solid var(--v4-acc, var(--v4-line-200))",
            borderRadius: 3,
            color: "var(--v4-acc, var(--v4-ink-100))",
            textDecoration: "none",
            background: "var(--v4-bg-075)",
            fontWeight: 500,
          }}
        >
          INVITE A FRIEND →
        </Link>
        <Link
          href="/you/alerts"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            padding: "8px 12px",
            border: "1px solid var(--v4-line-200)",
            borderRadius: 3,
            color: "var(--v4-ink-200)",
            textDecoration: "none",
            background: "transparent",
          }}
        >
          REVIEW ALERTS
        </Link>
      </div>
    </div>
  );
}

export default OnboardingCompletedBanner;
