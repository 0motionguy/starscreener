// Allow tsx scripts to transitively import @/lib modules that statically
// `import "server-only"` (a Next.js build-time / runtime guard that throws
// when loaded outside a Server Component bundle).
//
// Mechanism: patch `require.cache[server-only]` to an empty CJS module so
// any subsequent ESM/CJS resolution of "server-only" returns {} instead of
// hitting the package's top-level `throw new Error(...)`.
//
// Why a shim instead of removing the guard: hackernews.ts and friends use
// `server-only` to keep client bundles from accidentally pulling 70KB of
// bundled JSON. Removing the guard would lose that bundler-level protection
// at production build time. This shim only intercepts at script-runtime,
// not at Next.js bundle-time.
//
// MUST be the first import in any tsx script that touches @/lib/* modules
// in the server-only chain. Confirmed broken collectors include:
//   - scripts/collect-twitter-signals.ts (failure since the chain landed)

import { createRequire } from "node:module";

const __req = createRequire(import.meta.url);
try {
  const resolved = __req.resolve("server-only");
  // Cast to any: Node's Module type has many required fields, but only
  // `exports` is read by downstream code paths.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __req.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    children: [],
    exports: {},
    paths: [],
    parent: null,
    isPreloading: false,
    path: resolved,
  } as any;
} catch {
  // server-only not installed (unlikely in CI/dev) — nothing to patch.
}

export {};
