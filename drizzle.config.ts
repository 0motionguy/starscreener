import { defineConfig } from "drizzle-kit";

// Drizzle Kit config — points to the Drizzle schema files and the Supabase
// Postgres connection string. Two URLs by design:
//   DATABASE_URL — Supavisor pooled (port 6543, transaction mode) used at
//   runtime (Vercel serverless + Railway worker).
//   DIRECT_URL  — unpooled :5432, used by `drizzle-kit migrate / generate`
//   only. PgBouncer transaction-mode breaks Drizzle migrations because
//   each statement needs to share session-level locks.
//
// In dev, set both in .env.local. In CI, only the migration job loads
// DIRECT_URL — Vercel never sees it.

const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!directUrl) {
  // Defer the failure to actual migration time so `npm run typecheck` in
  // a fresh checkout (no env vars) doesn't crash on import.
  console.warn(
    "[drizzle.config] DIRECT_URL/DATABASE_URL not set — drizzle-kit commands will fail until env is wired.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  // Glob the new schema directory only — the legacy file at
  // ./src/lib/db/schema.ts is design-time documentation (PLAN_ONLY) and
  // intentionally excluded.
  schema: "./src/lib/db/schema/**/*.ts",
  out: "./drizzle",
  dbCredentials: {
    url: directUrl ?? "postgres://placeholder@localhost/placeholder",
  },
  // Only introspect / manage tables under the `tr` schema. The shared
  // agnt-prod database has unrelated `public.*` tables owned by other
  // products (e.g. `public.referrals`); without this filter, drizzle-kit
  // would try to drop them on every push.
  schemaFilter: ["tr"],
  strict: true,
  verbose: true,
});
