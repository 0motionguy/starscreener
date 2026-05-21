import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import pkg from "./package.json";

// Bundle-size visualization: `npm run analyze` sets ANALYZE=true and runs a
// production build, dumping interactive HTML reports to .next/analyze/.
// No-op on default builds (the wrapper short-circuits when enabled=false).
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

// Note on Windows + OneDrive: this project lives under a synced folder
// and OneDrive can race Turbopack's `.next/static/development/_buildManifest.js.tmp`
// writes on cold-start (ENOENT loops). Two mitigations are baked in:
//   1. We avoid touching `.next` between dev runs (no rm -rf in scripts);
//      once the cache is populated Turbopack rewrites are atomic enough
//      to coexist with OneDrive.
//   2. If you need a clean slate, replace `.next` with a directory
//      junction pointing outside the synced tree:
//        rmdir /S /Q .next
//        mklink /J .next %TEMP%\trendingrepo-next-dev
//      Turbopack's "stay inside project root" check is satisfied because
//      the junction is inside the project; the writes land outside it.
//      Production builds on Vercel ignore the junction (the runner
//      builds on a fresh ext4 lambda).

const nextConfig: NextConfig = {
  // Next 15 bundler optimization: rewrite barrel imports so only the
  // named exports actually used end up in the bundle. lucide-react alone
  // exports ~1.5k icons via a barrel — without this, a naive build can
  // ship hundreds of unused icon modules when any file imports even one
  // icon from it.
  //
  // framer-motion is INTENTIONALLY excluded: its 12.x ESM barrel re-exports
  // from motion-dom/motion-utils break Next 15's RSC chunk graph during the
  // `/_not-found` static prerender (TypeError: Cannot read properties of
  // undefined (reading 'call') at webpack-runtime). lucide-react and recharts
  // are already in Next 15's built-in optimized list — listing them here is
  // a no-op but documents intent and protects against the default-list
  // changing in a future Next minor.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  // Inject the root package.json version into the client bundle as
  // NEXT_PUBLIC_APP_VERSION so any client component can read the release
  // version without re-importing the manifest. Server components import
  // APP_VERSION from `@/lib/app-meta` (same source).
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "opengraph.githubassets.com" },
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
      { protocol: "https", hostname: "unavatar.io" },
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "ph-files.imgix.net" },
      // Hugging Face — platform mark + author/org avatars (CDN). Used by
      // /huggingface/{models,datasets,spaces} via EntityLogo (raw <img>),
      // listed here so any future migration to next/image doesn't break.
      { protocol: "https", hostname: "huggingface.co" },
      { protocol: "https", hostname: "cdn-avatars.huggingface.co" },
    ],
  },
  // Self-contained server bundle for Docker deployment on VPS.
  // Required for `node server.js` standalone runner; Vercel ignores this flag.
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./.data/twitter-*.jsonl"],
    "/api/openapi.json": ["./docs/openapi.json"],
    // /reddit/trending uses readFileSync(data/reddit-all-posts.json) as
    // SSR cold-cache fallback (src/app/reddit/trending/page.tsx:loadBundledFallback).
    // Without this trace the lambda has no copy of the file and the page
    // permanently renders the "Collector unreachable" cold state even when
    // the bundled snapshot has data. Discovered 2026-05-09 — page had been
    // dead since 2026-05-07 because of this missing trace + an empty file.
    "/reddit/trending": ["./data/reddit-all-posts.json"],
  },
  // NOTE: Do NOT add "./.next/**/*" here. It looks redundant (the .next dir
  // is the build output, not source) but Next.js resolves trace entries
  // (e.g. ../../chunks/*.js relative to .next/server/app/<route>) into
  // absolute paths under /<repo>/.next/... before applying these globs.
  // Excluding ".next/**/*" therefore strips the route's own server chunk
  // graph from the lambda manifest and prod 500s with
  // "Cannot find module .../page.js" at runtime. Confirmed regression
  // from 290a502.
  outputFileTracingExcludes: {
    "/**": [
      "./.claude/**/*",
      "./.vercel/**/*",
      "./.data/backup*/**/*",
      "./awesome-codex-skills/**/*",
      "./docs/review/**/*",
    ],
  },
  poweredByHeader: false,
  compress: true,
  // src/lib/data-store.ts lazily loads either `@upstash/redis` (REST) or
  // `ioredis` (TCP — Railway native Redis) for the Redis tier, plus Node
  // `fs` for the file-fallback tier. Several reader libs are transitively
  // imported by client components (e.g. SidebarWatchlistPreview pulls
  // @/lib/bluesky for sync getters), so webpack would otherwise fail the
  // client build with "Module not found: Can't resolve 'fs' / 'net' / ...".
  //
  // Stubbing these to false in the client bundle is safe because the Redis
  // refresh hooks are only ever called from server components / route
  // handlers — the relevant code paths are dead in the client bundle.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        // ioredis transitive deps — TCP socket, TLS, DNS, OS info.
        net: false,
        tls: false,
        dns: false,
        os: false,
        crypto: false,
        stream: false,
        zlib: false,
      };
    }
    return config;
  },
  // Turbopack equivalent of the webpack fallback above. `next dev --turbopack`
  // doesn't honor the `webpack:` block, so the same Node-builtin stubs need
  // to be declared here. Without this, importing data-store.ts (which lazily
  // requires ioredis -> dns) from any client component crashes the dev build
  // with "Module not found: Can't resolve 'dns'". `src/lib/empty-module.js`
  // is the Turbopack-idiomatic equivalent of webpack's `dns: false`.
  //
  // Path is resolved relative to project root. The `browser` condition only
  // applies these stubs to client bundles — server bundles see the real
  // Node built-ins as expected. In Next.js 15.5 the conditional resolveAlias
  // (Record<string, Record<string,string>>) is recognized.
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/lib/empty-module.js" },
      path: { browser: "./src/lib/empty-module.js" },
      net: { browser: "./src/lib/empty-module.js" },
      tls: { browser: "./src/lib/empty-module.js" },
      dns: { browser: "./src/lib/empty-module.js" },
      os: { browser: "./src/lib/empty-module.js" },
      crypto: { browser: "./src/lib/empty-module.js" },
      stream: { browser: "./src/lib/empty-module.js" },
      zlib: { browser: "./src/lib/empty-module.js" },
    },
  },
  // Ioredis + Upstash Redis are server-only Redis clients. Marking them as
  // serverExternalPackages tells Next not to bundle them on the server (they
  // resolve as Node externals at runtime), which also keeps their transitive
  // `require("dns")`/`require("net")` calls from being scanned during the
  // server build. Client bundles still have the resolveAlias stub above.
  serverExternalPackages: ["ioredis", "@upstash/redis"],
  // Canonical host = apex (trendingrepo.com). Every other host attached to
  // this project 308s to the apex so Google + shared links consolidate on
  // one URL. The redirect ships with the build, so there's no DNS/dashboard
  // coupling — if we add a host, add it here.
  //
  // Beyond host canonicalization, this block carries the v6 legacy-URL map:
  // ~85 routes that lived on live (pre-v6) trendingrepo.com but were folded,
  // renamed, or retired in v6. Tiered by intent:
  //   T1 — direct v6 equivalent at a renamed path (308 permanent)
  //   T2 — subsumed by a v6 hub page (308)
  //   T3 — per-source aggregator → /market-signals?src=<id> (308; the cross-
  //        source newsroom replaces them all)
  //   T4 — retired marketing pages → / (308; the legacy URLs are not coming
  //        back at the old paths)
  //   T5 — dynamic categories/collections → / (302 temporary; we may rebuild
  //        these as a separate surface and want flexibility to relocate)
  // Why 308 vs 302: 308 preserves method+body and is cached aggressively by
  // browsers/Google; only use it when the new home is permanent. The dynamic
  // category/collection roll-ups are speculative — keep as 302 until we
  // commit to a final IA for them.
  async redirects() {
    return [
      // ---- Host canonicalization ------------------------------------------
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.trendingrepo.com" }],
        destination: "https://trendingrepo.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "starscreener.vercel.app" }],
        destination: "https://trendingrepo.com/:path*",
        permanent: true,
      },

      // ---- T1 — Direct v6 equivalents at renamed paths --------------------
      // The page exists in v6 at a new path — 308 preserves SEO equity and
      // bookmarks land on the working surface in one hop.
      { source: "/top10", destination: "/tools/top-10", permanent: true },
      { source: "/top", destination: "/tools/top-10", permanent: true },
      { source: "/tierlist", destination: "/tools/tier-list", permanent: true },
      { source: "/compare", destination: "/tools/compare", permanent: true },
      { source: "/digest", destination: "/tools/digest", permanent: true },
      { source: "/star-history", destination: "/tools/star-history", permanent: true },
      { source: "/treemap", destination: "/tools/treemap", permanent: true },
      // Live used plural /breakouts; v6 normalized to singular /breakout.
      // The singular page exists at src/app/breakout/page.tsx (verified
      // 2026-05-21) so there's no collision with this redirect's target.
      { source: "/breakouts", destination: "/breakout", permanent: true },
      { source: "/signals", destination: "/market-signals", permanent: true },
      // /githubrepo + /trends were marketing aliases that landed on the
      // homepage feed.
      { source: "/githubrepo", destination: "/", permanent: true },
      { source: "/trends", destination: "/", permanent: true },

      // ---- T2 — Subsumed by v6 hub pages ----------------------------------
      { source: "/skills", destination: "/tools", permanent: true },
      { source: "/agent-repos", destination: "/agent-commerce", permanent: true },
      { source: "/papers", destination: "/", permanent: true },
      { source: "/research", destination: "/", permanent: true },
      // Consensus-style breakout signal lives inside /breakout in v6.
      { source: "/consensus", destination: "/breakout", permanent: true },

      // ---- T3 — Per-source aggregators → /market-signals?src=<id> --------
      // The cross-source newsroom carries a src filter; mapping each legacy
      // aggregator to its filtered view preserves intent. Both bare and
      // /trending child paths fold into the same filter.
      { source: "/hackernews", destination: "/market-signals?src=hn", permanent: true },
      { source: "/hackernews/trending", destination: "/market-signals?src=hn", permanent: true },
      { source: "/reddit", destination: "/market-signals?src=reddit", permanent: true },
      { source: "/reddit/trending", destination: "/market-signals?src=reddit", permanent: true },
      { source: "/twitter", destination: "/market-signals?src=twitter", permanent: true },
      { source: "/bluesky", destination: "/market-signals?src=bluesky", permanent: true },
      { source: "/bluesky/trending", destination: "/market-signals?src=bluesky", permanent: true },
      { source: "/devto", destination: "/market-signals?src=devto", permanent: true },
      { source: "/lobsters", destination: "/market-signals?src=lobsters", permanent: true },
      { source: "/producthunt", destination: "/market-signals?src=producthunt", permanent: true },
      { source: "/npm", destination: "/market-signals?src=npm", permanent: true },
      // Hugging Face had three sub-surfaces (models is the default
      // /huggingface route, plus /datasets and /spaces). All collapse into
      // the same filtered view — the src filter is per-source, not
      // per-sub-surface.
      { source: "/huggingface", destination: "/market-signals?src=huggingface", permanent: true },
      { source: "/huggingface/trending", destination: "/market-signals?src=huggingface", permanent: true },
      { source: "/huggingface/datasets", destination: "/market-signals?src=huggingface", permanent: true },
      { source: "/huggingface/spaces", destination: "/market-signals?src=huggingface", permanent: true },
      { source: "/arxiv", destination: "/market-signals?src=arxiv", permanent: true },
      { source: "/arxiv/trending", destination: "/market-signals?src=arxiv", permanent: true },
      // MCP registry was an agent-tooling aggregator → agent-commerce hub.
      { source: "/mcp", destination: "/agent-commerce", permanent: true },

      // ---- T4 — Retired marketing pages → / ------------------------------
      // No v6 replacement; the legacy URLs are not coming back at these paths.
      { source: "/about", destination: "/", permanent: true },
      { source: "/contact", destination: "/", permanent: true },
      // /submit was the repo-submission flow; v6 renamed it /drop.
      { source: "/submit", destination: "/drop", permanent: true },
      { source: "/methodology", destination: "/", permanent: true },
      // NOTE: /docs is deliberately NOT redirected. It is a live route
      // handler (src/app/docs/route.ts) that 307s to /reference.html for
      // the Redoc API reference. Adding a redirect here would shadow it
      // and break the public API docs.
      { source: "/search", destination: "/", permanent: true },

      // ---- T5 — Dynamic categories/collections → / (302 temporary) -------
      // Categories had 14 detail routes and collections had 48 — too granular
      // to enumerate. Keep these 302 so we can repoint to a rebuilt surface
      // without waiting for browser caches to expire.
      { source: "/categories", destination: "/", permanent: false },
      { source: "/categories/:slug", destination: "/", permanent: false },
      { source: "/collections", destination: "/", permanent: false },
      { source: "/collections/:slug", destination: "/", permanent: false },

      // ---- Legacy: /news → /market-signals --------------------------------
      // Previously pointed at /signals; that hop is gone in v6 — the cross-
      // source newsroom lives at /market-signals. Collapsing the sub-tabs
      // (?tab=hackernews etc.) into the unfiltered newsroom is acceptable
      // because the src filter is exposed in the UI.
      { source: "/news", destination: "/market-signals", permanent: true },
      { source: "/news/:path*", destination: "/market-signals", permanent: true },
    ];
  },
  // Baseline security headers applied to every route. HSTS is deliberately
  // omitted here — it is delivered by Vercel's platform layer for the
  // trendingrepo.com apex, and re-asserting it from the app would risk a
  // weaker `max-age` if this file drifted ahead of platform defaults. The
  // existing Cache-Control headers on ISR routes are also untouched; only
  // additive policy headers are listed below.
  //
  // CSP allowlist rationale:
  //   - script-src: `'unsafe-inline'` covers the inline pre-paint bootstrap
  //     and storage-migration shims in `src/app/layout.tsx`. `'unsafe-eval'`
  //     is needed by a small subset of dynamic-import vendors (ECharts
  //     option compilation, recharts in dev). `*.clerk.dev` /  `*.clerk.com`
  //     cover Clerk dev/preview instances; `clerk.trendingrepo.com` is the
  //     production Frontend API CNAME (it serves `clerk.browser.js` and
  //     does not match the `*.clerk.com` wildcard). Clerk loads Cloudflare
  //     Turnstile inline as a bot challenge, hence `challenges.cloudflare.com`.
  //     `*.vercel-analytics.com` is allow-listed proactively so we can opt in
  //     to Vercel Analytics later without another CSP roll.
  //   - style-src: `fonts.googleapis.com` is needed because the Clerk widget
  //     runtime injects `<link rel="stylesheet" href="…fonts.googleapis.com…">`
  //     for the Inter face it uses inside the SignIn / UserButton chrome —
  //     this happens after clerk.browser.js boots, regardless of our own
  //     `next/font/google` self-hosting.
  //   - font-src: `fonts.gstatic.com` is the actual woff2 host that the
  //     above Google Fonts CSS references.
  //   - worker-src 'self' blob: is required by Clerk for in-flight session
  //     token rotation; without it, signed-in sessions throw a CSP warning
  //     in the console and Clerk falls back to a slower main-thread path.
  //   - connect-src: `https:` covers PostHog (us.i.posthog.com), Sentry
  //     (which actually tunnels through our same-origin /api/_sentry-tunnel
  //     so this is belt-and-braces), Clerk's FAPI on the custom CNAME, and
  //     the various JSON APIs the client hits. `wss:` covers any future
  //     websocket transport (none active today). `data:` is needed for
  //     blob-source EventStreams used by the markdown renderer.
  //   - frame-src: Clerk SignIn renders Turnstile inside an iframe served
  //     from `challenges.cloudflare.com`; without it the bot challenge fails
  //     to load and signups stall. Clerk hosted pages (`*.clerk.com`,
  //     `*.clerk.dev`) embed account-management surfaces.
  //   - img-src: `https:` + `data:` + `blob:` covers GitHub/Twitter/PH
  //     avatars (already enumerated in `images.remotePatterns`), data-URI
  //     SVG icons, and `URL.createObjectURL()` previews.
  //   - frame-ancestors 'none' is the X-Frame-Options DENY equivalent; both
  //     are emitted because some scanners only check the legacy header.
  async headers() {
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: https: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.dev https://*.clerk.com https://clerk.trendingrepo.com https://challenges.cloudflare.com https://*.vercel-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "worker-src 'self' blob:",
      "connect-src 'self' https: wss: data:",
      "frame-src 'self' https://*.clerk.dev https://*.clerk.com https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.clerk.dev https://*.clerk.com",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(), microphone=(), camera=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

// Sentry wrap — outermost so source-map upload + auto-instrumentation
// run after bundle analyzer + base config. SENTRY_AUTH_TOKEN gates the
// upload (set in CI / Vercel prod build env only).
//
// Migrated to @sentry/nextjs ≥10 shape: disableLogger and
// automaticVercelMonitors moved under the new `webpack` namespace
// (the wizard's defaults still emit the deprecation warnings on every
// build until this lands).
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  tunnelRoute: "/api/_sentry-tunnel",
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
};

// Skip Sentry's Next plugin wrap during local `next dev` (Turbopack 15.5
// + @sentry/nextjs 10.50 produces a MODULE_UNPARSABLE stub for the
// instrumentation hook even on a no-op source file). Production builds on
// Vercel run with NODE_ENV=production via webpack and are unaffected; the
// Sentry runtime config files (sentry.{server,edge,client}.config.ts)
// still init at boot when SENTRY_DSN is set.
const wrapped = withBundleAnalyzer(nextConfig);
export default process.env.NODE_ENV === "production"
  ? withSentryConfig(wrapped, sentryWebpackPluginOptions)
  : wrapped;
