"use client";

// Listens for the browser's `beforeinstallprompt` event and surfaces a
// minimal "Install app" affordance. Chosen-installed/dismissed state
// persists in localStorage so the banner does not re-appear once the
// user has actioned it. Only fires on browsers that emit the event
// (Chromium-based desktop + Android), so iOS Safari users see nothing —
// matching the manifest-only QW-3 scope.

import { useEffect, useState } from "react";

// Minimal subset of the BeforeInstallPromptEvent interface — TypeScript
// DOM lib doesn't ship a typedef for the non-standard event yet.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "trendingrepo-pwa-install-dismissed";

export function PWAInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      window.localStorage.setItem(DISMISS_KEY, "1");
      setEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!evt) return null;

  return (
    <div
      role="dialog"
      aria-label="Install TrendingRepo"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-[2px] border border-[var(--v3-line-200)] bg-[var(--v3-bg-050)] px-4 py-3 shadow-[var(--shadow-popover)]"
    >
      <span className="text-[13px] text-[var(--v3-ink-100)]">
        Install TrendingRepo for quick access
      </span>
      <button
        type="button"
        onClick={async () => {
          await evt.prompt();
          const { outcome } = await evt.userChoice;
          if (outcome === "dismissed") {
            window.localStorage.setItem(DISMISS_KEY, "1");
          }
          setEvt(null);
        }}
        className="rounded-[2px] border border-[var(--v3-acc)] px-2 py-1 text-[12px] text-[var(--v3-acc)] hover:bg-[var(--v3-acc-soft)]"
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss install prompt"
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          setEvt(null);
        }}
        className="text-[var(--v3-ink-300)] hover:text-[var(--v3-ink-100)]"
      >
        ×
      </button>
    </div>
  );
}
