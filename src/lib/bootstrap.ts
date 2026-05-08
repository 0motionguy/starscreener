// StarScreener — bootstrap side-effects.
//
// Imported once from `src/app/layout.tsx` so env validation runs exactly
// once per server boot. This file exists as a standalone module (instead of
// inlining the import in layout.tsx) so any future boot steps (telemetry,
// tracing init, singleton warm-up) have a single place to land.

import { env } from "./env";
import { ensureReady } from "./pipeline/pipeline";

// Touch `env` so tree-shaking keeps the validation side-effect. The actual
// throwing happens inside env.ts when the module is first evaluated.
void env;

// Fire-and-forget pipeline warm-up. Until the split landed, every page
// render paid for `pipeline.ensureReady()` inside `buildSidebarData`,
// which serialised hydration of the alert/repo stores against the
// critical path. Now we kick the (idempotent) hydrate exactly once per
// boot so the FIRST request and everyone after finds the pipeline ready.
//
// `ensureReady` already de-dupes via an internal in-flight promise, so
// repeat boot-time imports are safe. Errors are swallowed here on
// purpose — the route handlers that read pipeline state still call
// `pipeline.ensureReady()` themselves and will surface the failure
// loudly if it actually matters for that request.
function warmupInBackground(): void {
  void ensureReady().catch((err) => {
    console.warn(
      "[bootstrap] pipeline.ensureReady failed during warmup; degrading silently:",
      err,
    );
  });
}

warmupInBackground();
