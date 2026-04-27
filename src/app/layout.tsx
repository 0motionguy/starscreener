import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
// Trimmed from 4 fonts to 3: Instrument Serif (--font-editorial) was
// defined but not referenced anywhere in src/components or src/app.
// Dropping it saves ~30 KB of font payload + one <link rel="preload">.
import { Geist, Geist_Mono, Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
// Validate environment variables at server boot. Must stay first so misconfig
// crashes the app before any routes load.
import "@/lib/bootstrap";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { AppShell } from "@/components/layout/AppShell";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { MobileNav } from "@/components/layout/MobileNav";
import { BrowserAlertBridge } from "@/components/alerts/BrowserAlertBridge";
import { DesignSystemProvider } from "@/components/v3";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";
import "./globals.css";

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

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Reads the new key first, falls back to the legacy
            // "starscreener-theme" entry for one release so existing
            // users don't get their theme wiped. Also migrates the value
            // forward so next-themes finds it on the new key next render.
            __html: `(function(){try{var K="trendingrepo-theme",L="starscreener-theme",t=localStorage.getItem(K);if(!t){var old=localStorage.getItem(L);if(old){localStorage.setItem(K,old);t=old;}}if(t==="light")document.documentElement.classList.add("light");else document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})();`,
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
            __html: `(function(){try{var k="trendingrepo-v3-accent",t=localStorage.getItem(k)||"indigo",m={lava:["#f56e0f","#ff8128","#c25608","rgba(245,110,15,.14)","rgba(245,110,15,.45)"],indigo:["#9297f6","#a8acf8","#555bd8","rgba(146,151,246,.14)","rgba(146,151,246,.45)"],lime:["#def135","#e8fb55","#a9b827","rgba(222,241,53,.14)","rgba(222,241,53,.45)"],cyan:["#3ad6c5","#63e1d3","#26a597","rgba(58,214,197,.14)","rgba(58,214,197,.45)"],magenta:["#e879f9","#f0a2ff","#a855f7","rgba(232,121,249,.14)","rgba(232,121,249,.45)"]}[t]||["#9297f6","#a8acf8","#555bd8","rgba(146,151,246,.14)","rgba(146,151,246,.45)"],r=document.documentElement;r.dataset.v3Accent=t;r.style.setProperty("--v3-acc",m[0]);r.style.setProperty("--v3-acc-hover",m[1]);r.style.setProperty("--v3-acc-dim",m[2]);r.style.setProperty("--v3-acc-soft",m[3]);r.style.setProperty("--v3-acc-glow",m[4]);r.style.setProperty("--v2-acc",m[0]);r.style.setProperty("--v2-acc-soft",m[3]);r.style.setProperty("--v2-acc-glow",m[4]);r.style.setProperty("--v2-acc-dim",m[2]);r.style.setProperty("--color-brand",m[0]);r.style.setProperty("--color-brand-hover",m[1]);r.style.setProperty("--color-brand-active",m[2]);r.style.setProperty("--color-border-focus",m[0]);var b=localStorage.getItem("trendingrepo-v3-bg")||"black";r.dataset.bgTheme=b;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <StoreProvider>
            <DesignSystemProvider>
              <Header />
              <MobileDrawer />
              <AppShell>
                <Sidebar />
                <main className="app-main">{children}</main>
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
                      "!bg-bg-card !border !border-border-primary !text-text-primary !rounded-[var(--radius-card)] !shadow-[var(--shadow-popover)] !font-sans",
                    title: "!text-text-primary !font-medium",
                    description: "!text-text-secondary",
                    success: "!border-functional/40",
                    error: "!border-down/40",
                    info: "!border-info/40",
                    warning: "!border-warning/40",
                  },
                }}
              />
            </DesignSystemProvider>
          </StoreProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
