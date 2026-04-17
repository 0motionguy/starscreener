// StarScreener — bootstrap side-effects.
//
// Imported once from `src/app/layout.tsx` so env validation runs exactly
// once per server boot. This file exists as a standalone module (instead of
// inlining the import in layout.tsx) so any future boot steps (telemetry,
// tracing init, singleton warm-up) have a single place to land.

import { env } from "./env";

// Touch `env` so tree-shaking keeps the validation side-effect. The actual
// throwing happens inside env.ts when the module is first evaluated.
void env;
