import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
// Trimmed to 3 actively-rendered fonts (Geist sans, Geist Mono, Space
// Grotesk display). Inter and JetBrains Mono lived only as CSS-fallback
// strings in globals.css after `var(--font-geist*)` and never painted
// when geist loaded successfully — dropping the next/font loads saves
// ~60 KB of font payload + 2 <link rel="preload"> head entries. The
// named "Inter" / "JetBrains Mono" strings remain in the font-family
// chains so locally-installed copies still work as system fallbacks.
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
// Validate environment variables at server boot. Must stay first so misconfig
// crashes the app before any routes load.
import "@/lib/bootstrap";
import { ToasterLazy } from "@/components/feedback/ToasterLazy";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { PostHogIdentifyBridge } from "@/components/analytics/PostHogIdentifyBridge";
import { PostHogPageviewBridge } from "@/components/analytics/PostHogPageviewBridge";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { SidebarStream } from "@/components/layout/SidebarStream";
import { SidebarSkeleton } from "@/components/layout/SidebarSkeleton";
import ClerkRefHandoff from "@/components/auth/ClerkRefHandoff";
import SessionBridge from "@/components/auth/SessionBridge";
import { WelcomeModalGate } from "@/components/onboarding/WelcomeModalGate";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import { getClerkPublishableKey } from "@/lib/auth/clerk-config";
import { buildAuthHref } from "@/lib/auth/redirect-url";
// MobileDrawer is deferred via a thin client wrapper so framer-motion (the
// drawer's biggest dep, ~30 kB gzipped) lands in its own chunk instead of
// the shared bundle. The win propagates to every route. The wrapper file
// exists because Server Components can't pass ssr:false to next/dynamic.
import { MobileDrawerLazy } from "@/components/layout/MobileDrawerLazy";
import { MobileNavLazy } from "@/components/layout/MobileNavLazy";
import { SidebarUserOverlayBridge } from "@/components/layout/SidebarUserOverlayBridge";
import { BrowserAlertBridgeLazy } from "@/components/alerts/BrowserAlertBridgeLazy";
import { GlobalShortcutsLazy } from "@/components/layout/GlobalShortcutsLazy";
import { PageOperatorPanel } from "@/components/page-operator/PageOperatorPanel";
import { AgentQaBridgeLoader } from "@/components/agent-qa/AgentQaBridgeLoader";
import { IdleMount } from "@/components/util/IdleMount";
import { DesignSystemProvider } from "@/components/v3/DesignSystemProvider";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";
import "./globals.css";
import "@/components/layout/header.css";
import "@/components/layout/sidebar-profile.css";
import "@/components/layout/sidebar-nav.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  // Only 400 (default body), 600 (font-semibold), and 700 (font-bold)
  // are referenced via `font-display` utilities — 500 was unused.
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "trending repos",
    "GitHub trending",
    "open source trending",
    "trending open source",
    "Reddit trending",
    "Hacker News trending",
    "ProductHunt",
    "Bluesky",
    "dev.to",
    "MCP",
    "CLI",
    "AI repos",
    "developer tools",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} preview`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/og-card.png"],
  },
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": [
        { url: "/feeds/breakouts.xml", title: `${SITE_NAME} — Cross-signal breakout repos` },
        { url: "/feeds/funding.xml", title: `${SITE_NAME} — Open-source funding signals` },
      ],
    },
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    yandex: process.env.YANDEX_VERIFICATION,
    other: {
      "msvalidate.01": process.env.BING_SITE_VERIFICATION ?? "",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08090a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sidebar shell is now built inside <SidebarStream /> behind a
  // <Suspense> boundary. The 13 data-store refresh hooks fanned out by
  // getPublicSidebarShell() used to block the layout's RSC stream on
  // every page (~4.2s cold TTFB). Deferring lets `{children}` paint
  // first and the sidebar streams in as a follow-up flight.
  //
  // The shell is anonymous-safe: NO `pipeline.ensureReady()`, NO
  // user-keyed fields. Per-user data (`unreadAlerts`) still lands
  // client-side via <SidebarUserOverlayBridge />, gated on Clerk's
  // session. If the shell build throws, SidebarStream passes
  // `initialShell={null}` and the client <Sidebar> recovers via its
  // own fetch.
  const clerkPublishableKey = getClerkPublishableKey();
  const appChrome = (
    <>
      <IdleMount>
        <ClerkRefHandoff />
      </IdleMount>
      <WelcomeModalGate authEnabled={Boolean(clerkPublishableKey)} />
      <Header authEnabled={Boolean(clerkPublishableKey)} />
      <MobileDrawerLazy />
      <AppShell>
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarStream />
        </Suspense>
        <main id="main-content" tabIndex={-1} className="app-main">{children}</main>
      </AppShell>
      <SidebarUserOverlayBridge enabled={Boolean(clerkPublishableKey)} />
      <MobileNavLazy />
      <IdleMount>
        <BrowserAlertBridgeLazy />
      </IdleMount>
      <IdleMount>
        <GlobalShortcutsLazy />
      </IdleMount>
      {process.env.NEXT_PUBLIC_TRENDINGREPO_AGENTIC_MODE === "1" ? (
        <PageOperatorPanel />
      ) : null}
      {/* Dev-only Agent QA bridge; self-gates on NODE_ENV +
          NEXT_PUBLIC_TRENDINGREPO_AGENT_QA_ENABLED and renders null. */}
      <AgentQaBridgeLoader />
      <ToasterLazy />
      <ConsentBanner />
    </>
  );

  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Reads the new key first, falls back to the legacy
            // "starscreener-*" entries for one release so existing users
            // don't lose state. Migrates the value forward so subsequent
            // reads (Zustand persist middleware, browser alerts) find it
            // on the new key next render. V4 is dark-only, so no theme key
            // is migrated and the document class is always `dark`.
            __html: `(function(){try{var r=document.documentElement;r.classList.add("dark");var MIG="trendingrepo-migrated-v1";if(!localStorage.getItem(MIG)){var pairs=[["trendingrepo-watchlist","starscreener-watchlist"],["trendingrepo-compare","starscreener-compare"],["trendingrepo-filters","starscreener-filters"],["trendingrepo-sidebar","starscreener-sidebar"],["trendingrepo-browser-alerts-enabled","starscreener-browser-alerts-enabled"],["trendingrepo-browser-alerts-seen","starscreener-browser-alerts-seen"],["trendingrepo-browser-alerts-changed","starscreener-browser-alerts-changed"]];for(var i=0;i<pairs.length;i++){var nk=pairs[i][0],ok=pairs[i][1];if(localStorage.getItem(nk)===null){var v=localStorage.getItem(ok);if(v!==null){localStorage.setItem(nk,v);}}}localStorage.setItem(MIG,"1")}}catch(e){document.documentElement.classList.add("dark")}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            // Wallet browser extensions can inject content scripts that reject
            // promises inside every page. In Next dev, those extension-origin
            // rejections trigger the app error overlay even though the app did
            // not throw. Silence only known extension transport failures.
            __html: `(function(){function s(v){try{if(!v)return"";if(typeof v==="string")return v;var p=[];if(v.message)p.push(v.message);if(v.name)p.push(v.name);if(v.stack)p.push(v.stack);if(v.filename)p.push(v.filename);if(v.reason)p.push(s(v.reason));return p.join(" ")}catch(e){return""}}function x(e){var m=s(e)+" "+s(e&&e.reason)+" "+s(e&&e.error)+" "+(e&&e.filename?e.filename:"")+" "+(e&&e.message?e.message:"");return /chrome-extension:\\/\\/|moz-extension:\\/\\/|safari-web-extension:\\/\\//i.test(m)||/MetaMask extension not found|Failed to connect to MetaMask|Could not establish connection\\. Receiving end does not exist|runtime\\.lastError|\\[PHANTOM\\]/i.test(m)}function h(e){if(x(e)){e.preventDefault&&e.preventDefault();e.stopImmediatePropagation&&e.stopImmediatePropagation();return false}}window.addEventListener("error",h,true);window.addEventListener("unhandledrejection",h,true)})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            // Pre-paint bootstrap for data-theme + data-surface so the
            // chosen accent and surface scale apply before first paint
            // (no FOUC). Mirrors getV3Theme/getV3BgTheme defaults but
            // inlined to avoid pulling the v3 module into the head.
            __html: `(function(){try{var ACC_KEY="trendingrepo-v3-accent",SURF_KEY="trendingrepo-v3-surface";var t=localStorage.getItem(ACC_KEY);var palette={orange:["#fb923c","#fdba74","#c2410c","rgba(251,146,60,.14)","rgba(251,146,60,.45)"],blue:["#60a5fa","#93c5fd","#1d4ed8","rgba(96,165,250,.14)","rgba(96,165,250,.45)"],yellow:["#facc15","#fde047","#a16207","rgba(250,204,21,.14)","rgba(250,204,21,.45)"],green:["#4ade80","#86efac","#15803d","rgba(74,222,128,.14)","rgba(74,222,128,.45)"],purple:["#c084fc","#d8b4fe","#7e22ce","rgba(192,132,252,.14)","rgba(192,132,252,.45)"]};if(!t||!palette[t])t="orange";var m=palette[t];var r=document.documentElement;r.dataset.theme=t;r.dataset.v3Accent=t;r.style.setProperty("--v3-acc",m[0]);r.style.setProperty("--v3-acc-hover",m[1]);r.style.setProperty("--v3-acc-dim",m[2]);r.style.setProperty("--v3-acc-soft",m[3]);r.style.setProperty("--v3-acc-glow",m[4]);r.style.setProperty("--color-accent",m[0]);r.style.setProperty("--color-accent-hover",m[1]);r.style.setProperty("--color-accent-dim",m[2]);r.style.setProperty("--color-accent-soft",m[3]);r.style.setProperty("--color-accent-glow",m[4]);r.style.setProperty("--v2-acc",m[0]);r.style.setProperty("--v2-acc-hover",m[1]);r.style.setProperty("--v2-acc-soft",m[3]);r.style.setProperty("--v2-acc-glow",m[4]);r.style.setProperty("--v2-acc-dim",m[2]);r.style.setProperty("--color-brand",m[0]);r.style.setProperty("--color-brand-hover",m[1]);r.style.setProperty("--color-brand-active",m[2]);r.style.setProperty("--color-border-focus",m[0]);var s=localStorage.getItem(SURF_KEY);if(s!=="sm"&&s!=="md"&&s!=="lg")s="md";r.dataset.surface=s;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {/* A11Y: Skip-to-content link for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-[100] focus:px-4 focus:py-2"
          style={{
            background: "var(--v4-acc)",
            color: "var(--v4-bg-025)",
            fontWeight: "bold",
          }}
        >
          Skip to main content
        </a>
        <PostHogProvider>
          <Suspense fallback={null}>
            <PostHogPageviewBridge />
          </Suspense>
          <PostHogIdentifyBridge />
          <StoreProvider>
            <DesignSystemProvider>
              {clerkPublishableKey ? (
                <ClerkProvider
                  publishableKey={clerkPublishableKey}
                  appearance={clerkAppearance}
                  signInUrl={buildAuthHref("/sign-in", "/you")}
                  signUpUrl={buildAuthHref("/sign-up", "/you")}
                  afterSignOutUrl="/"
                >
                  <SessionBridge />
                  {appChrome}
                </ClerkProvider>
              ) : (
                appChrome
              )}
            </DesignSystemProvider>
          </StoreProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
