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
    ];
  },
};

export default nextConfig;
