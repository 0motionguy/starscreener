import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 15 bundler optimization: rewrite barrel imports so only the
  // named exports actually used end up in the bundle. lucide-react alone
  // exports ~1.5k icons via a barrel — without this, a naive build can
  // ship hundreds of unused icon modules when any file imports even one
  // icon from it. framer-motion + recharts also benefit.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
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
    ],
  },
  // Uncomment for Docker/Railway/Fly deployments that need a self-contained
  // server bundle. Vercel does not require this.
  // output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./.data/twitter-*.jsonl"],
  },
  poweredByHeader: false,
  compress: true,
  // src/lib/data-store.ts (and a handful of *-refresh.ts files) lazily
  // require Node `fs` for the file-fallback tier of the data-store.
  // Several reader libs are transitively imported by client components
  // (e.g. SidebarWatchlistPreview pulls @/lib/bluesky for sync getters),
  // and webpack would otherwise fail the client build with
  // "Module not found: Can't resolve 'fs'". Stubbing fs to false in the
  // client bundle is safe because the refresh hooks are only ever called
  // from server components / route handlers — the fs branch is dead code
  // on the client side.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
      };
    }
    return config;
  },
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
      // /news → /signals: News Terminal was renamed to Signal Terminal and
      // the consolidated /news view replaced by the cross-source /signals
      // aggregator. Config-level redirect emits a real 307 (dev server's
      // App Router redirect() falls back to meta-refresh which breaks
      // CLI / preview tools).
      {
        source: "/news",
        destination: "/signals",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
