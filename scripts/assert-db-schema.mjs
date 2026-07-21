#!/usr/bin/env node
// Post-migration schema assertion for the PG17 CI replay job.
//
// After `drizzle-kit migrate` applies every migration to a clean database,
// this asserts the load-bearing `tr` objects (and the columns this repair
// added) actually exist — so a broken/forgotten migration fails CI instead of
// production. Uses the same `postgres` driver as the app.

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[assert-db-schema] DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const REQUIRED_TABLES = [
  ["tr", "profiles"],
  ["tr", "user_tiers"],
  ["tr", "stripe_webhook_events"],
  ["tr", "watchlists"],
  ["tr", "watchlist_items"],
  ["tr", "alert_rules"],
];

const REQUIRED_COLUMNS = [
  ["tr", "user_tiers", "profile_id"], // Commit 5 additive migration
  ["tr", "stripe_webhook_events", "status"], // Commit 3 ledger
  ["tr", "stripe_webhook_events", "event_created_at"],
];

const missing = [];

try {
  for (const [schema, table] of REQUIRED_TABLES) {
    const rows = await sql`
      select 1 from information_schema.tables
      where table_schema = ${schema} and table_name = ${table} limit 1`;
    if (rows.length === 0) missing.push(`table ${schema}.${table}`);
  }
  for (const [schema, table, column] of REQUIRED_COLUMNS) {
    const rows = await sql`
      select 1 from information_schema.columns
      where table_schema = ${schema} and table_name = ${table}
        and column_name = ${column} limit 1`;
    if (rows.length === 0) missing.push(`column ${schema}.${table}.${column}`);
  }
} catch (err) {
  console.error("[assert-db-schema] query failed:", err?.message ?? String(err));
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}

await sql.end({ timeout: 5 }).catch(() => {});

if (missing.length > 0) {
  console.error("[assert-db-schema] MISSING after migration replay:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log("[assert-db-schema] OK — all required tr.* objects and columns present.");
