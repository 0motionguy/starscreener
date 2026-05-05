"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "trendingrepo-pwa-install-dismissed";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function onAppInstalled() {
      setVisible(false);
      setDeferredPrompt(null);
      window.localStorage.setItem(DISMISS_KEY, "1");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setDeferredPrompt(null);
  }

  function dismissPrompt() {
    setVisible(false);
    window.localStorage.setItem(DISMISS_KEY, "1");
  }

  if (!visible || !deferredPrompt) return null;

  return (
    <div
      data-testid="pwa-install-prompt"
      className="fixed inset-x-4 bottom-24 z-[70] sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
    >
      <div
        className="rounded-xl border p-3 shadow-xl backdrop-blur"
        style={{
          borderColor: "var(--v4-border-strong)",
          background: "color-mix(in srgb, var(--v4-bg-000) 92%, black 8%)",
        }}
      >
        <p className="text-sm font-medium" style={{ color: "var(--v4-ink-100)" }}>
          Install TrendingRepo
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--v4-ink-300)" }}>
          Add it to your home screen for a faster app-like experience.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="v3-button h-8 px-3 text-xs" onClick={dismissPrompt}>
            Not now
          </button>
          <button type="button" className="v3-button h-8 px-3 text-xs" onClick={installApp}>
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
