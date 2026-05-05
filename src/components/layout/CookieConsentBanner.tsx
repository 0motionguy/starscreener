"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CONSENT_KEY = "trendingrepo-cookie-consent-v1";
const CONSENT_EVENT = "trendingrepo:cookie-consent-changed";

type ConsentValue = "accepted" | "rejected";

function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CONSENT_KEY);
  return raw === "accepted" || raw === "rejected" ? raw : null;
}

function writeConsent(value: ConsentValue): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(
    new CustomEvent(CONSENT_EVENT, {
      detail: { value },
    }),
  );
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-3 z-[90] px-3 sm:bottom-4 sm:px-4">
      <div className="mx-auto max-w-4xl rounded-xl border border-white/15 bg-zinc-950/95 p-4 text-zinc-100 shadow-2xl backdrop-blur">
        <p className="text-sm leading-relaxed">
          We use essential cookies to keep TrendingRepo working and optional
          analytics cookies to improve the product. You can accept or reject
          optional cookies.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              writeConsent("accepted");
              setVisible(false);
            }}
            className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
          >
            Accept optional cookies
          </button>
          <button
            type="button"
            onClick={() => {
              writeConsent("rejected");
              setVisible(false);
            }}
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
          >
            Reject optional cookies
          </button>
          <Link
            href="/privacy"
            className="ml-auto text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

