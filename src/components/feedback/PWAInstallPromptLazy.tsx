"use client";

// Defers the PWA install prompt component so the listener+UI ship in
// their own chunk and never block initial paint. The prompt only renders
// when the browser fires `beforeinstallprompt`, which is post-hydration
// by definition — same lazy pattern as ToasterLazy / MobileDrawerLazy.

import dynamic from "next/dynamic";

const PWAInstallPrompt = dynamic(
  () => import("./PWAInstallPrompt").then((m) => ({ default: m.PWAInstallPrompt })),
  { ssr: false },
);

export function PWAInstallPromptLazy() {
  return <PWAInstallPrompt />;
}
