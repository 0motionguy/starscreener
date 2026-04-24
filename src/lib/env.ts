// StarScreener — runtime environment validation.
//
// Validates `process.env` at boot using a strict zod schema. Unknown values
// are allowed (Next.js injects many NEXT_* vars) but every variable the app
// reads must be declared here with an explicit type.
//
// Imported once at startup (via `src/lib/bootstrap.ts`, pulled in from
// `src/app/layout.tsx`). Import it elsewhere to reach `env.*` in a
// type-safe way instead of poking `process.env` directly.

import { z } from "zod";

const EnvSchema = z.object({
  // ── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // ── Data sources ───────────────────────────────────────────────────────
  GITHUB_TOKEN: z.string().optional(),

  // ── Revenue enrichment sync (scripts only — not read at request time) ──
  // The key is consumed by scripts/sync-trustmrr.mjs in CI. The web runtime
  // doesn't need it; overlays are served from committed JSON.
  TRUSTMRR_API_KEY: z.string().optional(),

  // ── Cron protection ────────────────────────────────────────────────────
  CRON_SECRET: z.string().min(16).optional(),

  // ── Persistence ────────────────────────────────────────────────────────
  STARSCREENER_PERSIST: z.enum(["true", "false"]).default("true"),
  STARSCREENER_DATA_DIR: z.string().optional(),

  // ── Future: auth + db + alerts delivery (stubbed for now) ──────────────
  DATABASE_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "\u274c Invalid environment variables:",
    parsed.error.format(),
  );
  throw new Error(
    "Invalid environment variables \u2014 see console for details.",
  );
}

export const env = parsed.data;

// Production fail-closed: GITHUB_TOKEN and CRON_SECRET are required for a real
// production boot. Skipped during `next build` (NEXT_PHASE=phase-production-build)
// because Vercel's build step doesn't have access to the same runtime env by
// default — we check again at request time via runtime handlers. Preview
// deployments can override via STARSCREENER_ALLOW_MISSING_ENV=true.
const IS_BUILD_PHASE =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

if (env.NODE_ENV === "production" && !IS_BUILD_PHASE) {
  const allowMissing = process.env.STARSCREENER_ALLOW_MISSING_ENV === "true";
  const missing: string[] = [];
  if (!env.GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!env.CRON_SECRET) missing.push("CRON_SECRET");

  if (missing.length > 0) {
    if (allowMissing) {
      console.warn(
        `[env] ${missing.join(", ")} missing in production but STARSCREENER_ALLOW_MISSING_ENV=true \u2014 continuing with degraded surface`,
      );
    } else {
      console.error(
        `[env] Production boot aborted: missing required env vars: ${missing.join(", ")}. Set them or set STARSCREENER_ALLOW_MISSING_ENV=true to override.`,
      );
      throw new Error(
        `Production boot aborted: missing ${missing.join(", ")}`,
      );
    }
  }
}

export type Env = typeof env;
