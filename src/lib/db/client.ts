// Drizzle + postgres-js client.
//
// Singleton-cached so Vercel serverless lambdas and the Railway worker
// don't re-open connections per request. Two access points:
//
//   - `getDb()`        — pooled (Supavisor :6543, transaction mode). Use
//                         this everywhere at runtime: server components,
//                         API routes, the worker. Returns a Drizzle
//                         instance bound to the full schema barrel.
//   - `getDirectDb()`  — unpooled (:5432). Reserved for `drizzle-kit
//                         migrate/generate` paths. NEVER call from runtime
//                         code; it'll exhaust your max-connections budget.
//
// We intentionally do NOT use `@supabase/supabase-js` — Drizzle gives us
// type-safe SQL and we never expose the DB direct to the browser, so RLS
// + the JS client's REST overhead would be pure cost.

import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

// Globals reused across hot reloads in dev + warm Lambdas in prod. Without
// these, Next's dev server would open a new pool on every fast-refresh.
declare global {
  // eslint-disable-next-line no-var
  var __trendingrepo_db: DbInstance | undefined;
  // eslint-disable-next-line no-var
  var __trendingrepo_db_direct: DbInstance | undefined;
}

function buildPooled(): DbInstance {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[db.client] DATABASE_URL is not set. See docs/AUTH-SETUP.md.",
    );
  }
  const sql = postgres(url, {
    // Supabase pooler enforces SSL; postgres-js doesn't infer it from the
    // URL when sslmode= isn't present. Without this, every query throws
    // `(ESSLREQUIRED) SSL connection is required for user: postgres`.
    ssl: "require",
    // Supavisor transaction mode forbids prepared statements (each
    // statement may land on a different backend). Keep the warning quiet
    // and rely on Drizzle's parameter binding for safety.
    prepare: false,
    // Vercel serverless functions reuse warm Lambdas — bound the pool
    // tightly so a burst of requests doesn't blow Postgres' connection
    // ceiling. 1 connection per Lambda, idle-released after 20s.
    max: 1,
    idle_timeout: 20,
    // postgres-js logs every parse/bind/execute by default — too noisy.
    onnotice: () => {},
  });
  return drizzle(sql, { schema, logger: process.env.DB_LOG === "1" });
}

function buildDirect(): DbInstance {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[db.client] DIRECT_URL is not set. drizzle-kit needs the unpooled :5432 URI.",
    );
  }
  const sql = postgres(url, {
    ssl: "require",
    prepare: true, // unpooled = real session, prepared statements work
    max: 1,
    idle_timeout: 5,
    onnotice: () => {},
  });
  return drizzle(sql, { schema, logger: process.env.DB_LOG === "1" });
}

export function getDb(): DbInstance {
  if (!globalThis.__trendingrepo_db) {
    globalThis.__trendingrepo_db = buildPooled();
  }
  return globalThis.__trendingrepo_db;
}

export function getDirectDb(): DbInstance {
  if (!globalThis.__trendingrepo_db_direct) {
    globalThis.__trendingrepo_db_direct = buildDirect();
  }
  return globalThis.__trendingrepo_db_direct;
}

// Re-export the schema for ergonomic call sites:
//   import { db, schema } from "@/lib/db/client";
//   await db.select().from(schema.profiles).where(...);
export const db = new Proxy({} as DbInstance, {
  get(_, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});

export { schema };
