// TrendingRepo — runtime environment validation.
//
// Validates `process.env` at boot using a strict zod schema. Unknown values
// are allowed (Next.js injects many NEXT_* vars) but every variable the app
// reads must be declared here with an explicit type.
//
// Imported once at startup (via `src/lib/bootstrap.ts`, pulled in from
// `src/app/layout.tsx`). Import it elsewhere to reach `env.*` in a
// type-safe way instead of poking `process.env` directly.
//
// Brand migration (2026-Q2): every STARSCREENER_* env var has a TRENDINGREPO_*
// alias. The `readEnv` helper lives in `./env-helpers` (no boot-time side
// effects). New code that just needs a single env var should import from
// `@/lib/env-helpers` directly — importing this file pulls in the Zod schema
// validation + production fail-closed throw, which test fixtures don't want.

import { z } from "zod";
import { readEnv } from "./env-helpers";

// Re-exported so legacy callers `import { readEnv } from "@/lib/env"` keep
// working. New code should use `@/lib/env-helpers`.
export { readEnv };

const EnvSchema = z.object({
  // ── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // ── Data sources ───────────────────────────────────────────────────────
  GITHUB_TOKEN: z.string().optional(),
  // Comma-separated list of ADDITIONAL PATs the github-token-pool will
  // round-robin across. Treated as additive to GITHUB_TOKEN; duplicates
  // across the two vars are deduped at parse time. See
  // src/lib/github-token-pool.ts.
  //
  // GH_TOKEN_POOL is the canonical env name (GitHub Actions reserves the
  // "GITHUB_*" prefix for system-managed secrets). GITHUB_TOKEN_POOL is
  // accepted as an alias for back-compat / dev machines.
  GH_TOKEN_POOL: z.string().optional(),
  GITHUB_TOKEN_POOL: z.string().optional(),

  // ── Revenue enrichment sync (scripts only — not read at request time) ──
  // The key is consumed by scripts/sync-trustmrr.mjs in CI. The web runtime
  // doesn't need it; overlays are served from committed JSON.
  TRUSTMRR_API_KEY: z.string().optional(),

  // ── Cron protection ────────────────────────────────────────────────────
  CRON_SECRET: z.string().min(16).optional(),

  // ── Persistence ────────────────────────────────────────────────────────
  // Both legacy STARSCREENER_* and new TRENDINGREPO_* are accepted during
  // the brand-migration transition. Resolution lives below in the derived
  // `env` object — consumers reaching `env.STARSCREENER_PERSIST` keep
  // working but new code should use `readEnv(...)` directly.
  STARSCREENER_PERSIST: z.enum(["true", "false"]).optional(),
  TRENDINGREPO_PERSIST: z.enum(["true", "false"]).optional(),
  STARSCREENER_DATA_DIR: z.string().optional(),
  TRENDINGREPO_DATA_DIR: z.string().optional(),

  // ── Future: auth + db + alerts delivery (stubbed for now) ──────────────
  DATABASE_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // ── Weekly digest cron ─────────────────────────────────────────────────
  // See `src/app/api/cron/digest/weekly/route.ts`. Master opt-in gate —
  // when unset / "false", the cron returns `{ ok: true, skipped: "disabled" }`.
  DIGEST_ENABLED: z.string().optional(),
  // Resend-verified sender, e.g. `TrendingRepo Digest <digest@domain>`.
  EMAIL_FROM: z.string().optional(),
  // Stop-gap userId → email map until accounts persist email addresses.
  // Format: `{"<userId>":"<email>"}`. Accepted as a string here and parsed
  // at runtime by `loadUserEmailMapFromEnv`.
  DIGEST_USER_EMAILS_JSON: z.string().optional(),
});

// Node coerces `process.env.X = undefined` to the string "undefined" — tests
// that try to "unset" a var via assignment leave a literal "undefined" behind.
// Treat that as actually-unset for parsing so a test that does
// `process.env.NODE_ENV = undefined` doesn't trip the strict enum check.
const _rawEnv: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(process.env)) {
  _rawEnv[k] = v === "undefined" ? undefined : v;
}
const parsed = EnvSchema.safeParse(_rawEnv);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.format(),
  );
  throw new Error(
    "Invalid environment variables — see console for details.",
  );
}

// Derived env object: keeps the legacy `STARSCREENER_*` keys readable for
// back-compat while resolving to the new TRENDINGREPO_* value when set.
// Consumers should prefer `readEnv()` for fresh code; this object is the
// snapshot at boot time and won't reflect runtime mutations.
const _data = parsed.data;
const _persistResolved =
  _data.TRENDINGREPO_PERSIST ?? _data.STARSCREENER_PERSIST ?? "true";
const _dataDirResolved =
  _data.TRENDINGREPO_DATA_DIR ?? _data.STARSCREENER_DATA_DIR;

export const env = {
  ..._data,
  // Resolve to defaults the original schema applied so consumers reading
  // env.STARSCREENER_PERSIST keep getting "true" when nothing is set.
  STARSCREENER_PERSIST: _persistResolved,
  STARSCREENER_DATA_DIR: _dataDirResolved,
  TRENDINGREPO_PERSIST: _persistResolved,
  TRENDINGREPO_DATA_DIR: _dataDirResolved,
} as const;

// Production fail-closed: GITHUB_TOKEN and CRON_SECRET are required for a real
// production boot. Skipped during `next build` (NEXT_PHASE=phase-production-build)
// because Vercel's build step doesn't have access to the same runtime env by
// default — we check again at request time via runtime handlers. Preview
// deployments can override via TRENDINGREPO_ALLOW_MISSING_ENV=true (or the
// legacy STARSCREENER_ALLOW_MISSING_ENV=true).
const IS_BUILD_PHASE =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

if (env.NODE_ENV === "production" && !IS_BUILD_PHASE) {
  const allowMissing =
    readEnv("TRENDINGREPO_ALLOW_MISSING_ENV", "STARSCREENER_ALLOW_MISSING_ENV") ===
    "true";
  const missing: string[] = [];
  if (!env.GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!env.CRON_SECRET) missing.push("CRON_SECRET");

  if (missing.length > 0) {
    if (allowMissing) {
      console.warn(
        `[env] ${missing.join(", ")} missing in production but TRENDINGREPO_ALLOW_MISSING_ENV=true — continuing with degraded surface`,
      );
    } else {
      console.error(
        `[env] Production boot aborted: missing required env vars: ${missing.join(", ")}. Set them or set TRENDINGREPO_ALLOW_MISSING_ENV=true to override.`,
      );
      throw new Error(
        `Production boot aborted: missing ${missing.join(", ")}`,
      );
    }
  }
}

export type Env = typeof env;
