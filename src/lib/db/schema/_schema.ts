// Drizzle schema namespace — `tr`.
//
// All trendingrepo tables live under the Postgres schema `tr` rather than
// `public`. This isolates them from the shared agnt-prod Supabase project
// (yzhhquzocdvqrdsbbytn), which already has a `public.referrals` table
// owned by another product. Without the schema, our migration would abort
// with `42P07 relation "referrals" already exists`.
//
// Every schema file imports `tr` from here and uses `tr.table(...)` in
// place of `pgTable(...)`. Drizzle ORM serializes queries as
// `"tr"."foo"` automatically; no search_path tweaks or schema-qualified
// query helpers are needed at the call sites.

import { pgSchema } from "drizzle-orm/pg-core";

export const tr = pgSchema("tr");
