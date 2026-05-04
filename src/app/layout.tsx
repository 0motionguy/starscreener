import type { Metadata, Viewport } from "next";
// Trimmed from 4 fonts to 3: Instrument Serif (--font-editorial) was
// defined but not referenced anywhere in src/components or src/app.
// Dropping it saves ~30 KB of font payload + one <link rel="preload">.
import { Geist, Geist_Mono, Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
// Validate environment variables at server boot. Must stay first so misconfig
// crashes the app before any routes load.
import "@/lib/bootstrap";
import { ToasterLazy } from "@/components/feedback/ToasterLazy";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  buildSidebarData,
  type SidebarDataResponse,
} from "@/lib/sidebar-data";
// MobileDrawer is deferred via a thin client wrapper so framer-motion (the
// drawer's biggest dep, ~30 kB gzipped) lands in its own chunk instead of
// the shared bundle. The win propagates to every route. The wrapper file
// exists because Server Components can't pass ssr:false to next/dynamic.
import { MobileDrawerLazy } from "@/components/layout/MobileDrawerLazy";
import { MobileNav } from "@/components/layout/MobileNav";
import { BrowserAlertBridge } from "@/components/alerts/BrowserAlertBridge";
import { DesignSystemProvider } from "@/components/v3";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";
import "./globals.css";
import "@/components/tier-list/tier-list.css";
import "@/components/compare/compare.css";
import "@/components/predict/predict.css";
import "@/components/terminal/terminal-pages.css";
import "@/components/categories/categories.css";

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
    "Model Context Protocol",
    "CLI",
    "AI repos",
    "AI agents",
    "Claude skills",
    "developer tools",
    "open source momentum",
    "github trending alternatives",
    "trendshift alternative",
    "ossinsight alternative",
    "github stars tracker",
    "repo discovery",
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
    site: "@trendingrepo",
    creator: "@0motionguy",
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
      "application/json+oembed": [
        { url: "/api/oembed", title: `${SITE_NAME} oEmbed` },
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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Build the desktop sidebar payload server-side and pass it to <Sidebar>
  // as initialData. Eliminates the post-hydration fetch + skeleton flash
  // that used to delay every desktop page paint. Cap reposById at top-200
  // by momentum: the layout inlines this payload into every page's RSC
  // stream (mobile included, even though the sidebar is desktop-only).
  // The mobile-drawer API path stays uncapped for backward compat — that
  // fetch only fires on user-tap and isn't on any critical path. Wrapped
  // in try/catch so a transient pipeline / data-store hiccup doesn't take
  // the whole site down — if it fails we pass null and Sidebar falls back
  // to its existing client-fetch path.
  let initialSidebarData: SidebarDataResponse | null = null;
  try {
    initialSidebarData = await buildSidebarData({ reposByIdTopN: 200 });
  } catch {
    initialSidebarData = null;
  }

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
            // reads (next-themes, Zustand persist middleware, browser
            // alerts) find it on the new key next render.
            __html: `(function(){try{var MIG="trendingrepo-migrated-v1";if(!localStorage.getItem(MIG)){var pairs=[["trendingrepo-theme","starscreener-theme"],["trendingrepo-watchlist","starscreener-watchlist"],["trendingrepo-compare","starscreener-compare"],["trendingrepo-filters","starscreener-filters"],["trendingrepo-sidebar","starscreener-sidebar"],["trendingrepo-browser-alerts-enabled","starscreener-browser-alerts-enabled"],["trendingrepo-browser-alerts-seen","starscreener-browser-alerts-seen"],["trendingrepo-browser-alerts-changed","starscreener-browser-alerts-changed"]];for(var i=0;i<pairs.length;i++){var nk=pairs[i][0],ok=pairs[i][1];if(localStorage.getItem(nk)===null){var v=localStorage.getItem(ok);if(v!==null){localStorage.setItem(nk,v);}}}localStorage.setItem(MIG,"1")}var t=localStorage.getItem("trendingrepo-theme");if(t==="light")document.documentElement.classList.add("light");else document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})();`,
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
            __html: `(function(){try{var k="trendingrepo-v3-accent",t=localStorage.getItem(k)||"lava",m={lava:["#ff6b35","#ff8458","#c44a1f","rgba(255,107,53,.14)","rgba(255,107,53,.45)"],indigo:["#9297f6","#a8acf8","#555bd8","rgba(146,151,246,.14)","rgba(146,151,246,.45)"],lime:["#def135","#e8fb55","#a9b827","rgba(222,241,53,.14)","rgba(222,241,53,.45)"],cyan:["#3ad6c5","#63e1d3","#26a597","rgba(58,214,197,.14)","rgba(58,214,197,.45)"],magenta:["#e879f9","#f0a2ff","#a855f7","rgba(232,121,249,.14)","rgba(232,121,249,.45)"]}[t]||["#ff6b35","#ff8458","#c44a1f","rgba(255,107,53,.14)","rgba(255,107,53,.45)"],r=document.documentElement;r.dataset.v3Accent=t;r.style.setProperty("--v3-acc",m[0]);r.style.setProperty("--v3-acc-hover",m[1]);r.style.setProperty("--v3-acc-dim",m[2]);r.style.setProperty("--v3-acc-soft",m[3]);r.style.setProperty("--v3-acc-glow",m[4]);r.style.setProperty("--color-accent",m[0]);r.style.setProperty("--color-accent-hover",m[1]);r.style.setProperty("--color-accent-dim",m[2]);r.style.setProperty("--color-accent-soft",m[3]);r.style.setProperty("--color-accent-glow",m[4]);r.style.setProperty("--v2-acc",m[0]);r.style.setProperty("--v2-acc-hover",m[1]);r.style.setProperty("--v2-acc-soft",m[3]);r.style.setProperty("--v2-acc-glow",m[4]);r.style.setProperty("--v2-acc-dim",m[2]);r.style.setProperty("--color-brand",m[0]);r.style.setProperty("--color-brand-hover",m[1]);r.style.setProperty("--color-brand-active",m[2]);r.style.setProperty("--color-border-focus",m[0]);var b=localStorage.getItem("trendingrepo-v3-bg")||"black";r.dataset.bgTheme=b;}catch(e){}})();`,
          }}
        />
        {/* rel=me self-references — verifiable identity links so AI engines and
            Mastodon-class verifiers can confirm the same entity owns these
            profiles. Pairs with Org LD sameAs but lives in <head> per IndieWeb
            convention. Replace handles when real ones are claimed. */}
        <link rel="me" href="https://github.com/0motionguy" />
        <link rel="me" href="https://x.com/0motionguy" />
        <link rel="me" href="https://www.linkedin.com/company/trendingrepo" />
        {/* AI content provenance — declares the page surface as
            primarily-aggregated (signals are scraped from public sources;
            scoring is deterministic; no LLM-generated body copy). Helps AI
            engines weight the page as a primary aggregator rather than a
            content-farm regenerator. */}
        <meta name="ai-content-declaration" content="aggregated" />
        <meta name="content-source" content="primary-aggregator" />
        <meta name="generator" content="TrendingRepo Pipeline / Next.js" />
        {/* Geographic + topical hints — improve entity disambiguation when
            multiple sites share keywords like "trending repos". */}
        <meta name="topic" content="open source software trending discovery" />
        <meta name="audience" content="developers,engineers,maintainers,researchers,investors" />
        <meta name="coverage" content="worldwide" />
        <meta name="distribution" content="global" />
        {/* iOS PWA + crawler hygiene */}
        <meta name="apple-mobile-web-app-title" content="TrendingRepo" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no, email=no, address=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Crawl + indexing hints. `googlebot` overrides include
            `max-image-preview:large` so OG cards render full-size in SERP. */}
        <meta
          name="googlebot"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
        <meta
          name="bingbot"
          content="index, follow, max-image-preview:large, max-snippet:-1"
        />
        {/* Color scheme hints — pairs with the existing themeColor in viewport
            so iOS Safari picks the right system chrome before paint. */}
        <meta name="color-scheme" content="dark light" />
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
        <ThemeProvider>
          <PostHogProvider>
            <StoreProvider>
              <DesignSystemProvider>
              <Header />
              <MobileDrawerLazy />
              <AppShell>
                <Sidebar initialData={initialSidebarData} />
                <main id="main-content" className="app-main">{children}</main>
              </AppShell>
              <MobileNav />
              <BrowserAlertBridge />
              <Toaster
                theme="dark"
                position="bottom-right"
                richColors={false}
                closeButton={false}
                toastOptions={{
                  classNames: {
                    toast:
                      "!bg-[var(--v3-bg-050)] !border !border-[var(--v3-line-200)] !text-[var(--v3-ink-100)] !rounded-[2px] !shadow-[var(--shadow-popover)] !font-sans !text-[13px]",
                    title:
                      "!text-[var(--v3-ink-000)] !font-medium !tracking-[-0.005em]",
                    description: "!text-[var(--v3-ink-300)] !text-[12px]",
                    success:
                      "!border-l-[3px] !border-l-[var(--v3-sig-green)]",
                    error:
                      "!border-l-[3px] !border-l-[var(--v3-sig-red)]",
                    info:
                      "!border-l-[3px] !border-l-[var(--v3-acc)]",
                    warning:
                      "!border-l-[3px] !border-l-[var(--v3-sig-amber)]",
                  },
                }}
              />
              </DesignSystemProvider>
            </StoreProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
