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

// Production-only advisories. These are recommended but not required so
// preview deployments and local smoke tests keep working.
if (env.NODE_ENV === "production") {
  if (!env.GITHUB_TOKEN) {
    console.warn(
      "[env] GITHUB_TOKEN missing \u2014 pipeline will use mock data",
    );
  }
  if (!env.CRON_SECRET) {
    console.warn(
      "[env] CRON_SECRET missing \u2014 cron endpoints unprotected",
    );
  }
}

export type Env = typeof env;
