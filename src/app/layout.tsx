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
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { Toaster } from "sonner";

// MUST be first import — validates env on server boot.
import "@/lib/bootstrap";

// Web fonts — bound to CSS vars consumed by public/shell.css.
// See docs/DESIGN-SYSTEM.md §3 (Typography) for the full contract.
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-space-grotesk",
});

import { StoreProvider } from "@/components/providers/StoreProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { PostHogIdentifyBridge } from "@/components/analytics/PostHogIdentifyBridge";
import { PostHogPageviewBridge } from "@/components/analytics/PostHogPageviewBridge";
import ClerkRefHandoff from "@/components/auth/ClerkRefHandoff";
import SessionBridge from "@/components/auth/SessionBridge";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { IdleMount } from "@/components/util/IdleMount";

import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { Ticker } from "@/components/shell/Ticker";
import { Statusbar } from "@/components/shell/Statusbar";
import { AskDock } from "@/components/ask/AskDock";
import { MobileAppChrome } from "@/components/mobile/MobileAppChrome";

// A5 (2026-05-27): refreshing the registry at the root layout keeps the
// Statusbar count consistent across every route, not just `/`. The refresh
// is 30s-rate-limited + in-flight-deduped inside createPayloadReader, so
// calling it on every page render is near-free. Without this, navigating
// to e.g. /pricing showed the bundled-data fallback count instead of the
// registry-inclusive count.
import { refreshRepoRegistryFromStore } from "@/lib/derived-repos/loaders/registry";
import { refreshRecentDropsFromStore } from "@/lib/recent-drops";
import { waitForNonCriticalRefreshes } from "@/lib/noncritical-refresh-deadline";

import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { buildAuthHref } from "@/lib/auth/redirect-url";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";
import {
  buildOrganizationJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";

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
  // Extend under the notch / home indicator so the mobile app shell can pad
  // itself with env(safe-area-inset-*). No effect on desktop or non-notched.
  viewportFit: "cover",
  themeColor: "#08090a",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Keep the Statusbar count fresh across every route (A5).
  // Warm the recent-drops cache so the global Ticker can surface freshly-listed
  // /drop repos as NEW. 30s-rate-limited + deduped inside, so it's near-free.
  await waitForNonCriticalRefreshes(
    [
      refreshRepoRegistryFromStore(),
      refreshRecentDropsFromStore(),
    ],
    "root layout warmups",
  );

  const clerkPublishableKey = getClerkPublishableKey();
  // Mobile app shell (bottom nav + sheets). Flag-gated for rollout; when off,
  // desktop + the current hamburger drawer render byte-identical.
  const mobileAppEnabled =
    process.env.NEXT_PUBLIC_TRENDINGREPO_MOBILE_APP_V1 === "1";

  const appChrome = (
    <>
      <IdleMount>
        <ClerkRefHandoff />
      </IdleMount>
      <div className="app">
        <Sidebar />
        <Topbar authEnabled={Boolean(clerkPublishableKey)} />
        <Ticker />
        <main className="main" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Statusbar />
      </div>
      {mobileAppEnabled ? <MobileAppChrome /> : null}
      <ConsentBanner />
      <IdleMount>
        <AskDock />
      </IdleMount>
    </>
  );

  return (
    <html
      lang="en"
      className={`dark ${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      data-theme="orange"
      suppressHydrationWarning
    >
      <head>
        {/* shell.css owns the v6 design tokens (--bg, --accent, --surface, etc.) */}
        <link rel="stylesheet" href="/shell.css" />
        {/* Sitewide Organization graph — publisher identity + E-E-A-T signal
            inherited by every page for search + answer engines. */}
        <JsonLd data={buildOrganizationJsonLd()} />
        {/* Sitewide WebSite graph — drives Google's "Site name" SERP feature
            and the sitelinks hierarchy. No SearchAction because the site has
            no user-facing /search?q= results page. */}
        <JsonLd data={buildWebsiteJsonLd()} />
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
                signInUrl={buildAuthHref("/sign-in", "/account")}
                signUpUrl={buildAuthHref("/sign-up", "/account")}
                signInFallbackRedirectUrl="/account"
                signUpFallbackRedirectUrl="/account"
                afterSignOutUrl="/"
              >
                <SessionBridge />
                {appChrome}
              </ClerkProvider>
            ) : (
              appChrome
            )}
          </StoreProvider>
        </PostHogProvider>
        {/* shell.js handles sparklines, clock, sidebar drawer, share menus, repo hover preview, etc. */}
        <Script src="/shell.js" strategy="afterInteractive" />
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
