import type { Metadata, Viewport } from "next";
// Trimmed from 4 fonts to 3: Instrument Serif (--font-editorial) was
// defined but not referenced anywhere in src/components or src/app.
// Dropping it saves ~30 KB of font payload + one <link rel="preload">.
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
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
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/seo";
import "./globals.css";

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
    { media: "(prefers-color-scheme: dark)", color: "#151419" },
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
      className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
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
      </head>
      <body>
        <ThemeProvider>
          <StoreProvider>
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
          </StoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
