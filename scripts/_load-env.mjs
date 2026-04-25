// Optional .env.local loader.
//
// Local dev needs `.env.local` parsed before scripts read `process.env.X`.
// `@next/env` is the cleanest way to do that, but it's a dev-time dependency
// that isn't always installed in lean CI environments (e.g. the
// `scrape-trending.yml` job runs scripts directly with `node` and skips
// `npm ci` to keep cron latency low). When the package is missing we fall
// through silently — `process.env.X` is the source of truth in CI, and
// GitHub Actions injects secrets directly into the process env.
//
// Background: this used to be a hard `import nextEnv from "@next/env"`. That
// silently killed `scrape-reddit.mjs` for ~2 days when paired with
// `continue-on-error: true` on the workflow step. Tolerant import + an
// audible warn means the next time `@next/env` goes missing we see it but
// the cron still does its job.

try {
  // Dynamic import returns the module namespace, not the default export.
  // `@next/env` only exposes `default`, so `loadEnvConfig` lives on
  // `.default.loadEnvConfig`. Verified empirically:
  //   `keys: ['default']`, `default? object`, `loadEnvConfig? undefined`.
  const nextEnv = await import("@next/env");
  const loader = nextEnv.default?.loadEnvConfig ?? nextEnv.loadEnvConfig;
  if (typeof loader === "function") {
    loader(process.cwd());
  }
} catch (err) {
  const code = (err && typeof err === "object" && "code" in err)
    ? err.code
    : null;
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
    // Expected in CI environments without dev dependencies installed.
    // Don't warn here — this is the documented fall-through path and
    // chatty noise on every cron tick is worse than silence.
  } else {
    // Any other failure is a real problem (corrupt .env.local, syntax
    // error, etc.) and the operator deserves to see it on stderr.
    console.warn(
      `[_load-env] Unexpected error loading @next/env: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
