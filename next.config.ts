import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";

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
    ],
  },
  // Uncomment for Docker/Railway/Fly deployments that need a self-contained
  // server bundle. Vercel does not require this.
  // output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./.data/twitter-*.jsonl"],
    "/api/openapi.json": ["./docs/openapi.json"],
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
  async redirects() {
    return [
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
      // /news is now the primary News Terminal (v2-styled tabbed overview).
      // /signals remains the cross-source aggregator.
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

export default withSentryConfig(withBundleAnalyzer(nextConfig), sentryWebpackPluginOptions);
