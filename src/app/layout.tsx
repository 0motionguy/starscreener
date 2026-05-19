/* eslint-disable @next/next/no-css-tags -- public/shell.css is the current HTML handoff stylesheet. */

// Root layout — UI v4 dismantled 2026-05-19; first rebuilt HTML shell mounted.
//
// The data spine (src/lib, src/app/api, middleware, collectors) is fully alive.
// Legacy visual chrome (Header, Sidebar, AppShell, MobileNav, MobileDrawer,
// every styled component) has been archived to _archive/ui-v4/.
//
// What stays here:
//   - Env bootstrap (server-side validation)
//   - ClerkProvider (auth wraps when publishable key is set)
//   - StoreProvider (Zustand hydration)
//   - PostHog analytics + Clerk handoff + consent banner
//   - New shell/{Sidebar,Topbar,Ticker,Statusbar} + public shell.css/js
//
// What's intentionally removed:
//   - Legacy Header, AppShell, MobileDrawer/MobileNav
//   - V3 accent picker / theme bootstrap (DesignSystemProvider)
//   - Toaster + browser-alert bridge (rebuild later if needed)
//   - WelcomeModal (onboarding flow — rebuild later)
//   - Localstorage migration script (already ran on existing users)
//
// See docs/UI-REBUILD-CONTRACT.md for the surfaces the new UI must reconnect to.

import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Suspense } from "react";

// MUST be first import — validates env on server boot.
import "@/lib/bootstrap";

import { StoreProvider } from "@/components/providers/StoreProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { PostHogIdentifyBridge } from "@/components/analytics/PostHogIdentifyBridge";
import { PostHogPageviewBridge } from "@/components/analytics/PostHogPageviewBridge";
import ClerkRefHandoff from "@/components/auth/ClerkRefHandoff";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { IdleMount } from "@/components/util/IdleMount";

import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { Ticker } from "@/components/shell/Ticker";
import { Statusbar } from "@/components/shell/Statusbar";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { buildAuthHref } from "@/lib/auth/redirect-url";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08090a",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const clerkPublishableKey = getClerkPublishableKey();

  const appChrome = (
    <>
      <IdleMount>
        <ClerkRefHandoff />
      </IdleMount>
      <div className="app">
        <Sidebar />
        <Topbar />
        <Ticker />
        <main className="main" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Statusbar />
      </div>
      <ConsentBanner />
    </>
  );

  return (
    <html lang="en" className="dark" data-theme="orange" suppressHydrationWarning>
      <head>
        {/* shell.css owns the v6 design tokens (--bg, --accent, --surface, etc.) */}
        <link rel="stylesheet" href="/shell.css" />
        {/* Silence noisy wallet-extension promise rejections so the Next dev
            overlay doesn't flag them as app errors. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function s(v){try{if(!v)return"";if(typeof v==="string")return v;var p=[];if(v.message)p.push(v.message);if(v.name)p.push(v.name);if(v.stack)p.push(v.stack);if(v.filename)p.push(v.filename);if(v.reason)p.push(s(v.reason));return p.join(" ")}catch(e){return""}}function x(e){var m=s(e)+" "+s(e&&e.reason)+" "+s(e&&e.error)+" "+(e&&e.filename?e.filename:"")+" "+(e&&e.message?e.message:"");return /chrome-extension:\\/\\/|moz-extension:\\/\\/|safari-web-extension:\\/\\//i.test(m)||/MetaMask extension not found|Failed to connect to MetaMask|Could not establish connection\\. Receiving end does not exist|runtime\\.lastError|\\[PHANTOM\\]/i.test(m)}function h(e){if(x(e)){e.preventDefault&&e.preventDefault();e.stopImmediatePropagation&&e.stopImmediatePropagation();return false}}window.addEventListener("error",h,true);window.addEventListener("unhandledrejection",h,true)})();`,
          }}
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-[100] focus:px-4 focus:py-2"
        >
          Skip to main content
        </a>
        <PostHogProvider>
          <Suspense fallback={null}>
            <PostHogPageviewBridge />
          </Suspense>
          <PostHogIdentifyBridge />
          <StoreProvider>
            {clerkPublishableKey ? (
              <ClerkProvider
                publishableKey={clerkPublishableKey}
                appearance={clerkAppearance}
                signInUrl={buildAuthHref("/sign-in", "/you")}
                signUpUrl={buildAuthHref("/sign-up", "/you")}
                afterSignOutUrl="/"
              >
                {appChrome}
              </ClerkProvider>
            ) : (
              appChrome
            )}
          </StoreProvider>
        </PostHogProvider>
        {/* shell.js handles sparklines, clock, sidebar drawer, share menus, repo hover preview, etc. */}
        <Script src="/shell.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
